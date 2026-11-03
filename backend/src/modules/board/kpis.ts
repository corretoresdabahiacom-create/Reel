/** Fórmulas de KPIs SaaS (puras e testáveis). Valores monetários em centavos de BRL. `null` = não calculável (falta dado/entrada), nunca zero inventado. */
const r2 = (x: number) => +x.toFixed(2); const nz = (a: number | null | undefined): a is number => a !== null && a !== undefined && Number.isFinite(a);
export interface Cohort { prevMrr: Map<string, number>; currMrr: Map<string, number> }
/** NDR/GRR/churn a partir do MRR por assinante no período anterior vs atual (apenas quem existia no período anterior). */
export function retentionKpis(c: Cohort) {
  let start = 0, churned = 0, contraction = 0, expansion = 0, retainedLogos = 0; for (const [u, p] of c.prevMrr) { start += p; const cur = c.currMrr.get(u) ?? 0; if (cur === 0) churned += p; else { retainedLogos++; if (cur < p) contraction += p - cur; else expansion += cur - p; } }
  if (start === 0) return { startMrr: 0, ndrPct: null, grrPct: null, logoChurnPct: null, revenueChurnPct: null, expansion, contraction, churned };
  return { startMrr: start, ndrPct: r2(((start + expansion - contraction - churned) / start) * 100), grrPct: r2(((start - contraction - churned) / start) * 100), logoChurnPct: r2((1 - retainedLogos / c.prevMrr.size) * 100), revenueChurnPct: r2(((churned + contraction) / start) * 100), expansion, contraction, churned };
}
export const growthPct = (curr: number, prev: number): number | null => (prev > 0 ? r2(((curr - prev) / prev) * 100) : null);
export const ltvCents = (arpaCents: number | null, grossMarginPct: number | null, monthlyChurnPct: number | null): number | null => (nz(arpaCents) && nz(grossMarginPct) && nz(monthlyChurnPct) && monthlyChurnPct > 0 ? Math.round((arpaCents * (grossMarginPct / 100)) / (monthlyChurnPct / 100)) : null);
export const paybackMonths = (cacCents: number | null, arpaCents: number | null, grossMarginPct: number | null): number | null => (nz(cacCents) && nz(arpaCents) && nz(grossMarginPct) && arpaCents * (grossMarginPct / 100) > 0 ? r2(cacCents / (arpaCents * (grossMarginPct / 100))) : null);
/** Magic number = (ΔARR do trimestre) / gasto de S&M do trimestre anterior (forma anualizada: (Δreceita trimestral × 4) / S&M anterior). */
export const magicNumber = (netNewArrQuarterCents: number | null, prevQuarterSmCents: number | null): number | null => (nz(netNewArrQuarterCents) && nz(prevQuarterSmCents) && prevQuarterSmCents > 0 ? r2(netNewArrQuarterCents / prevQuarterSmCents) : null);
/** Rule of 40 = crescimento anualizado % + margem (FCF ou EBITDA) %. */
export const ruleOf40 = (growth: number | null, marginPct: number | null): number | null => (nz(growth) && nz(marginPct) ? r2(growth + marginPct) : null);
/** Burn multiple = burn líquido / ARR líquido novo. < 1 excelente, 1–2 bom, > 3 ruim. */
export const burnMultiple = (netBurnCents: number | null, netNewArrCents: number | null): number | null => (nz(netBurnCents) && nz(netNewArrCents) && netNewArrCents > 0 ? r2(netBurnCents / netNewArrCents) : null);
export const runwayMonths = (cashCents: number | null, netBurnMonthlyCents: number | null): number | null => (nz(cashCents) && nz(netBurnMonthlyCents) && netBurnMonthlyCents > 0 ? r2(cashCents / netBurnMonthlyCents) : null);
/** Anomalia por z-score contra uma janela histórica (>= 7 pontos). */
export function zAnomaly(history: number[], today: number, z = 3): { anomaly: boolean; z: number | null } {
  if (history.length < 7) return { anomaly: false, z: null }; const mean = history.reduce((a, b) => a + b, 0) / history.length; const sd = Math.sqrt(history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length);
  if (sd === 0) return { anomaly: today !== mean, z: today === mean ? 0 : null }; const s = (today - mean) / sd; return { anomaly: Math.abs(s) > z, z: r2(s) };
}
