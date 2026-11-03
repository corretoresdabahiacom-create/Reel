/** Matemática de SLO (pura, testável): burn rate, error budget e alertas multi-janela (Google SRE Workbook, cap. 5). */
export interface Sample { ts: number; good: number; total: number }
export type AlertWindow = '1h' | '6h' | '3d';
export const WINDOW_MS: Record<string, number> = { '5m': 5 * 60_000, '30m': 30 * 60_000, '1h': 3600_000, '2h': 2 * 3600_000, '6h': 6 * 3600_000, '1d': 86400_000, '3d': 3 * 86400_000 };
/** Pares (janela longa, janela curta) e limiares: >14,4x em 1h (e 5m) = page; >6x em 6h (e 30m) = page; >1x em 3d (e 6h) = ticket. */
export const BURN_RULES: Array<{ window: AlertWindow; short: string; threshold: number; severity: 'page' | 'ticket' }> = [
  { window: '1h', short: '5m', threshold: 14.4, severity: 'page' }, { window: '6h', short: '30m', threshold: 6, severity: 'page' }, { window: '3d', short: '6h', threshold: 1, severity: 'ticket' },
];
/** Fração de eventos ruins na janela [now-ms, now]. Sem tráfego => 0 (sem consumo de budget). */
export function errorRatio(samples: Sample[], now: number, ms: number): number {
  let g = 0, t = 0; for (const s of samples) if (s.ts > now - ms && s.ts <= now) { g += s.good; t += s.total; } return t === 0 ? 0 : (t - g) / t;
}
/** burn = taxa de erro observada / taxa de erro permitida (1 - alvo). burn 1 = consumindo o budget exatamente no ritmo do período. */
export const burnRate = (errRatio: number, target: number): number => errRatio / (1 - target);
export interface BurnAlert { window: AlertWindow; burn: number; shortBurn: number; threshold: number; severity: 'page' | 'ticket'; firing: boolean }
export function evaluateBurn(samples: Sample[], target: number, now = Date.now()): BurnAlert[] {
  return BURN_RULES.map((r) => { const burn = burnRate(errorRatio(samples, now, WINDOW_MS[r.window]!), target); const shortBurn = burnRate(errorRatio(samples, now, WINDOW_MS[r.short]!), target);
    return { window: r.window, burn, shortBurn, threshold: r.threshold, severity: r.severity, firing: burn > r.threshold && shortBurn > r.threshold }; });
}
/** Budget restante (0..1; pode ser negativo se estourado) na janela do SLO (dias). */
export function budgetRemaining(samples: Sample[], target: number, windowDays: number, now = Date.now()): { remaining: number; consumed: number; goodRatio: number; total: number } {
  const ms = windowDays * 86400_000; let g = 0, t = 0; for (const s of samples) if (s.ts > now - ms && s.ts <= now) { g += s.good; t += s.total; }
  if (t === 0) return { remaining: 1, consumed: 0, goodRatio: 1, total: 0 };
  const consumed = (t - g) / t / (1 - target); return { remaining: 1 - consumed, consumed, goodRatio: g / t, total: t };
}
export const FREEZE_THRESHOLD = 0.25;
/** Política: budget < 25% => freeze de features; <= 0 => só libera com aprovação de SRE (override registrado). */
export function freezePolicy(remaining: number): { freeze: boolean; level: 'ok' | 'freeze' | 'exhausted' } {
  return remaining <= 0 ? { freeze: true, level: 'exhausted' } : remaining < FREEZE_THRESHOLD ? { freeze: true, level: 'freeze' } : { freeze: false, level: 'ok' };
}
/** Tempo (horas) até esgotar o budget no ritmo de burn atual (Infinity se burn <= 0). */
export function hoursToExhaustion(remaining: number, burn: number, windowDays: number): number { return burn <= 0 ? Infinity : (Math.max(remaining, 0) * windowDays * 24) / burn; }
