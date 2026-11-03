import { z } from 'zod';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { enqueue, Q } from '../../queues/index.js';
import { signRef } from '../../providers/storage.js';
import { recordUsage } from '../../providers/ai/router.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { AppError, notFound } from '../../utils/errors.js';
import { ffprobeDuration, withTmp, writeFile } from '../../utils/ffmpeg.js';
import { storage, refLocation } from '../../providers/storage.js';
import { applyRendered, render, sceneSpans, textsByScene, wordsAfter, type RenderResult } from '../transcript/edits.js';
import { currentScenes, latestTranscript, ownedReady, saveDerivedTranscript } from '../transcript/transcriptService.js';
import { trError } from '../transcript/messages.js';
import type { Word } from '../transcript/stt.js';
import { plan as makePlan, type Plan } from './planner.js';

/**
 * Módulo 9 — Edição agêntica (`ff_agent`): `plan` → `execute` (prévia/staging na fila `agent-execute`) → `apply`.
 * - O agente NUNCA aplica sozinho: `apply` exige `confirm: true` e uma prévia pronta; aplicar cria versões novas de cena
 *   (`derived_from_scene_id`) e um vídeo novo (o original fica no storage).
 * - `agent_runs` guarda o comando, o plano e a aplicação (quem, quando). O comando é do usuário; nunca vai para log.
 * - Limite: `execute` 10/h por usuário (na rota). `ai_usage`: `agent_plan` e `video_edit`.
 */
export const FLAG = 'ff_agent';
export const planBodySchema = z.object({ command: z.string().trim().min(2).max(500) }).strict();
interface RRow { id: string; project_id: string; user_id: string; command: string; plan_json: Plan & { transcriptId?: string | null; sourceKey: string }; applied: boolean; status: string; error_code: string | null; preview_video_key: string | null; result_json: { enc?: string } | null; applied_by: string | null; applied_at: string | null; created_at: string }
const seal = (o: unknown) => ({ v: 1, enc: encrypt(JSON.stringify(o)) });
const open = <T>(o: { enc?: string } | null): T | null => (o?.enc ? (JSON.parse(decrypt(o.enc)) as T) : null);
export async function requireAgent(userId: string) { const u = await asSystem(async (db) => (await db.query<{ region: string; plan: string }>('SELECT region, plan FROM users WHERE id=$1', [userId])).rows[0]); if (!u || !(await isEnabled(FLAG, { userId, ...u }))) throw notFound(); }
const getRun = async (userId: string, projectId: string, runId: string) => { const r = await asUser(userId, async (db) => (await db.query<RRow>('SELECT * FROM agent_runs WHERE id=$1 AND project_id=$2', [runId, projectId])).rows[0]); if (!r) throw trError(404, 'run_not_found', undefined, 'not_found'); return r; };

export const agentService = {
  /** Comando → plano em staging (nada muda no projeto). */
  async plan(userId: string, projectId: string, command: string) {
    await requireAgent(userId); const p = await ownedReady(userId, projectId); const t0 = Date.now();
    const durMs = await withTmp(async (dir) => { const f = `${dir}/v.mp4`; const l = refLocation(p.final_video_url!); await writeFile(f, await storage.get(l.bucket, l.key)); return Math.round((await ffprobeDuration(f)) * 1000); });
    const t = await latestTranscript(userId, projectId); const words = t && !t.outdated ? t.words : null;
    const pl = makePlan(command, { durationMs: durMs, scenes: sceneSpans(await currentScenes(projectId), durMs), words });
    await recordUsage({ provider: env.AI_AGENT_PROVIDER, operation: 'agent_plan', costCents: 0, latencyMs: Date.now() - t0, userId, projectId, status: 'ok' });
    const row = await tx({ userId }, async (db) => {
      const r = (await db.query<RRow>(`INSERT INTO agent_runs (project_id, user_id, command, plan_json, status) VALUES ($1,$2,$3,$4,'planned') RETURNING *`, [projectId, userId, command, { ...pl, transcriptId: words ? t!.row.id : null, sourceKey: p.final_video_url }])).rows[0]!;
      await audit(db, userId, 'agent.plan', 'project', projectId, { runId: r.id, steps: pl.steps.length, understood: pl.understood }); return r; // sem o texto do comando
    });
    return this.dto(row);
  },
  /** Gera a prévia (staging) na fila. 10/h por usuário na rota. */
  async execute(userId: string, projectId: string, runId: string) {
    await requireAgent(userId); const r = await getRun(userId, projectId, runId);
    if (!r.plan_json.understood || !r.plan_json.steps.length) throw trError(422, 'plan_empty');
    if (r.status !== 'planned' && r.status !== 'failed') return this.dto(r);
    await asUser(userId, (db) => db.query(`UPDATE agent_runs SET status='queued', error_code=NULL, updated_at=now() WHERE id=$1`, [r.id]));
    await enqueue(Q.agentExecute, 'execute', { runId: r.id, userId }, { userId, jobId: `ag-${r.id}-${Date.now()}` });
    return { ...(await this.dto({ ...r, status: 'queued' })) };
  },
  /** Worker `agent-execute`: renderiza a prévia. Idempotente (prévia pronta não é refeita). */
  async process(d: { runId: string; userId: string }, isFinal: boolean) {
    const r = await asSystem(async (db) => (await db.query<RRow>('SELECT * FROM agent_runs WHERE id=$1', [d.runId])).rows[0]);
    if (!r || !['queued', 'processing'].includes(r.status)) return { skipped: true };
    await asSystem((db) => db.query(`UPDATE agent_runs SET status='processing', updated_at=now() WHERE id=$1`, [r.id])); const t0 = Date.now();
    try {
      const p = await asSystem(async (db) => (await db.query<{ final_video_url: string | null; source_locale: string }>('SELECT final_video_url, source_locale FROM projects WHERE id=$1', [r.project_id])).rows[0]);
      if (!p || p.final_video_url !== r.plan_json.sourceKey) throw trError(409, 'source_changed');
      const ops = r.plan_json.steps.map((s) => s.op);
      let words: Word[] = []; if (r.plan_json.transcriptId) { const tr = await asSystem(async (db) => (await db.query<{ segments_json: { enc?: string } }>('SELECT segments_json FROM transcripts WHERE id=$1', [r.plan_json.transcriptId])).rows[0]); words = open<{ words: Word[] }>(tr?.segments_json ?? null)?.words ?? []; }
      const scenes = await currentScenes(r.project_id); const after = words.length ? wordsAfter(words, ops) : [];
      const texts = after.length ? textsByScene(after) : new Map<number, string>();
      const result = await render({ sourceKey: r.plan_json.sourceKey, ops, scenes, sceneTexts: texts, locale: p.source_locale, outPrefix: `projects/${r.project_id}/edits/ag-${r.id}`, ctx: { userId: r.user_id, projectId: r.project_id } });
      await recordUsage({ provider: 'local', operation: 'video_edit', costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: r.project_id, status: 'ok' });
      await asSystem((db) => db.query(`UPDATE agent_runs SET status='previewed', preview_video_key=$2, result_json=$3, error_code=NULL, updated_at=now() WHERE id=$1`, [r.id, result.videoKey, seal({ result, words: after, language: p.source_locale })]));
      logger.info({ runId: r.id, steps: ops.length, removedMs: result.removedMs, ms: Date.now() - t0 }, 'prévia do agente pronta'); return { ok: true };
    } catch (err) {
      const definitive = err instanceof AppError && err.status < 500; const code = err instanceof AppError ? err.code : 'edit_failed';
      if (isFinal || definitive) { await asSystem((db) => db.query(`UPDATE agent_runs SET status='failed', error_code=$2, updated_at=now() WHERE id=$1`, [r.id, code])); logger.warn({ runId: r.id, code }, 'execução do agente falhou'); if (definitive) return { ok: false, code }; }
      else await asSystem((db) => db.query(`UPDATE agent_runs SET status='queued', updated_at=now() WHERE id=$1`, [r.id]));
      throw err;
    }
  },
  /** Aplica a prévia — SÓ com confirmação explícita. */
  async apply(userId: string, projectId: string, runId: string, confirm: boolean) {
    await requireAgent(userId); const r = await getRun(userId, projectId, runId);
    if (r.applied) throw trError(409, 'already_applied'); if (r.status !== 'previewed') throw trError(409, 'edit_not_ready');
    if (confirm !== true) throw trError(422, 'confirmation_required');
    const sealed = open<{ result: RenderResult; words: Word[]; language: string }>(r.result_json)!;
    const out = await tx({ userId }, async (db) => {
      const a = await applyRendered(db, { projectId, userId, expectedSource: r.plan_json.sourceKey, result: sealed.result, action: 'agent.apply', refId: r.id });
      await db.query(`UPDATE agent_runs SET status='applied', applied=true, applied_by=$2, applied_at=now(), previous_video_key=$3, updated_at=now() WHERE id=$1`, [r.id, userId, a.previousVideoKey]);
      if (sealed.words.length) await saveDerivedTranscript(db, { projectId, userId, language: sealed.language, videoKey: sealed.result.videoKey, words: sealed.words, durationMs: sealed.result.durationMs });
      return a;
    });
    return { ...(await this.dto((await getRun(userId, projectId, runId)))), derivedSceneIds: out.derivedSceneIds };
  },
  async discard(userId: string, projectId: string, runId: string) {
    await requireAgent(userId); const r = await getRun(userId, projectId, runId); if (r.applied) throw trError(409, 'already_applied');
    await asUser(userId, (db) => db.query(`UPDATE agent_runs SET status='discarded', updated_at=now() WHERE id=$1`, [r.id]));
  },
  async get(userId: string, projectId: string, runId: string) { await requireAgent(userId); return this.dto(await getRun(userId, projectId, runId)); },
  async list(userId: string, projectId: string) {
    await requireAgent(userId);
    const rows = await asUser(userId, async (db) => (await db.query<RRow>('SELECT * FROM agent_runs WHERE project_id=$1 ORDER BY created_at DESC LIMIT 50', [projectId])).rows);
    return { items: await Promise.all(rows.map((r) => this.dto(r))) };
  },
  async dto(r: RRow) {
    const res = open<{ result: RenderResult }>(r.result_json)?.result;
    return { runId: r.id, projectId: r.project_id, command: r.command, status: r.status, applied: r.applied, appliedBy: r.applied_by, appliedAt: r.applied_at, errorCode: r.error_code, createdAt: r.created_at,
      plan: { understood: r.plan_json.understood, message: r.plan_json.message ?? null, summary: r.plan_json.summary, requiresTranscript: r.plan_json.requiresTranscript, estimatedDurationMs: r.plan_json.estimatedDurationMs,
        steps: r.plan_json.steps.map((s) => ({ label: s.label, type: s.op.type, startMs: s.op.startMs, endMs: s.op.endMs })) },
      preview: res ? { url: r.preview_video_key ? await signRef(r.preview_video_key, env.EDIT_URL_TTL_SEC) : null, durationMs: res.durationMs, removedMs: res.removedMs, affectedScenes: res.scenes.map((s) => s.index) } : null };
  },
};
