import { createHash } from 'node:crypto';
import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { logger } from '../../observability/logger.js';
import { audit } from '../../repositories/audit.js';
import { isEnabled, invalidateFlags } from '../flags.service.js';
import { storage, refLocation, RAW_SCENE } from '../../providers/storage.js';
import type { SceneInput, SceneResult } from '../../providers/ai/types.js';
import { chooseProvider, sceneComplexity } from './matrix.js';
import type { Row } from '../../db/rows.generated.js';
export * from './matrix.js';

/** Chave de cache: hash estável de prompt + texto + duração + referências + frame anterior (encadeamento). Mesmo input => mesma cena. */
export function sceneCacheKey(s: Pick<SceneInput, 'prompt' | 'text' | 'durationSec' | 'referenceKeys' | 'referenceMode'>, previousFrameKey?: string): string {
  const norm = JSON.stringify({ p: s.prompt.trim().replace(/\s+/g, ' ').toLowerCase(), t: s.text.trim().replace(/\s+/g, ' ').toLowerCase(), d: s.durationSec, m: s.referenceMode, r: [...s.referenceKeys].sort(), prev: previousFrameKey ?? null });
  return createHash('sha256').update(norm).digest('hex');
}
const copyObject = async (fromKey: string, toKey: string, ct: string): Promise<void> => { const l = refLocation(fromKey); const buf = await storage.get(l.bucket, l.key); const t = refLocation(toKey); await storage.put(t.bucket, t.key, buf, ct, RAW_SCENE); }; // cópia do cache = cena bruta (expira em 90 dias como as outras)
/** Cache de geração. Copia os objetos para o prefixo do novo projeto (hard delete do projeto de origem não quebra o reuso). */
export const sceneCache = {
  async lookup(s: SceneInput, previousFrameKey?: string): Promise<SceneResult | null> {
    if (!(await isEnabled('ai_scene_cache'))) return null; const key = sceneCacheKey(s, previousFrameKey);
    const row = (await pool.query<Row<'ai_scene_cache'>>('SELECT * FROM ai_scene_cache WHERE cache_key=$1', [key])).rows[0]; if (!row) return null;
    try {
      const stamp = Date.now(); const videoKey = `projects/${s.projectId}/scene-${s.index}-cache-${stamp}.mp4`; const frameKey = `projects/${s.projectId}/scene-${s.index}-cache-${stamp}.jpg`;
      await copyObject(row.video_key, videoKey, 'video/mp4'); await copyObject(row.last_frame_key, frameKey, 'image/jpeg');
      await pool.query(`UPDATE ai_scene_cache SET hits=hits+1, last_hit_at=now() WHERE cache_key=$1`, [key]);
      return { videoKey, lastFrameKey: frameKey, consistency: 0.95, usage: { provider: `cache:${row.provider}`, operation: 'generate_scene', costCents: 0, latencyMs: 5 } };
    } catch (e) { logger.warn({ err: String(e), key }, 'cache de cena inválido: gerando normalmente'); return null; }
  },
  async store(s: SceneInput, r: SceneResult, previousFrameKey?: string): Promise<void> {
    if (!(await isEnabled('ai_scene_cache')) || r.usage.provider.startsWith('cache:') || r.usage.provider === 'mock') return;
    await pool.query(`INSERT INTO ai_scene_cache (cache_key, provider, video_key, last_frame_key, duration_sec, cost_saved_cents) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (cache_key) DO NOTHING`, [sceneCacheKey(s, previousFrameKey), r.usage.provider, r.videoKey, r.lastFrameKey, s.durationSec, r.usage.costCents]);
  },
  async stats() { const r = (await pool.query<{ entries: number; hits: number; saved_cents: number }>(`SELECT count(*)::int entries, COALESCE(sum(hits),0)::int hits, COALESCE(sum(hits*cost_saved_cents),0)::float saved_cents FROM ai_scene_cache`)).rows[0]; return { entries: r.entries, hits: r.hits, savedCents: r.saved_cents }; },
};
/** Provedor primário para uma cena (cache de decisões não necessário: puro). Flag `ai_cost_router` desligada => comportamento original. */
export async function pickVideoProvider(s: { text: string; durationSec: number; prompt: string }, fallback: string, breakerOpen: (p: string) => Promise<boolean>): Promise<string> {
  if (!(await isEnabled('ai_cost_router'))) return fallback;
  const open = new Set<string>(); for (const p of ['kling', 'mock']) if (await breakerOpen(p)) open.add(p);
  return chooseProvider({ kind: 'video', tier: sceneComplexity(s), breakerOpen: (n) => open.has(n), excludeMock: fallback !== 'mock' })?.name ?? fallback;
}
/** Guardrail de custo: custo de hoje > N x média móvel de 7 dias (ou limite absoluto) => alerta; com a flag `ai_kill_switch`, bloqueia novas gerações. */
export const costGuard = {
  async evaluate(now = new Date()): Promise<{ todayCents: number; avg7dCents: number; ratio: number; anomaly: boolean; killed: boolean; reason?: string }> {
    const cfg = ((await pool.query<Pick<Row<'settings'>, 'value'>>(`SELECT value FROM settings WHERE key='ops'`)).rows.at(0)?.value ?? {}) as Record<string, unknown>; const mult = Number(cfg.aiAnomalyMultiplier ?? 3); const abs = Number(cfg.aiDailyThresholdCents ?? 0);
    const today = Number((await pool.query<{ s: number }>(`SELECT COALESCE(SUM(cost_cents),0) s FROM ai_usage WHERE created_at >= date_trunc('day', $1::timestamptz)`, [now])).rows[0].s);
    const prev = (await pool.query<{ day: Date | null; s: number }>(`SELECT d::date AS day, COALESCE((SELECT SUM(cost_cents) FROM ai_usage WHERE created_at >= d AND created_at < d + interval '1 day'),0)::float AS s FROM generate_series(date_trunc('day',$1::timestamptz) - interval '7 days', date_trunc('day',$1::timestamptz) - interval '1 day', interval '1 day') d`, [now])).rows;
    const avg = prev.reduce((a, r) => a + Number(r.s), 0) / Math.max(prev.length, 1); const ratio = avg > 0 ? today / avg : (today > 0 ? Infinity : 0);
    const byAvg = avg > 0 && ratio > mult; const byAbs = abs > 0 && today > abs && avg === 0; const anomaly = byAvg || byAbs;
    let killed = false; const reason = byAvg ? `custo de IA hoje (${today.toFixed(0)}¢) > ${mult}x a média 7d (${avg.toFixed(0)}¢)` : byAbs ? `custo de IA hoje (${today.toFixed(0)}¢) acima do limite absoluto sem histórico` : undefined;
    if (anomaly) {
      await pool.query(`INSERT INTO growth_alerts (kind, severity, message, data) SELECT 'ai_cost_anomaly','critical',$1,$2 WHERE NOT EXISTS (SELECT 1 FROM growth_alerts WHERE kind='ai_cost_anomaly' AND resolved_at IS NULL AND created_at > now() - interval '6 hours')`, [reason, JSON.stringify({ today, avg, ratio })]).catch(() => undefined);
      if (await isEnabled('ai_kill_switch')) { await pool.query(`UPDATE feature_flags SET enabled=false, updated_at=now() WHERE key='generation_enabled' AND enabled`); await invalidateFlags(); await audit(pool, 'system', 'ai.kill_switch', 'flag', 'generation_enabled', { reason, today, avg }); killed = true; }
    }
    return { todayCents: today, avg7dCents: avg, ratio: Number.isFinite(ratio) ? +ratio.toFixed(2) : 999, anomaly, killed, reason };
  },
  /** Reativação manual (humano) após investigação. */
  async reenable(adminId: string, reason: string) { await pool.query(`UPDATE feature_flags SET enabled=true, updated_at=now() WHERE key='generation_enabled'`); await invalidateFlags(); await audit(pool, adminId, 'ai.kill_switch_release', 'flag', 'generation_enabled', { reason }); return { generationEnabled: true }; },
};
export const rateLimitedMinute = async (k: string): Promise<boolean> => (await redis.set(`costguard:${k}`, '1', 'EX', 60, 'NX')) === 'OK';
