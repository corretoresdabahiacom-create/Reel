import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo, type UserRow } from '../users/users.repository.js';
import { enqueue, Q } from '../../queues/index.js';
import { storage, refLocation, signRef } from '../../providers/storage.js';
import { recordUsage } from '../../providers/ai/router.js';
import { withTmp } from '../../utils/ffmpeg.js';
import { AppError, notFound } from '../../utils/errors.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { analyzeBoundary, chooseTransition, normalizeOne, probeMedia, render, targetFor, TRANSITIONS, type MediaInfo, type Target, type Transition } from './engine.js';
import { mergeError, MERGE_MESSAGES } from './messages.js';

export const FLAG = 'ff_merge';
export const mergeBodySchema = z.object({
  otherProjectId: z.string().uuid(),
  order: z.enum(['this_first', 'other_first']).default('this_first'),
  transition: z.enum(['auto', ...TRANSITIONS] as [string, ...string[]]).default('auto'),
  title: z.string().trim().min(1).max(120).optional(),
}).strict();
export type MergeBody = z.infer<typeof mergeBodySchema>;
interface MergeRow { id: string; user_id: string; project_a_id: string; project_b_id: string; result_project_id: string | null; transition_type: string | null; transition_requested: string;
  analysis: Record<string, unknown>; stage: string; progress: number; status: string; error_code: string | null; duration_sec: number | null; loudness_lufs: number | null; created_at: string }
interface Src { id: string; user_id: string; title: string; script: string; source_locale: string; category: string | null; status: string; final_video_url: string | null; duration_sec: number | null; photo_refs: string[]; deleted_at: string | null }
/** Id do projeto resultante derivado da união: retry depois do upload reaproveita o mesmo arquivo (sem órfãos). */
export const resultIdFor = (mergeId: string) => { const h = createHash('sha256').update(`merge-result:${mergeId}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
export const STAGES = ['queued', 'normalize', 'analyze', 'transition', 'audio', 'finalize', 'done'] as const;

const user = async (userId: string): Promise<UserRow> => { const u = await asSystem((db) => usersRepo.byId(db, userId)); if (!u) throw notFound(); return u; };
export async function requireMerge(userId: string): Promise<UserRow> {
  const u = await user(userId); if (!(await isEnabled(FLAG, { userId, region: u.region, plan: u.plan }))) throw notFound(); return u;
}
/**
 * Dono conferido no servidor. A busca é feita como system (o RLS esconderia o projeto alheio e daria 404): o critério
 * de aceite pede 403 explícito para projeto de outro usuário. Não vaza dado nenhum — só diz que não é permitido.
 */
async function loadOwned(userId: string, ids: string[]): Promise<Src[]> {
  const rows = await asSystem(async (db) => (await db.query<Src>(`SELECT id, user_id, title, script, source_locale, category, status, final_video_url, duration_sec, photo_refs, deleted_at FROM projects WHERE id = ANY($1)`, [ids])).rows);
  const out = ids.map((id) => rows.find((r) => r.id === id && !r.deleted_at));
  if (out.some((r) => !r)) throw mergeError(404, 'project_not_found', undefined, 'not_found');
  if (out.some((r) => r!.user_id !== userId)) throw mergeError(403, 'merge_forbidden');
  return out as Src[];
}
const setStage = (id: string, stage: (typeof STAGES)[number], progress: number) => asSystem((db) => db.query(`UPDATE project_merges SET stage=$2, progress=$3, status=CASE WHEN status='queued' THEN 'processing' ELSE status END, updated_at=now() WHERE id=$1`, [id, stage, progress]));

export const mergeService = {
  /** POST /projects/:projectId/merge — valida dono, estado e duração; cria a união e enfileira. */
  async request(userId: string, projectId: string, b: MergeBody) {
    const u = await requireMerge(userId);
    if (projectId === b.otherProjectId) throw mergeError(400, 'same_project', undefined, 'bad_request');
    const [p, o] = await loadOwned(userId, [projectId, b.otherProjectId]);
    for (const x of [p!, o!]) {
      if (x.status !== 'ready' || !x.final_video_url) throw mergeError(409, 'video_not_assembled');
      if ((x.duration_sec ?? 0) > env.MERGE_INPUT_MAX_SEC) throw mergeError(422, 'input_too_long', { maxSec: env.MERGE_INPUT_MAX_SEC });
    }
    const [a, bb] = b.order === 'this_first' ? [p!, o!] : [o!, p!];
    const m = await tx({ userId }, async (db) => {
      const r = await db.query<{ id: string }>(`INSERT INTO project_merges (user_id, project_a_id, project_b_id, transition_requested, analysis) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [userId, a.id, bb.id, b.transition, { title: b.title ?? null }]);
      await audit(db, userId, 'merge.request', 'project', a.id, { mergeId: r.rows[0]!.id, other: bb.id, transition: b.transition }); return r.rows[0]!;
    });
    await enqueue(Q.mergeProjects, 'merge', { mergeId: m.id, userId }, { plan: u.plan, userId, jobId: `merge-${m.id}` });
    return { mergeId: m.id, status: 'queued', stage: 'queued', projectAId: a.id, projectBId: bb.id };
  },

  /** 1) Mesma resolução/FPS/codec/áudio e mesmo nível nas duas partes. */
  async normalizeInputs(files: [string, string], dir: string): Promise<{ a: string; b: string; target: Target; info: [MediaInfo, MediaInfo] }> {
    const [ia, ib] = [await probeMedia(files[0]), await probeMedia(files[1])];
    if (ia.duration > env.MERGE_INPUT_MAX_SEC + 0.5 || ib.duration > env.MERGE_INPUT_MAX_SEC + 0.5) throw mergeError(422, 'input_too_long', { maxSec: env.MERGE_INPUT_MAX_SEC });
    const target = targetFor(ia, ib);
    return { a: await normalizeOne(files[0], ia, target, dir, 'norm-a'), b: await normalizeOne(files[1], ib, target, dir, 'norm-b'), target, info: [ia, ib] };
  },
  /** 2) Transição: analisa luz, cor e movimento na emenda; `requested` diferente de 'auto' força o tipo. */
  async generateTransition(a: string, durA: number, b: string, requested: string, ctx: { userId: string; projectId: string }) {
    const t0 = Date.now(); const analysis = await analyzeBoundary(a, durA, b); const auto = chooseTransition(analysis);
    const chosen = requested === 'auto' ? auto : { type: requested as Transition, durationSec: 0.8, reason: 'escolhida pelo usuário' };
    await recordUsage({ provider: 'local', operation: 'merge_transition', costCents: 0, latencyMs: Date.now() - t0, userId: ctx.userId, projectId: ctx.projectId, status: 'ok' });
    return { ...chosen, analysis, suggested: auto.type };
  },
  /** Worker `merge-projects`: normaliza → analisa → transição → áudio → cria o projeto resultante. Idempotente. */
  async mergeProjects(d: { mergeId: string; userId: string }, isFinal: boolean) {
    const m = await asSystem(async (db) => (await db.query<MergeRow>('SELECT * FROM project_merges WHERE id=$1', [d.mergeId])).rows[0]);
    if (!m || m.status === 'done') return { skipped: true };
    const t0 = Date.now();
    try {
      const [a, b] = await loadOwned(m.user_id, [m.project_a_id, m.project_b_id]); // dono conferido de novo no worker
      const ctx = { userId: m.user_id, projectId: a!.id };
      const r = await withTmp(async (dir) => {
        const fa = join(dir, 'a.mp4'), fb = join(dir, 'b.mp4');
        for (const [ref, f] of [[a!.final_video_url!, fa], [b!.final_video_url!, fb]] as const) { const l = refLocation(ref); await writeFile(f, await storage.get(l.bucket, l.key)); } // só leitura dos originais
        await setStage(m.id, 'normalize', 10); const n = await this.normalizeInputs([fa, fb], dir);
        await setStage(m.id, 'analyze', 40); const durA = (await probeMedia(n.a)).duration;
        const tr = await this.generateTransition(n.a, durA, n.b, m.transition_requested, ctx);
        await setStage(m.id, 'transition', 55); await setStage(m.id, 'audio', 70);
        const out = await render(n.a, durA, n.b, tr, dir);
        await setStage(m.id, 'finalize', 90); const info = await probeMedia(out.out);
        if (info.duration > env.MERGE_MAX_SEC + 0.5) throw mergeError(422, 'input_too_long', { maxSec: env.MERGE_MAX_SEC });
        await recordUsage({ provider: 'local', operation: 'merge_render', costCents: 0, latencyMs: Date.now() - t0, userId: ctx.userId, projectId: ctx.projectId, status: 'ok' });
        const key = `projects/${resultIdFor(m.id)}/merged-${m.id}.mp4`; await storage.put('videos', key, await readFile(out.out), 'video/mp4'); // arquivo NOVO; originais intactos
        return { key, lufs: out.lufs, duration: info.duration, tr, target: n.target, inputs: n.info };
      });
      const result = await asSystem(async (db) => {
        const cur = (await db.query<{ result_project_id: string | null }>('SELECT result_project_id FROM project_merges WHERE id=$1 FOR UPDATE', [m.id])).rows[0];
        if (cur?.result_project_id) return cur.result_project_id;
        const title = (m.analysis as { title?: string | null }).title || `${a!.title} + ${b!.title}`.slice(0, 120);
        const p = await db.query<{ id: string }>(`INSERT INTO projects (id, user_id, title, script, source_locale, category, status, versions, duration_sec, photo_refs, final_video_url)
          VALUES ($1,$2,$3,$4,$5,$6,'ready',ARRAY['merge'],$7,$8,$9) ON CONFLICT (id) DO UPDATE SET final_video_url=EXCLUDED.final_video_url RETURNING id`,
          [resultIdFor(m.id), m.user_id, title, `${a!.script}\n\n${b!.script}`.slice(0, 8000), a!.source_locale, a!.category, Math.round(r.duration), [...new Set([...a!.photo_refs, ...b!.photo_refs])].slice(0, 20), r.key]);
        await db.query(`UPDATE project_merges SET status='done', stage='done', progress=100, result_project_id=$2, transition_type=$3, analysis=analysis || $4::jsonb, duration_sec=$5, loudness_lufs=$6, error_code=NULL, updated_at=now() WHERE id=$1`,
          [m.id, p.rows[0]!.id, r.tr.type, JSON.stringify({ measures: r.tr.analysis, reason: r.tr.reason, suggested: r.tr.suggested, target: r.target, inputs: r.inputs.map((x) => ({ width: x.width, height: x.height, fps: x.fps, sampleRate: x.sampleRate, channels: x.channels, hasAudio: x.hasAudio })) }), r.duration, r.lufs]);
        await audit(db, m.user_id, 'merge.done', 'project', p.rows[0]!.id, { mergeId: m.id, transition: r.tr.type }); return p.rows[0]!.id;
      });
      logger.info({ mergeId: m.id, resultProjectId: result, transition: r.tr.type, durationSec: r.duration, ms: Date.now() - t0 }, 'união de vídeos concluída'); // R7
      return { ok: true, resultProjectId: result };
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'merge_failed';
      if (isFinal || (err instanceof AppError && err.status < 500)) {
        await asSystem((db) => db.query(`UPDATE project_merges SET status='failed', error_code=$2, updated_at=now() WHERE id=$1`, [m.id, code]));
        logger.warn({ mergeId: m.id, code }, 'união de vídeos falhou');
        if (err instanceof AppError && err.status < 500) return { ok: false, code };
      }
      throw err;
    }
  },
  async status(userId: string, projectId: string, mergeId: string) {
    await requireMerge(userId);
    const m = await asUser(userId, async (db) => (await db.query<MergeRow>('SELECT * FROM project_merges WHERE id=$1 AND (project_a_id=$2 OR project_b_id=$2)', [mergeId, projectId])).rows[0]);
    if (!m) throw mergeError(404, 'merge_not_found', undefined, 'not_found');
    const res = m.result_project_id ? await asUser(userId, async (db) => (await db.query<{ final_video_url: string | null }>('SELECT final_video_url FROM projects WHERE id=$1', [m.result_project_id])).rows[0]) : null;
    return { mergeId: m.id, status: m.status, stage: m.stage, progress: m.progress, stages: STAGES, errorCode: m.error_code, projectAId: m.project_a_id, projectBId: m.project_b_id,
      resultProjectId: m.result_project_id, transition: m.transition_type, transitionRequested: m.transition_requested, durationSec: m.duration_sec, loudnessLufs: m.loudness_lufs,
      reason: (m.analysis as { reason?: string }).reason ?? null, measures: (m.analysis as { measures?: unknown }).measures ?? null,
      resultVideoUrl: res?.final_video_url ? await signRef(res.final_video_url, env.MERGE_URL_TTL_SEC) : null, urlExpiresInSec: env.MERGE_URL_TTL_SEC };
  },
  async list(userId: string) {
    await requireMerge(userId);
    const rows = await asUser(userId, async (db) => (await db.query<MergeRow>('SELECT * FROM project_merges WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [userId])).rows);
    return { items: rows.map((m) => ({ mergeId: m.id, status: m.status, stage: m.stage, progress: m.progress, projectAId: m.project_a_id, projectBId: m.project_b_id, resultProjectId: m.result_project_id, transition: m.transition_type, durationSec: m.duration_sec, createdAt: m.created_at })) };
  },
  config: async (userId: string) => { await requireMerge(userId); return { transitions: ['auto', ...TRANSITIONS], maxSec: env.MERGE_MAX_SEC, inputMaxSec: env.MERGE_INPUT_MAX_SEC, messages: MERGE_MESSAGES }; },
};
