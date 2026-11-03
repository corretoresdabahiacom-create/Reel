import { bucket } from '../flags/featureFlags';
export interface Experiment { key: string; variants: Array<{ name: string; weight: number }> }
/** Atribuição determinística por usuário (sem estado). Registre a exposição em analytics (PostHog/Amplitude) na primeira vez que a variante for exibida. */
export function getVariant(exp: Experiment, userId: string): string {
  const total = exp.variants.reduce((a, v) => a + v.weight, 0); const b = (bucket(userId, 'ab:' + exp.key) / 100) * total; let acc = 0;
  for (const v of exp.variants) { acc += v.weight; if (b < acc) return v.name; }
  return exp.variants[exp.variants.length - 1].name;
}
export const EXPERIMENTS: Experiment[] = [{ key: 'paywall_cta', variants: [{ name: 'control', weight: 50 }, { name: 'trial', weight: 50 }] }, { key: 'onboarding_order', variants: [{ name: 'A', weight: 50 }, { name: 'B', weight: 50 }] }];
