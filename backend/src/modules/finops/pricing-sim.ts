/** Simulador de pricing/margem (puro). Usado nos experimentos de preço da Fase 7 e na simulação de otimizações. Tudo em centavos de BRL. */
export interface UsageProfile { videosPerMonth: number; avgSecondsPerVideo: number; dubbingLanguagesPerVideo: number; publicationsPerVideo: number; regenerationRate: number }
export interface UnitCosts { aiCentsPerVideoSecond: number; ttsCentsPerLanguage: number; infraCentsPerPublication: number; infraCentsPerUserMonth: number }
export interface Assumptions { priceCents: number; taxPct: number; paymentFeePct: number; paymentFixedCents: number; cacheHitRate?: number; routingSavingsPct?: number; distillShare?: number; distillSavingsPct?: number }
export const DEFAULT_PROFILES: Record<string, UsageProfile> = {
  free: { videosPerMonth: 2, avgSecondsPerVideo: 20, dubbingLanguagesPerVideo: 0, publicationsPerVideo: 1, regenerationRate: 0.1 },
  pro: { videosPerMonth: 20, avgSecondsPerVideo: 30, dubbingLanguagesPerVideo: 1, publicationsPerVideo: 2, regenerationRate: 0.15 },
  business: { videosPerMonth: 80, avgSecondsPerVideo: 30, dubbingLanguagesPerVideo: 2, publicationsPerVideo: 3, regenerationRate: 0.15 },
};
export function simulate(profile: UsageProfile, c: UnitCosts, a: Assumptions) {
  const videos = profile.videosPerMonth * (1 + profile.regenerationRate);
  let ai = videos * profile.avgSecondsPerVideo * c.aiCentsPerVideoSecond;
  const savings = { cache: 0, routing: 0, distill: 0 };
  if (a.cacheHitRate) { savings.cache = ai * a.cacheHitRate; ai -= savings.cache; }
  if (a.distillShare && a.distillSavingsPct) { savings.distill = ai * a.distillShare * a.distillSavingsPct; ai -= savings.distill; }
  if (a.routingSavingsPct) { savings.routing = ai * a.routingSavingsPct; ai -= savings.routing; }
  const tts = profile.videosPerMonth * profile.dubbingLanguagesPerVideo * c.ttsCentsPerLanguage; const pubs = profile.videosPerMonth * profile.publicationsPerVideo * c.infraCentsPerPublication;
  const infra = c.infraCentsPerUserMonth; const cogs = ai + tts + pubs + infra;
  const tax = (a.priceCents * a.taxPct) / (100 + a.taxPct); const net = a.priceCents - tax; const fee = a.priceCents > 0 ? (a.priceCents * a.paymentFeePct) / 100 + a.paymentFixedCents : 0; const revenue = net - fee;
  const grossProfit = revenue - cogs; return { priceCents: a.priceCents, netRevenueCents: Math.round(revenue), cogsCents: Math.round(cogs), breakdown: { ai: Math.round(ai), tts: Math.round(tts), publications: Math.round(pubs), infra: Math.round(infra), tax: Math.round(tax), paymentFees: Math.round(fee) }, grossProfitCents: Math.round(grossProfit), grossMarginPct: revenue > 0 ? +((grossProfit / revenue) * 100).toFixed(1) : null, savingsCents: Object.fromEntries(Object.entries(savings).map(([k, v]) => [k, Math.round(v)])) };
}
/** Preço mínimo para atingir uma margem bruta alvo (busca binária) — útil para definir pisos de preço regionais. */
export function breakEvenPrice(profile: UsageProfile, c: UnitCosts, a: Omit<Assumptions, 'priceCents'>, targetMarginPct: number): number {
  let lo = 0, hi = 10_000_000; for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; const m = simulate(profile, c, { ...a, priceCents: mid }).grossMarginPct; if (m !== null && m >= targetMarginPct) hi = mid; else lo = mid; } return Math.ceil(hi);
}
