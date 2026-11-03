/**
 * Motor estatístico da plataforma de experimentação (funções puras, sem I/O — testáveis com valores de referência).
 * Frequentista por padrão (z de duas proporções, Welch), Bayesiano opcional (Beta-Binomial por Monte Carlo com semente).
 * Documentação e premissas: docs/EXPERIMENTS.md.
 */

// ───────── Distribuições ─────────
const SQRT2 = Math.SQRT2;
function erf(x: number): number { // Abramowitz-Stegun 7.1.26 refinado com série para |x| pequeno
  const s = Math.sign(x); x = Math.abs(x);
  if (x < 2.5) { let sum = x, term = x; for (let n = 1; n < 60; n++) { term *= (-x * x) / n; const d = term / (2 * n + 1); sum += d; if (Math.abs(d) < 1e-17) break; } return s * (2 / Math.sqrt(Math.PI)) * sum; }
  const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y;
}
export const normCdf = (x: number) => 0.5 * (1 + erf(x / SQRT2));
/** Inversa da normal (Acklam, erro relativo < 1.2e-9). */
export function normInv(p: number): number {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239], b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1],
    c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783], d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425; let q: number;
  if (p < lo) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1); }
  if (p > 1 - lo) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) / ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1); }
  q = p - 0.5; const r = q * q; return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q / (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
}
function lgamma(x: number): number {
  /* eslint-disable no-loss-of-precision -- constantes de Lanczos (Numerical Recipes); o arredondamento para double é intencional */
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5]; let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t); let s = 1.000000000190015; for (const cj of c) s += cj / ++y; return -t + Math.log(2.5066282746310005 * s / x);
  /* eslint-enable no-loss-of-precision */
}
function betacf(a: number, b: number, x: number): number { // Numerical Recipes (Lentz)
  const MAXIT = 300, EPS = 3e-16, FPMIN = 1e-300; const qab = a + b, qap = a + 1, qam = a - 1; let c = 1, d = 1 - qab * x / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) { const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2)); d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break; }
  return h;
}
/** Beta incompleta regularizada I_x(a,b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0; if (x >= 1) return 1; const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
/** CDF da t de Student. */
export function tCdf(t: number, df: number): number { const x = df / (df + t * t); const p = 0.5 * ibeta(x, df / 2, 0.5); return t > 0 ? 1 - p : p; }
export function tInv(p: number, df: number): number { let lo = -50, hi = 50; for (let i = 0; i < 120; i++) { const mid = (lo + hi) / 2; if (tCdf(mid, df) < p) lo = mid; else hi = mid; } return (lo + hi) / 2; }
/** Gama incompleta regularizada P(a,x) (para o qui-quadrado). */
export function gammaP(a: number, x: number): number {
  if (x <= 0) return 0; const gln = lgamma(a);
  if (x < a + 1) { let ap = a, sum = 1 / a, del = sum; for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; } return sum * Math.exp(-x + a * Math.log(x) - gln); }
  let b = x + 1 - a, c = 1 / 1e-300, d = 1 / b, h = d; for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - gln) * h;
}
export const chi2Sf = (x: number, df: number) => 1 - gammaP(df / 2, x / 2);

// ───────── Dimensionamento (poder, amostra, MDE, duração) ─────────
export interface PlanInput { baseline: number; mdeRelative: number; alpha?: number; power?: number }
const zA = (alpha: number) => normInv(1 - alpha / 2);
/** Amostra por variante para detectar `baseline → baseline·(1+mde)` (bicaudal, duas proporções independentes). */
export function sampleSizeProportions({ baseline, mdeRelative, alpha = 0.05, power = 0.8 }: PlanInput): number {
  if (!(baseline > 0 && baseline < 1)) throw new RangeError('baseline deve estar em (0,1)'); const p1 = baseline, p2 = Math.min(0.999999, baseline * (1 + mdeRelative)); if (p2 <= p1) throw new RangeError('mdeRelative deve ser > 0');
  const pb = (p1 + p2) / 2, za = zA(alpha), zb = normInv(power); const n = ((za * Math.sqrt(2 * pb * (1 - pb)) + zb * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2) / ((p2 - p1) ** 2); return Math.ceil(n);
}
/** Amostra por variante para médias: detectar diferença absoluta `delta` com desvio-padrão `sd`. */
export function sampleSizeMeans({ sd, delta, alpha = 0.05, power = 0.8 }: { sd: number; delta: number; alpha?: number; power?: number }): number { return Math.ceil(2 * ((zA(alpha) + normInv(power)) ** 2) * (sd * sd) / (delta * delta)); }
/** Poder (1−β) para `n` por variante e MDE relativo dado. */
export function powerProportions({ baseline, mdeRelative, n, alpha = 0.05 }: { baseline: number; mdeRelative: number; n: number; alpha?: number }): number {
  const p1 = baseline, p2 = Math.min(0.999999, baseline * (1 + mdeRelative)); const se0 = Math.sqrt(2 * ((p1 + p2) / 2) * (1 - (p1 + p2) / 2) / n), se1 = Math.sqrt(p1 * (1 - p1) / n + p2 * (1 - p2) / n);
  return normCdf((Math.abs(p2 - p1) - zA(alpha) * se0) / se1);
}
/** MDE relativo mínimo detectável com `n` por variante e poder alvo (bisseção). */
export function mdeProportions({ baseline, n, alpha = 0.05, power = 0.8 }: { baseline: number; n: number; alpha?: number; power?: number }): number {
  let lo = 1e-4, hi = Math.min(10, (0.999999 / baseline) - 1); if (powerProportions({ baseline, mdeRelative: hi, n, alpha }) < power) return Infinity;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (powerProportions({ baseline, mdeRelative: mid, n, alpha }) < power) lo = mid; else hi = mid; } return hi;
}
/** Duração mínima em dias: usuários elegíveis/dia × alocação de tráfego, repartidos entre as variantes; nunca menos de 7 dias (ciclo semanal). */
export function minDurationDays({ requiredPerVariant, variants, eligiblePerDay, trafficPct = 100, minDays = 7 }: { requiredPerVariant: number; variants: number; eligiblePerDay: number; trafficPct?: number; minDays?: number }): number {
  const perDay = (eligiblePerDay * trafficPct) / 100; if (perDay <= 0) return Infinity; return Math.max(minDays, Math.ceil((requiredPerVariant * variants) / perDay));
}
/** Alfa por comparação sob Bonferroni para `k` comparações contra o controle. */
export const bonferroniAlpha = (alpha: number, k: number) => alpha / Math.max(1, k);

// ───────── Testes ─────────
export interface TestResult { diff: number; relLift: number | null; se: number; stat: number; p: number; ci: [number, number]; ciRel: [number, number] | null; /** só no t de Welch */ df?: number }
/** z de duas proporções: p-valor com erro-padrão combinado; IC (Wald, erros separados) da diferença. */
export function twoProportionZ(c: { x: number; n: number }, t: { x: number; n: number }, alpha = 0.05): TestResult {
  const p1 = c.x / c.n, p2 = t.x / t.n, diff = p2 - p1, pp = (c.x + t.x) / (c.n + t.n); const sePool = Math.sqrt(pp * (1 - pp) * (1 / c.n + 1 / t.n)); const se = Math.sqrt(p1 * (1 - p1) / c.n + p2 * (1 - p2) / t.n);
  const z = sePool === 0 ? 0 : diff / sePool; const p = sePool === 0 ? 1 : 2 * (1 - normCdf(Math.abs(z))); const k = zA(alpha); const ci: [number, number] = [diff - k * se, diff + k * se];
  return { diff, relLift: p1 > 0 ? diff / p1 : null, se, stat: z, p, ci, ciRel: p1 > 0 ? [ci[0] / p1, ci[1] / p1] : null };
}
export interface Moments { n: number; mean: number; variance: number }
/** Welch para médias com variâncias desiguais. */
export function welchT(c: Moments, t: Moments, alpha = 0.05): TestResult & { df: number } {
  const diff = t.mean - c.mean; const v1 = c.variance / c.n, v2 = t.variance / t.n; const se = Math.sqrt(v1 + v2); const df = se === 0 ? c.n + t.n - 2 : ((v1 + v2) ** 2) / ((v1 * v1) / (c.n - 1) + (v2 * v2) / (t.n - 1));
  const stat = se === 0 ? 0 : diff / se; const p = se === 0 ? 1 : 2 * (1 - tCdf(Math.abs(stat), df)); const k = tInv(1 - alpha / 2, df); const ci: [number, number] = [diff - k * se, diff + k * se];
  return { diff, relLift: c.mean !== 0 ? diff / c.mean : null, se, stat, p, df, ci, ciRel: c.mean !== 0 ? [ci[0] / Math.abs(c.mean), ci[1] / Math.abs(c.mean)] : null };
}
/** Sample Ratio Mismatch: qui-quadrado dos tamanhos observados contra os pesos configurados. p < 0.001 ⇒ resultado NÃO confiável. */
export function srmCheck(observed: number[], weights: number[]): { chi2: number; df: number; p: number; mismatch: boolean } {
  const total = observed.reduce((a, b) => a + b, 0), wsum = weights.reduce((a, b) => a + b, 0); let chi2 = 0; observed.forEach((o, i) => { const e = (total * weights[i]!) / wsum; chi2 += e > 0 ? ((o - e) ** 2) / e : 0; });
  const df = observed.length - 1; const p = total === 0 || df <= 0 ? 1 : chi2Sf(chi2, df); return { chi2, df, p, mismatch: p < 0.001 };
}

// ───────── Múltiplas comparações ─────────
export const bonferroni = (ps: number[]) => ps.map((p) => Math.min(1, p * ps.length));
/** Holm–Bonferroni (controla FWER, uniformemente mais poderoso que Bonferroni). */
export function holm(ps: number[]): number[] {
  const idx = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]); const out = new Array<number>(ps.length); let running = 0;
  idx.forEach(([p, i], rank) => { running = Math.max(running, Math.min(1, (ps.length - rank) * p)); out[i] = running; }); return out;
}
/** Benjamini–Hochberg (controla FDR). Devolve q-valores. */
export function benjaminiHochberg(ps: number[]): number[] {
  const m = ps.length; const idx = ps.map((p, i) => [p, i] as const).sort((a, b) => b[0] - a[0]); const out = new Array<number>(m); let prev = 1;
  idx.forEach(([p, i], k) => { const rank = m - k; prev = Math.min(prev, (p * m) / rank); out[i] = Math.min(1, prev); }); return out;
}
export type Correction = 'none' | 'bonferroni' | 'holm' | 'fdr';
export function adjust(ps: number[], method: Correction): number[] { return method === 'bonferroni' ? bonferroni(ps) : method === 'holm' ? holm(ps) : method === 'fdr' ? benjaminiHochberg(ps) : ps.slice(); }

// ───────── Bayesiano (opcional) ─────────
function mulberry32(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gammaSample(shape: number, rnd: () => number): number { // Marsaglia–Tsang
  if (shape < 1) return gammaSample(shape + 1, rnd) * Math.pow(rnd(), 1 / shape); const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) { let x: number, v: number; do { const u1 = rnd() || 1e-12, u2 = rnd(); x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); v = 1 + c * x; } while (v <= 0); v = v * v * v; const u = rnd(); if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v; }
}
const betaSample = (a: number, b: number, rnd: () => number) => { const x = gammaSample(a, rnd), y = gammaSample(b, rnd); return x / (x + y); };
export interface BayesResult { probTreatmentBeatsControl: number; expectedLossTreatment: number; expectedLossControl: number; liftCredible95: [number, number]; draws: number }
/** Beta-Binomial com prior Beta(α,β) (padrão uniforme). Determinístico para a mesma semente. */
export function bayesBinary(c: { x: number; n: number }, t: { x: number; n: number }, { alpha = 1, beta = 1, draws = 20_000, seed = 42 } = {}): BayesResult {
  const rnd = mulberry32(seed); let wins = 0, lossT = 0, lossC = 0; const lifts: number[] = [];
  for (let i = 0; i < draws; i++) { const pc = betaSample(alpha + c.x, beta + c.n - c.x, rnd), pt = betaSample(alpha + t.x, beta + t.n - t.x, rnd); if (pt > pc) wins++; lossT += Math.max(pc - pt, 0); lossC += Math.max(pt - pc, 0); lifts.push(pc > 0 ? pt / pc - 1 : 0); }
  lifts.sort((a, b) => a - b); return { probTreatmentBeatsControl: wins / draws, expectedLossTreatment: lossT / draws, expectedLossControl: lossC / draws, liftCredible95: [lifts[Math.floor(draws * 0.025)]!, lifts[Math.floor(draws * 0.975)]!], draws };
}

// ───────── Análise completa de um experimento ─────────
export interface VariantData { key: string; n: number; conversions?: number; mean?: number; variance?: number; weight: number }
export interface Analysis {
  metricType: 'conversion' | 'mean'; correction: Correction; alpha: number; srm: ReturnType<typeof srmCheck>;
  variants: Array<{ key: string; n: number; rate?: number; mean?: number; vsControl?: TestResult & { pAdjusted: number; significant: boolean; bayes?: BayesResult } }>;
}
export function analyze(variants: VariantData[], { metricType, alpha = 0.05, correction = 'holm', bayes = false }: { metricType: 'conversion' | 'mean'; alpha?: number; correction?: Correction; bayes?: boolean }): Analysis {
  const [control, ...rest] = variants; if (!control) throw new RangeError('sem variantes');
  const tests = rest.map((v) => metricType === 'conversion'
    ? twoProportionZ({ x: control.conversions ?? 0, n: Math.max(1, control.n) }, { x: v.conversions ?? 0, n: Math.max(1, v.n) }, alpha)
    : welchT({ n: Math.max(2, control.n), mean: control.mean ?? 0, variance: control.variance ?? 0 }, { n: Math.max(2, v.n), mean: v.mean ?? 0, variance: v.variance ?? 0 }, alpha));
  const adj = adjust(tests.map((t) => t.p), correction);
  return { metricType, correction, alpha, srm: srmCheck(variants.map((v) => v.n), variants.map((v) => v.weight)),
    variants: [{ key: control.key, n: control.n, ...(metricType === 'conversion' ? { rate: control.n ? (control.conversions ?? 0) / control.n : 0 } : { mean: control.mean ?? 0 }) },
      ...rest.map((v, i) => ({ key: v.key, n: v.n, ...(metricType === 'conversion' ? { rate: v.n ? (v.conversions ?? 0) / v.n : 0 } : { mean: v.mean ?? 0 }),
        vsControl: { ...tests[i]!, pAdjusted: adj[i]!, significant: adj[i]! < alpha, ...(bayes && metricType === 'conversion' ? { bayes: bayesBinary({ x: control.conversions ?? 0, n: control.n }, { x: v.conversions ?? 0, n: v.n }) } : {}) } }))] };
}
