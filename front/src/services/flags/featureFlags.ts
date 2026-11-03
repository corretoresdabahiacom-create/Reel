import type { FeatureFlag, Region } from '../../types/phase5';
export interface FlagContext { userId: string; region: Region; plan: 'free' | 'pro' | 'business' }
/** Hash estável 0..99: o mesmo usuário cai sempre no mesmo balde (rollout gradual consistente). */
export function bucket(userId: string, key: string): number { let h = 2166136261; const s = key + ':' + userId; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100; }
/** Kill switch = enabled:false (vence tudo). Depois: região, plano e rollout percentual. */
export function isEnabled(flags: FeatureFlag[], key: string, ctx: FlagContext): boolean {
  const f = flags.find((x) => x.key === key); if (!f) return true; // flag desconhecida: não bloqueia
  if (!f.enabled) return false;
  if (f.regions && !f.regions.includes(ctx.region)) return false;
  if (f.plans && !f.plans.includes(ctx.plan)) return false;
  return bucket(ctx.userId, key) < f.rolloutPercent;
}
// TODO: buscar flags de um serviço remoto (LaunchDarkly/Unleash/Firebase Remote Config) com cache de 30s e fallback para o último valor conhecido.
