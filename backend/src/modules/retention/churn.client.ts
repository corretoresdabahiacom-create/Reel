import { env } from '../../config/env.js';
import { m } from '../../observability/metrics.js';
import { FEATURES, type FeatureRow } from './features.js';

export interface Scored { userId: string; score: number; source: 'model' | 'fallback'; version: string; top: Array<{ feature: string; contribution: number }> }
const clamp01 = (x: number) => Math.min(1, Math.max(0, x)); const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
/** Heurística de fallback (regressão logística com pesos fixos e interpretáveis). Usada quando o serviço de ML está ausente/lento/errado. */
export const FALLBACK_VERSION = 'heuristic-v1';
export function heuristicChurn(f: Omit<FeatureRow, 'userId'>): { score: number; top: Scored['top'] } {
  const c: Record<string, number> = {
    days_since_last_login: 0.06 * Math.min(f.days_since_last_login, 60), projects_30d: -0.28 * Math.min(f.projects_30d, 8), publications_30d: -0.45 * Math.min(f.publications_30d, 5), gen_success_rate_30d: -1.0 * (f.gen_success_rate_30d - 0.8),
    plan_ordinal: -0.9 * Math.min(f.plan_ordinal, 1), onboarding_completed: -0.6 * f.onboarding_completed, platforms_connected: -0.25 * Math.min(f.platforms_connected, 3), marketplace_purchases_90d: -0.3 * Math.min(f.marketplace_purchases_90d, 3), affiliate_links_active: -0.2 * Math.min(f.affiliate_links_active, 3),
    tenure_days: f.tenure_days < 14 ? 0.4 : -0.004 * Math.min(f.tenure_days, 180), projects_7d: -0.3 * Math.min(f.projects_7d, 3), publications_7d: -0.3 * Math.min(f.publications_7d, 2), credits_remaining: f.credits_remaining === 0 ? 0.3 : 0, revenue_90d_brl: -0.004 * Math.min(f.revenue_90d_brl, 200),
  };
  const z = -0.3 + Object.values(c).reduce((a, b) => a + b, 0); return { score: clamp01(sigmoid(z)), top: Object.entries(c).map(([feature, contribution]) => ({ feature, contribution: Math.round(contribution * 1000) / 1000 })).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)).slice(0, 3) };
}
export function heuristicLtvCents(f: Omit<FeatureRow, 'userId'>, churn: number): number { const monthlyBrl = f.revenue_90d_brl / 3 + (f.plan_ordinal === 1 ? 49 : f.plan_ordinal === 2 ? 199 : 0) * 0.5; const months = Math.min(24, 1 / Math.max(churn * 0.5, 0.04)); return Math.round(monthlyBrl * months * 100); }
export function heuristicPropensity(f: Omit<FeatureRow, 'userId'>, target: 'upgrade' | 'credits'): number {
  if (target === 'upgrade') return f.plan_ordinal > 0 ? 0 : clamp01(sigmoid(-2.2 + 0.25 * Math.min(f.projects_30d, 8) + 0.3 * Math.min(f.publications_30d, 5) + (f.credits_remaining < 6 ? 0.8 : 0) + 0.2 * Math.min(f.platforms_connected, 3) - 0.04 * Math.min(f.days_since_last_login, 30)));
  return clamp01(sigmoid(-2.0 + 0.3 * Math.min(f.projects_30d, 8) + (f.credits_remaining < 6 ? 1.1 : 0) - 0.05 * Math.min(f.days_since_last_login, 30) + (f.revenue_90d_brl > 0 ? 0.8 : 0)));
}
async function post(path: string, body: unknown, timeoutMs: number): Promise<any | null> {
  if (!env.ML_SERVICE_URL) { m.mlRequests.inc({ outcome: 'disabled' }); return null; }
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeoutMs);
  try { const r = await fetch(`${env.ML_SERVICE_URL}${path}`, { method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', ...(env.ML_SERVICE_TOKEN ? { authorization: `Bearer ${env.ML_SERVICE_TOKEN}` } : {}) }, body: JSON.stringify(body) }); if (!r.ok) { m.mlRequests.inc({ outcome: 'http_error' }); return null; } const j = await r.json(); m.mlRequests.inc({ outcome: 'ok' }); return j; }
  catch (e) { m.mlRequests.inc({ outcome: (e as Error).name === 'AbortError' ? 'timeout' : 'error' }); return null; } finally { clearTimeout(t); }
}
const toVec = (f: FeatureRow) => FEATURES.map((k) => f[k]);
export interface ScoreResult { churn: Scored; ltvCents: number; ltvVersion: string; propensity: { upgrade: number; credits: number }; propVersion: string }
/** Pontuação ONLINE (1 usuário): timeout curto (ML_TIMEOUT_MS, padrão 50 ms) e fallback heurístico — nunca falha. */
export async function scoreOne(f: FeatureRow): Promise<ScoreResult> { return (await scoreMany([f], env.ML_TIMEOUT_MS))[0]!; }
/** Lote (job diário): timeout maior; se o serviço falhar usa o fallback para o lote inteiro. */
export async function scoreMany(rows: FeatureRow[], timeoutMs = 5000): Promise<ScoreResult[]> {
  if (!rows.length) return [];
  const res = await post('/predict/batch', { features: FEATURES, rows: rows.map((r) => ({ id: r.userId, x: toVec(r) })) }, timeoutMs);
  const byId = new Map<string, any>((res?.predictions ?? []).map((p: any) => [p.id, p]));
  return rows.map((r) => {
    const p = byId.get(r.userId); const { userId: _id, ...f } = r;
    if (p) { m.churnScores.inc({ source: 'model' }); return { churn: { userId: r.userId, score: clamp01(p.churn), source: 'model' as const, version: res.version?.churn ?? 'model', top: (p.top ?? []) as Scored['top'] }, ltvCents: Math.max(0, Math.round(p.ltv_brl * 100)), ltvVersion: res.version?.ltv ?? 'model', propensity: { upgrade: clamp01(p.p_upgrade), credits: clamp01(p.p_credits) }, propVersion: res.version?.propensity ?? 'model' }; }
    m.churnScores.inc({ source: 'fallback' }); const h = heuristicChurn(f); return { churn: { userId: r.userId, score: h.score, source: 'fallback' as const, version: FALLBACK_VERSION, top: h.top }, ltvCents: heuristicLtvCents(f, h.score), ltvVersion: FALLBACK_VERSION, propensity: { upgrade: heuristicPropensity(f, 'upgrade'), credits: heuristicPropensity(f, 'credits') }, propVersion: FALLBACK_VERSION };
  });
}
export async function mlHealth(): Promise<{ configured: boolean; ok: boolean; info?: unknown }> {
  if (!env.ML_SERVICE_URL) return { configured: false, ok: false };
  try { const r = await fetch(`${env.ML_SERVICE_URL}/model`, { signal: AbortSignal.timeout(1500) }); return { configured: true, ok: r.ok, info: r.ok ? await r.json() : undefined }; } catch { return { configured: true, ok: false }; }
}
