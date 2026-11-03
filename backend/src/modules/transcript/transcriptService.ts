import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { enqueue, Q } from '../../queues/index.js';
import { storage, refLocation, signRef } from '../../providers/storage.js';
import { recordUsage } from '../../providers/ai/router.js';
import { withTmp } from '../../utils/ffmpeg.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { AppError, notFound } from '../../utils/errors.js';
import { extractAudio } from '../audio/analysis.js';
import { transcribeAudio, sttProviderName, type Word } from './stt.js';
import { applyRendered, render, sceneSpans, textsByScene, wordsAfter, type EditOp, type RenderResult, type SceneRow } from './edits.js';
import { trError, TRANSCRIPT_MESSAGES } from './messages.js';

/**
 * Módulo 9 — Transcrição (`ff_transcript`): `transcribe`, `applyTranscriptEdit` (+ prévia, aplicar, descartar).
 * - A transcrição é dado sensível: fica CIFRADA (AES-256-GCM) em `transcripts.segments_json`, expira em
 *   TRANSCRIPT_RETENTION_DAYS (90 d) e sai junto com o projeto. Nunca vai para log, auditoria nem mensagem de erro.
 * - Editar pelo texto: apagar palavras → corte; substituir → TTS no ponto. Sempre em staging (prévia) e só vira versão nova
 *   ao aplicar: novas linhas em `scenes` com `derived_from_scene_id` + vídeo novo; o original fica no storage.
 */
export const FLAG = 'ff_transcript';
export const editBodySchema = z.object({
  transcriptId: z.string().uuid(),
  ops: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('delete'), fromWord: z.number().int().min(0), toWord: z.number().int().min(0) }).strict(),
    z.object({ type: z.literal('replace'), fromWord: z.number().int().min(0), toWord: z.number().int().min(0), text: z.string().trim().min(1).max(200) }).strict(),
  ])).min(1).max(30),
}).strict();
interface Stored { words: Word[] }
interface TRow { id: string; project_id: string; user_id: string; language: string; segments_json: { v?: number; enc?: string }; source_video_key: string; status: string; provider: string | null; word_count: number; duration_ms: number | null; error_code: string | null; expires_at: string; created_at: string }
interface ERow { id: string; project_id: string; user_id: string; transcript_id: string; ops_json: EditOp[]; status: string; error_code: string | null; preview_video_key: string | null; result_json: { enc?: string } | null; previous_video_key: string | null; applied_at: string | null; created_at: string }
interface PRow { id: string; user_id: string; status: string; final_video_url: string | null; source_locale: string; deleted_at: string | null }

const seal = (o: unknown) => ({ v: 1, enc: encrypt(JSON.stringify(o)) });
const open = <T>(o: { enc?: string } | null): T | null => (o?.enc ? (JSON.parse(decrypt(o.enc)) as T) : null);
const expires = () => new Date(Date.now() + env.TRANSCRIPT_RETENTION_DAYS * 86400_000);
const userOf = async (userId: string) => { const u = await asSystem(async (db) => (await db.query<{ region: string; plan: string }>('SELECT region, plan FROM users WHERE id=$1', [userId])).rows[0]); if (!u) throw notFound(); return u; };
export async function requireTranscript(userId: string) { const u = await userOf(userId); if (!(await isEnabled(FLAG, { userId, ...u }))) throw notFound(); }
export async function ownedReady(userId: string, projectId: string): Promise<PRow> {
  const p = await asUser(userId, async (db) => (await db.query<PRow>('SELECT id, user_id, status, final_video_url, source_locale, deleted_at FROM projects WHERE id=$1', [projectId])).rows[0]);
  if (!p || p.deleted_at) throw trError(404, 'project_not_found', undefined, 'not_found');
  if (p.status !== 'ready' || !p.final_video_url) throw trError(409, 'video_not_assembled'); return p;
}
export const currentScenes = (projectId: string) => asSystem(async (db) => (await db.query<SceneRow>(`SELECT DISTINCT ON (index) id, index, text, duration_sec FROM scenes WHERE project_id=$1 ORDER BY index, selected DESC, version DESC`, [projectId])).rows);
/** Transcrição mais recente pronta (decifrada). `outdated`: o vídeo mudou depois dela. */
export async function latestTranscript(userId: string, projectId: string): Promise<{ row: TRow; words: Word[]; outdated: boolean } | null> {
  const r = await asUser(userId, async (db) => (await db.query<TRow>(`SELECT * FROM transcripts WHERE project_id=$1 AND status='done' AND expires_at > now() ORDER BY created_at DESC LIMIT 1`, [projectId])).rows[0]);
  if (!r) return null; const p = await asSystem(async (db) => (await db.query<{ final_video_url: string | null }>('SELECT final_video_url FROM projects WHERE id=$1', [projectId])).rows[0]);
  return { row: r, words: open<Stored>(r.segments_json)?.words ?? [], outdated: r.source_video_key !== p?.final_video_url };
}
const segmentsOf = (words: Word[]) => { const m = new Map<number, { scene: number; start: number; end: number; from: number; to: number; text: string[] }>();
  words.forEach((x, i) => { const s = m.get(x.scene) ?? { scene: x.scene, start: x.start, end: x.end, from: i, to: i, text: [] }; s.end = x.end; s.to = i; s.text.push(x.w); m.set(x.scene, s); });
  return [...m.values()].map((s) => ({ ...s, text: s.text.join(' ') })); };
/** Transcrição derivada do vídeo novo (sem chamar o provedor): as palavras andam com os cortes. */
export async function saveDerivedTranscript(db: import('pg').PoolClient, o: { projectId: string; userId: string; language: string; videoKey: string; words: Word[]; durationMs: number }) {
  await db.query(`INSERT INTO transcripts (project_id, user_id, language, segments_json, source_video_key, provider, status, word_count, duration_ms, expires_at) VALUES ($1,$2,$3,$4,$5,'derived','done',$6,$7,$8)`,
    [o.projectId, o.userId, o.language, seal({ words: o.words }), o.videoKey, o.words.length, o.durationMs, expires()]);
}

export const transcriptService = {
  /** POST /projects/:projectId/transcript — enfileira a transcrição do vídeo atual (20/h por usuário na rota). */
  async transcribe(userId: string, projectId: string) {
    await requireTranscript(userId); const p = await ownedReady(userId, projectId);
    const r = await tx({ userId }, async (db) => {
      const row = (await db.query<{ id: string }>('INSERT INTO transcripts (project_id, user_id, language, source_video_key, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id', [projectId, userId, p.source_locale, p.final_video_url, expires()])).rows[0]!;
      await audit(db, userId, 'transcript.request', 'project', projectId, { transcriptId: row.id }); return row;
    });
    await enqueue(Q.transcriptGenerate, 'transcribe', { transcriptId: r.id, userId }, { userId, jobId: `tr-${r.id}` });
    return { transcriptId: r.id, status: 'queued', retentionDays: env.TRANSCRIPT_RETENTION_DAYS };
  },
  /** Worker `transcript-generate` (transcrever). Idempotente. */
  async processTranscribe(d: { transcriptId: string; userId: string }, isFinal: boolean) {
    const r = await asSystem(async (db) => (await db.query<TRow>('SELECT * FROM transcripts WHERE id=$1', [d.transcriptId])).rows[0]);
    if (!r || r.status === 'done') return { skipped: true };
    await asSystem((db) => db.query(`UPDATE transcripts SET status='processing', updated_at=now() WHERE id=$1`, [r.id]));
    const t0 = Date.now(); const provider = sttProviderName();
    try {
      const res = await withTmp(async (dir) => {
        const f = join(dir, 'v.mp4'); const l = refLocation(r.source_video_key); const buf = await storage.get(l.bucket, l.key); await writeFile(f, buf);
        const { ffprobeDuration } = await import('../../utils/ffmpeg.js'); const durMs = Math.round((await ffprobeDuration(f)) * 1000);
        const spans = sceneSpans(await currentScenes(r.project_id), durMs);
        const audio = await extractAudio(f, dir);
        const out = await transcribeAudio(audio, spans, r.language);
        return { out, durMs, sha: createHash('sha256').update(buf).digest('hex') };
      });
      await recordUsage({ provider, operation: 'stt', costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: r.project_id, status: 'ok' });
      await asSystem((db) => db.query(`UPDATE transcripts SET status='done', segments_json=$2, provider=$3, word_count=$4, duration_ms=$5, source_sha256=$6, error_code=NULL, updated_at=now() WHERE id=$1`,
        [r.id, seal({ words: res.out.words }), res.out.provider, res.out.words.length, res.durMs, res.sha]));
      logger.info({ transcriptId: r.id, words: res.out.words.length, provider, ms: Date.now() - t0 }, 'transcrição concluída'); // só contagem; o texto NUNCA vai para log
      return { ok: true };
    } catch {
      await recordUsage({ provider, operation: 'stt', costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: r.project_id, status: 'error' }).catch(() => undefined);
      if (isFinal) { await asSystem((db) => db.query(`UPDATE transcripts SET status='failed', error_code='stt_unavailable', updated_at=now() WHERE id=$1`, [r.id])); logger.warn({ transcriptId: r.id, code: 'stt_unavailable' }, 'transcrição falhou'); }
      else await asSystem((db) => db.query(`UPDATE transcripts SET status='queued', updated_at=now() WHERE id=$1`, [r.id]));
      throw new Error('stt_failed'); // mensagem sem conteúdo (o erro do provedor poderia ecoar trechos)
    }
  },
  /** GET /projects/:projectId/transcript — a mais recente (com palavras e tempos). */
  async get(userId: string, projectId: string) {
    await requireTranscript(userId);
    const last = await asUser(userId, async (db) => (await db.query<TRow>('SELECT * FROM transcripts WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1', [projectId])).rows[0]);
    if (!last) throw trError(404, 'transcript_not_found', undefined, 'not_found');
    if (last.status !== 'done') return { transcriptId: last.id, status: last.status, errorCode: last.error_code };
    const t = await latestTranscript(userId, projectId); if (!t) throw trError(404, 'transcript_not_found', undefined, 'not_found');
    return { transcriptId: t.row.id, status: 'done', language: t.row.language, provider: t.row.provider, outdated: t.outdated, expiresAt: t.row.expires_at, durationMs: t.row.duration_ms,
      words: t.words.map((x, i) => ({ i, w: x.w, start: x.start, end: x.end, scene: x.scene })), segments: segmentsOf(t.words) };
  },
  /** POST /projects/:projectId/transcript/edits — apagar/substituir palavras → operações em tempo → prévia na fila. */
  async applyTranscriptEdit(userId: string, projectId: string, b: z.infer<typeof editBodySchema>) {
    await requireTranscript(userId); await ownedReady(userId, projectId);
    const t = await latestTranscript(userId, projectId);
    if (!t || t.row.id !== b.transcriptId) throw trError(404, 'transcript_not_found', undefined, 'not_found');
    if (t.outdated) throw trError(409, 'transcript_outdated');
    const W = t.words; const ops: EditOp[] = [];
    for (const o of b.ops) {
      if (o.fromWord > o.toWord || o.toWord >= W.length) throw trError(422, 'invalid_range');
      const a = W[o.fromWord]!, z2 = W[o.toWord]!, prev = W[o.fromWord - 1], next = W[o.toWord + 1];
      if (o.type === 'delete') ops.push({ type: 'cut', startMs: prev ? Math.round((prev.end + a.start) / 2) : Math.max(0, a.start - 60), endMs: next ? Math.round((z2.end + next.start) / 2) : z2.end + 60 });
      else ops.push({ type: 'replace', startMs: a.start, endMs: Math.max(z2.end, a.start + 250), text: o.text });
    }
    const e = await tx({ userId }, async (db) => {
      const row = (await db.query<{ id: string }>('INSERT INTO transcript_edits (project_id, user_id, transcript_id, ops_json) VALUES ($1,$2,$3,$4) RETURNING id', [projectId, userId, t.row.id, JSON.stringify(ops)])).rows[0]!;
      await audit(db, userId, 'transcript.edit.request', 'project', projectId, { editId: row.id, cuts: ops.filter((x) => x.type === 'cut').length, replaces: ops.filter((x) => x.type === 'replace').length }); return row;
    });
    await enqueue(Q.transcriptGenerate, 'edit', { editId: e.id, userId }, { userId, jobId: `tre-${e.id}` });
    return { editId: e.id, status: 'queued', ops: ops.map((o) => ({ type: o.type, startMs: o.startMs, endMs: o.endMs })) };
  },
  /** Worker `transcript-generate` (prévia da edição). */
  async processEdit(d: { editId: string; userId: string }, isFinal: boolean) {
    const e = await asSystem(async (db) => (await db.query<ERow>('SELECT * FROM transcript_edits WHERE id=$1', [d.editId])).rows[0]);
    if (!e || e.status !== 'queued' && e.status !== 'processing') return { skipped: true };
    await asSystem((db) => db.query(`UPDATE transcript_edits SET status='processing', updated_at=now() WHERE id=$1`, [e.id]));
    const t0 = Date.now();
    try {
      const tr = await asSystem(async (db) => (await db.query<TRow>('SELECT * FROM transcripts WHERE id=$1', [e.transcript_id])).rows[0]!);
      const p = await asSystem(async (db) => (await db.query<PRow>('SELECT id, user_id, status, final_video_url, source_locale, deleted_at FROM projects WHERE id=$1', [e.project_id])).rows[0]);
      if (!p || p.final_video_url !== tr.source_video_key) throw trError(409, 'source_changed');
      const words = open<Stored>(tr.segments_json)?.words ?? []; const after = wordsAfter(words, e.ops_json);
      const result = await render({ sourceKey: tr.source_video_key, ops: e.ops_json, scenes: await currentScenes(e.project_id), sceneTexts: textsByScene(after), locale: tr.language, outPrefix: `projects/${e.project_id}/edits/tr-${e.id}`, ctx: { userId: e.user_id, projectId: e.project_id } });
      await recordUsage({ provider: 'local', operation: 'video_edit', costCents: 0, latencyMs: Date.now() - t0, userId: e.user_id, projectId: e.project_id, status: 'ok' });
      await asSystem((db) => db.query(`UPDATE transcript_edits SET status='previewed', preview_video_key=$2, result_json=$3, error_code=NULL, updated_at=now() WHERE id=$1`, [e.id, result.videoKey, seal({ result, words: after })]));
      logger.info({ editId: e.id, removedMs: result.removedMs, scenes: result.scenes.length, ms: Date.now() - t0 }, 'prévia de edição por transcrição');
      return { ok: true };
    } catch (err) {
      const definitive = err instanceof AppError && err.status < 500; const code = err instanceof AppError ? err.code : 'edit_failed';
      if (isFinal || definitive) { await asSystem((db) => db.query(`UPDATE transcript_edits SET status='failed', error_code=$2, updated_at=now() WHERE id=$1`, [e.id, code])); logger.warn({ editId: e.id, code }, 'edição por transcrição falhou'); if (definitive) return { ok: false, code }; }
      else await asSystem((db) => db.query(`UPDATE transcript_edits SET status='queued', updated_at=now() WHERE id=$1`, [e.id]));
      throw err;
    }
  },
  async editStatus(userId: string, projectId: string, editId: string) {
    await requireTranscript(userId);
    const e = await asUser(userId, async (db) => (await db.query<ERow>('SELECT * FROM transcript_edits WHERE id=$1 AND project_id=$2', [editId, projectId])).rows[0]);
    if (!e) throw trError(404, 'edit_not_found', undefined, 'not_found'); const r = open<{ result: RenderResult }>(e.result_json)?.result;
    return { editId: e.id, status: e.status, errorCode: e.error_code, ops: e.ops_json.map((o) => ({ type: o.type, startMs: o.startMs, endMs: o.endMs })), durationMs: r?.durationMs ?? null, removedMs: r?.removedMs ?? null,
      affectedScenes: r?.scenes.map((s) => s.index) ?? [], previewUrl: e.preview_video_key ? await signRef(e.preview_video_key, env.EDIT_URL_TTL_SEC) : null, appliedAt: e.applied_at };
  },
  /** Aplicar = versão nova (cenas derivadas + vídeo novo). A transcrição acompanha o vídeo novo sem chamar o provedor. */
  async apply(userId: string, projectId: string, editId: string) {
    await requireTranscript(userId);
    const e = await asUser(userId, async (db) => (await db.query<ERow>('SELECT * FROM transcript_edits WHERE id=$1 AND project_id=$2', [editId, projectId])).rows[0]);
    if (!e) throw trError(404, 'edit_not_found', undefined, 'not_found'); if (e.status === 'applied') throw trError(409, 'already_applied'); if (e.status !== 'previewed') throw trError(409, 'edit_not_ready');
    const sealed = open<{ result: RenderResult; words: Word[] }>(e.result_json)!; const tr = await asSystem(async (db) => (await db.query<TRow>('SELECT language, source_video_key FROM transcripts WHERE id=$1', [e.transcript_id])).rows[0]!);
    const out = await tx({ userId }, async (db) => {
      const a = await applyRendered(db, { projectId, userId, expectedSource: tr.source_video_key, result: sealed.result, action: 'transcript.edit.apply', refId: e.id });
      await db.query(`UPDATE transcript_edits SET status='applied', applied_at=now(), applied_by=$2, previous_video_key=$3, updated_at=now() WHERE id=$1`, [e.id, userId, a.previousVideoKey]);
      await saveDerivedTranscript(db, { projectId, userId, language: tr.language, videoKey: sealed.result.videoKey, words: sealed.words as Word[], durationMs: sealed.result.durationMs });
      return a;
    });
    return { editId: e.id, status: 'applied', derivedSceneIds: out.derivedSceneIds, durationMs: sealed.result.durationMs, previousVideoKept: true };
  },
  async discard(userId: string, projectId: string, editId: string) {
    await requireTranscript(userId);
    const n = await asUser(userId, async (db) => (await db.query<{ id: string }>(`UPDATE transcript_edits SET status='discarded', updated_at=now() WHERE id=$1 AND project_id=$2 AND status IN ('queued','previewed','failed') RETURNING id`, [editId, projectId])).rowCount);
    if (!n) throw trError(404, 'edit_not_found', undefined, 'not_found');
  },
  /** Job diário `transcript-retention`: apaga transcrições vencidas e as de projetos excluídos. */
  async purgeExpired(): Promise<{ deleted: number }> {
    const n = await asSystem(async (db) => (await db.query(`DELETE FROM transcripts t USING projects p WHERE p.id = t.project_id AND (t.expires_at < now() OR p.deleted_at IS NOT NULL)`)).rowCount ?? 0);
    if (n) logger.info({ deleted: n }, 'transcrições vencidas apagadas'); return { deleted: n };
  },
  config: async (userId: string) => { await requireTranscript(userId); return { retentionDays: env.TRANSCRIPT_RETENTION_DAYS, provider: sttProviderName(), trainingOptOut: true, limits: { transcribePerHour: 20 }, messages: TRANSCRIPT_MESSAGES }; },
};
