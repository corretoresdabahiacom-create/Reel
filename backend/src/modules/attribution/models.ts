/** Modelos de atribuição multi-touch (funções puras). O crédito soma EXATAMENTE o valor da conversão (resto distribuído pelo maior resto). */
export interface Touch { source: string; medium: string; campaign: string; at: Date }
export type Model = 'first_touch' | 'last_touch' | 'last_non_direct' | 'linear' | 'u_shaped' | 'time_decay';
export const MODELS: Model[] = ['first_touch', 'last_touch', 'last_non_direct', 'linear', 'u_shaped', 'time_decay'];
export const isDirect = (t: Touch) => t.source === 'direct';
export const channelKey = (t: Pick<Touch, 'source' | 'medium' | 'campaign'>) => `${t.source}|${t.medium}|${t.campaign}`;
function apportion(weights: number[], total: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1; const raw = weights.map((w) => (w / sum) * total); const floor = raw.map(Math.floor); let rest = total - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]); for (const [, i] of order) { if (rest <= 0) break; floor[i]!++; rest--; } return floor;
}
/** Retorna crédito por índice de touch (mesma ordem da entrada, já cronológica). `halfLifeDays` só para time_decay. */
export function attribute(touchesIn: Touch[], model: Model, valueCents: number, conversionAt: Date, halfLifeDays = 7): number[] {
  const touches = touchesIn.map((t, i) => ({ t, i })).sort((a, b) => a.t.at.getTime() - b.t.at.getTime()); const out = new Array<number>(touchesIn.length).fill(0); if (!touches.length || valueCents <= 0) return out;
  const nonDirect = touches.filter((x) => !isDirect(x.t)); const pool = model === 'first_touch' || model === 'last_touch' ? touches : nonDirect.length ? nonDirect : touches; // direto só recebe crédito se for o único contato
  let w: number[];
  switch (model) {
    case 'first_touch': w = pool.map((_, k) => (k === 0 ? 1 : 0)); break;
    case 'last_touch': w = pool.map((_, k) => (k === pool.length - 1 ? 1 : 0)); break;
    case 'last_non_direct': w = pool.map((_, k) => (k === pool.length - 1 ? 1 : 0)); break;
    case 'linear': w = pool.map(() => 1); break;
    case 'u_shaped': w = pool.length === 1 ? [1] : pool.length === 2 ? [0.5, 0.5] : pool.map((_, k) => (k === 0 || k === pool.length - 1 ? 0.4 : 0.2 / (pool.length - 2))); break;
    case 'time_decay': w = pool.map((x) => Math.pow(0.5, Math.max(0, conversionAt.getTime() - x.t.at.getTime()) / (halfLifeDays * 86_400_000))); break;
  }
  const credit = apportion(w, valueCents); pool.forEach((x, k) => { out[x.i] = credit[k]!; }); return out;
}
