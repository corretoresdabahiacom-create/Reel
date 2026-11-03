/** Atribuição determinística de variantes (sem estado): mesmo usuário + mesmo experimento ⇒ mesma variante, sempre. */
export interface Variant { key: string; name?: string; weight: number }
export interface Target { plans?: string[]; regions?: string[]; countries?: string[]; newUsersOnly?: boolean }
export interface UserFacts { id: string; plan: string; region: string; country?: string | null; createdAt: Date }
/** FNV-1a 32 bits + finalizador murmur3 (fmix32) para boa avalanche mesmo com UUIDs parecidos. */
export function hash32(s: string): number {
  let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; h ^= h >>> 16; return h >>> 0;
}
/** Balde 0..9999 independente por propósito (`traffic`, `variant`, `holdout`) — evita correlação entre alocação e variante. */
export const bucket10k = (purpose: string, salt: string, userId: string) => hash32(`${purpose}:${salt}:${userId}`) % 10_000;
export function inHoldout(userId: string, holdoutPct: number): boolean { return holdoutPct > 0 && bucket10k('holdout', 'global', userId) < holdoutPct * 100; }
export function eligible(t: Target, u: UserFacts, startAt: Date | null): boolean {
  if (t.plans?.length && !t.plans.includes(u.plan)) return false; if (t.regions?.length && !t.regions.includes(u.region)) return false;
  if (t.countries?.length && (!u.country || !t.countries.includes(u.country))) return false; if (t.newUsersOnly && startAt && u.createdAt < startAt) return false; return true;
}
export function pickVariant(variants: Variant[], salt: string, key: string, userId: string): string {
  const total = variants.reduce((a, v) => a + v.weight, 0); const x = (bucket10k('variant', `${salt}:${key}`, userId) / 10_000) * total; let acc = 0;
  for (const v of variants) { acc += v.weight; if (x < acc) return v.key; } return variants[variants.length - 1]!.key;
}
export const inTraffic = (trafficPct: number, salt: string, key: string, userId: string) => trafficPct >= 100 || bucket10k('traffic', `${salt}:${key}`, userId) < trafficPct * 100;
export function decide(e: { key: string; salt: string; variants: Variant[]; trafficPct: number; target: Target; startAt: Date | null; respectsHoldout: boolean }, u: UserFacts, holdoutPct: number): { variant: string; inExperiment: boolean; reason: string } {
  const control = e.variants[0]!.key;
  if (e.respectsHoldout && inHoldout(u.id, holdoutPct)) return { variant: control, inExperiment: false, reason: 'holdout' };
  if (!eligible(e.target, u, e.startAt)) return { variant: control, inExperiment: false, reason: 'not_eligible' };
  if (!inTraffic(e.trafficPct, e.salt, e.key, u.id)) return { variant: control, inExperiment: false, reason: 'outside_traffic' };
  return { variant: pickVariant(e.variants, e.salt, e.key, u.id), inExperiment: true, reason: 'assigned' };
}
