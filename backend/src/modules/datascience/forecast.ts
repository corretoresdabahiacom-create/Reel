/** Previsão de séries diárias: tendência linear (OLS) × sazonalidade semanal multiplicativa, com intervalo de ~80% pelo desvio dos resíduos. Pura e determinística. */
export interface ForecastPoint { day: number; value: number; lo: number; hi: number }
export interface Forecast { points: ForecastPoint[]; slope: number; level: number; residualSd: number; weekdayFactors: number[]; method: 'trend_weekly' | 'trend' | 'mean' }
const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

/** @param values série diária cronológica; @param startDow dia da semana (0-6) do primeiro ponto. */
export function forecastDaily(values: number[], horizon: number, startDow = 0): Forecast {
  const n = values.length;
  if (n === 0) return { points: Array.from({ length: horizon }, (_, i) => ({ day: i + 1, value: 0, lo: 0, hi: 0 })), slope: 0, level: 0, residualSd: 0, weekdayFactors: Array(7).fill(1), method: 'mean' };
  if (n < 7) { const m = mean(values); return { points: Array.from({ length: horizon }, (_, i) => ({ day: i + 1, value: m, lo: Math.max(0, m * 0.7), hi: m * 1.3 })), slope: 0, level: m, residualSd: 0, weekdayFactors: Array(7).fill(1), method: 'mean' }; }
  // 1) fatores semanais = média do dia da semana / média geral (só com ≥ 14 pontos)
  let f = Array(7).fill(1) as number[]; let method: Forecast['method'] = 'trend';
  const overall = mean(values);
  if (n >= 14 && overall > 0) {
    const sums = Array(7).fill(0) as number[]; const cnt = Array(7).fill(0) as number[];
    values.forEach((v, i) => { const d = (startDow + i) % 7; sums[d]! += v; cnt[d]!++; });
    f = sums.map((s, d) => (cnt[d] ? s / cnt[d]! / overall : 1)); const fm = mean(f); f = f.map((x) => x / fm); method = 'trend_weekly';
  }
  // 2) dessazonaliza e ajusta OLS
  const ds = values.map((v, i) => v / (f[(startDow + i) % 7] || 1));
  const xm = (n - 1) / 2, ym = mean(ds); let sxy = 0, sxx = 0; ds.forEach((y, i) => { sxy += (i - xm) * (y - ym); sxx += (i - xm) ** 2; });
  const slope = sxx ? sxy / sxx : 0, level = ym - slope * xm;
  const fit = (i: number) => Math.max(0, level + slope * i) * (f[(startDow + i) % 7] || 1);
  const res = values.map((v, i) => v - fit(i)); const sd = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2));
  const z = 1.2816; // 80%
  const points = Array.from({ length: horizon }, (_, k) => { const i = n + k; const v = fit(i); const w = z * sd * Math.sqrt(1 + (k + 1) / n); return { day: k + 1, value: v, lo: Math.max(0, v - w), hi: v + w }; });
  return { points, slope, level, residualSd: sd, weekdayFactors: f, method };
}

/** Projeção do mês: realizado + previsão dos dias restantes. */
export function projectMonth(spentSoFar: number, remainingDays: number, daily: number[], startDow: number): { projected: number; lo: number; hi: number; forecast: Forecast } {
  const fc = forecastDaily(daily, Math.max(0, remainingDays), startDow);
  const sum = (k: 'value' | 'lo' | 'hi') => fc.points.reduce((s, p) => s + p[k], 0);
  return { projected: spentSoFar + sum('value'), lo: spentSoFar + sum('lo'), hi: spentSoFar + sum('hi'), forecast: fc };
}
