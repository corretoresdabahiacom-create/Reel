import { pool } from '../db/pool.js';
import { redis } from '../db/redis.js';
import { audit } from '../repositories/audit.js';

export interface FlagRow { key: string; description: string; enabled: boolean; rollout_percent: number; regions: string[]; plans: string[]; updated_at: string }
const CK = 'flags:all'; const TTL = 60;
export async function allFlags(): Promise<FlagRow[]> {
  const c = await redis.get(CK).catch(() => null); if (c) return JSON.parse(c);
  const { rows } = await pool.query<FlagRow>('SELECT key, description, enabled, rollout_percent, regions, plans, updated_at FROM feature_flags ORDER BY key');
  await redis.set(CK, JSON.stringify(rows), 'EX', TTL).catch(() => undefined); return rows;
}
export const invalidateFlags = () => redis.del(CK).catch(() => undefined);
/** Bucket estável 0–99 por (flag, userId) — mesmo algoritmo FNV-1a do front (Fase 5). */
export function bucket(key: string, userId: string): number { let h = 0x811c9dc5; for (const ch of `${key}:${userId}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h % 100; }
export interface FlagCtx { userId?: string; region?: string; plan?: string }
export function evaluate(f: FlagRow, c: FlagCtx): boolean {
  if (!f.enabled) return false;                                   // kill switch
  if (f.regions.length && (!c.region || !f.regions.includes(c.region))) return false;
  if (f.plans.length && (!c.plan || !f.plans.includes(c.plan))) return false;
  if (f.rollout_percent >= 100) return true; if (f.rollout_percent <= 0) return false;
  return !!c.userId && bucket(f.key, c.userId) < f.rollout_percent;
}
export async function isEnabled(key: string, c: FlagCtx = {}): Promise<boolean> {
  const f = (await allFlags()).find((x) => x.key === key); return f ? evaluate(f, c) : false;
}
export async function flagsFor(c: FlagCtx): Promise<Record<string, boolean>> { return Object.fromEntries((await allFlags()).map((f) => [f.key, evaluate(f, c)])); }
export async function setFlag(actor: string, key: string, patch: Partial<Pick<FlagRow, 'enabled' | 'rollout_percent' | 'regions' | 'plans'>>): Promise<void> {
  const cols = Object.keys(patch) as (keyof typeof patch)[]; if (!cols.length) return;
  await pool.query(`UPDATE feature_flags SET ${cols.map((k, i) => `${k}=$${i + 2}`).join(',')}, updated_at=now(), updated_by=$${cols.length + 2} WHERE key=$1`, [key, ...cols.map((k) => patch[k]), actor]);
  await audit(pool, actor, 'flag.update', 'flag', key, patch as Record<string, unknown>); await invalidateFlags();
}
