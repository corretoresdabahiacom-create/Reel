import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import type { Row } from '../../db/rows.generated.js';

/** Parâmetros de growth em `settings.growth` (editáveis sem deploy), com defaults seguros se a linha faltar. */
export interface GrowthSettings {
  holdoutPct: number;
  referral: { rewardReferrerCredits: number; rewardReferredCredits: number; monthlyCapPerReferrer: number; signupVelocityPerIp24h: number };
  lifecycle: { capPerDay: number; capPerWeek: number; defaultQuietStart: number; defaultQuietEnd: number };
  paywall: { capPerDayPerTrigger: number; capPerWeek: number };
  recommendations: { minInteractionsForPersonalized: number };
  churn: { highRisk: number; modelTimeoutMs: number };
  aiCostMonthlyBudgetCents: number; creatorVerifiedFeePct: number; iofPct: number; disposableDomains: string[];
}
export const GROWTH_DEFAULTS: GrowthSettings = {
  holdoutPct: 0, referral: { rewardReferrerCredits: 20, rewardReferredCredits: 20, monthlyCapPerReferrer: 50, signupVelocityPerIp24h: 5 },
  lifecycle: { capPerDay: 1, capPerWeek: 3, defaultQuietStart: 22, defaultQuietEnd: 8 }, paywall: { capPerDayPerTrigger: 1, capPerWeek: 3 },
  recommendations: { minInteractionsForPersonalized: 5 }, churn: { highRisk: 0.6, modelTimeoutMs: 50 }, aiCostMonthlyBudgetCents: 1_500_000, creatorVerifiedFeePct: 12, iofPct: 3.5, disposableDomains: [],
};
const CK = 'growth:settings'; let mem: { at: number; v: GrowthSettings } | undefined;
const merge = <T extends object>(base: T, over: Record<string, unknown>): T => { const o = { ...base } as Record<string, unknown>; for (const [k, v] of Object.entries(over ?? {})) o[k] = v && typeof v === 'object' && !Array.isArray(v) && typeof o[k] === 'object' && !Array.isArray(o[k]) ? merge(o[k] as object, v as Record<string, unknown>) : v; return o as T; };
export async function growthSettings(): Promise<GrowthSettings> {
  if (mem && Date.now() - mem.at < 5000) return mem.v; // cache de processo (5 s) → pouca pressão no Redis/PG
  let raw = await redis.get(CK).catch(() => null);
  if (!raw) { const r = await pool.query<Pick<Row<'settings'>, 'value'>>(`SELECT value FROM settings WHERE key='growth'`); raw = JSON.stringify(r.rows.at(0)?.value ?? {}); await redis.set(CK, raw, 'EX', 30).catch(() => undefined); }
  const v = merge(GROWTH_DEFAULTS, JSON.parse(raw)); mem = { at: Date.now(), v }; return v;
}
export async function updateGrowthSettings(patch: Record<string, unknown>): Promise<GrowthSettings> {
  const cur = (await pool.query<Pick<Row<'settings'>, 'value'>>(`SELECT value FROM settings WHERE key='growth'`)).rows.at(0)?.value ?? {}; const next = merge(cur as object, patch);
  await pool.query(`INSERT INTO settings (key,value) VALUES ('growth',$1) ON CONFLICT (key) DO UPDATE SET value=$1, updated_at=now()`, [JSON.stringify(next)]); await redis.del(CK).catch(() => undefined); mem = undefined; return growthSettings();
}
export const resetGrowthCache = () => { mem = undefined; };
