/** Matriz custo x qualidade por provedor/tipo de cena (docs/FINOPS/PROVIDER_MATRIX.md é gerado a partir daqui). Valores = ESTIMATIVAS iniciais; calibrar com ai_usage real. */
export type SceneType = 'simple' | 'standard' | 'complex';
export interface ProviderProfile { name: string; kind: 'video' | 'tts'; integrated: boolean; costCentsPerSec: number; p95Ms: number; quality: 1 | 2 | 3 | 4 | 5; tiers: SceneType[]; region: string; note: string }
export const PROVIDER_MATRIX: ProviderProfile[] = [
  { name: 'kling', kind: 'video', integrated: true, costCentsPerSec: 2.8, p95Ms: 80_000, quality: 4, tiers: ['simple', 'standard', 'complex'], region: 'global', note: 'Provedor primário atual (custo: KLING_COST_CENTS_PER_5S).' },
  { name: 'mock', kind: 'video', integrated: true, costCentsPerSec: 0, p95Ms: 300, quality: 1, tiers: ['simple'], region: 'local', note: 'Somente dev/teste. Nunca roteado em produção.' },
  { name: 'kling-lite', kind: 'video', integrated: false, costCentsPerSec: 1.4, p95Ms: 45_000, quality: 3, tiers: ['simple'], region: 'global', note: 'CANDIDATO (modo/modelo menor) para cenas simples — requer contrato/integração.' },
  { name: 'runway', kind: 'video', integrated: false, costCentsPerSec: 5, p95Ms: 70_000, quality: 5, tiers: ['standard', 'complex'], region: 'global', note: 'CANDIDATO de fallback premium — não integrado.' },
  { name: 'luma', kind: 'video', integrated: false, costCentsPerSec: 3.2, p95Ms: 75_000, quality: 4, tiers: ['standard', 'complex'], region: 'global', note: 'CANDIDATO de segundo provedor (exigência de BCP) — não integrado.' },
  { name: 'elevenlabs', kind: 'tts', integrated: true, costCentsPerSec: 0.9, p95Ms: 8_000, quality: 5, tiers: ['standard'], region: 'global', note: 'TTS primário.' },
  { name: 'azure-tts', kind: 'tts', integrated: false, costCentsPerSec: 0.3, p95Ms: 4_000, quality: 4, tiers: ['standard'], region: 'multi (EU disponível)', note: 'CANDIDATO de 2º TTS e de região UE — não integrado.' },
];
/** Classifica a cena: transição/close-up curto = simples (distilação: modelo menor); muita ação/texto longo = complexa. */
export function sceneComplexity(s: { text: string; durationSec: number; prompt: string }): SceneType {
  const words = s.text.trim().split(/\s+/).filter(Boolean).length; const action = /\b(corr|pul|danç|explod|luta|multid|persegu|fly|run|jump|dance|crowd|chase)/i.test(`${s.text} ${s.prompt}`);
  if (/\b(transi|close-?up|zoom|fade|corte)\b/i.test(`${s.text} ${s.prompt}`) && words <= 12 && s.durationSec <= 5 && !action) return 'simple';
  return action || words > 40 || s.durationSec > 10 ? 'complex' : 'standard';
}
/** Escolhe o provedor mais barato que atende qualidade mínima, SLA de latência e não está com circuito aberto. Só considera integrados (a menos que `includeCandidates`). */
export function chooseProvider(o: { kind: 'video' | 'tts'; tier: SceneType; minQuality?: number; maxP95Ms?: number; breakerOpen?: (name: string) => boolean; includeCandidates?: boolean; excludeMock?: boolean }): ProviderProfile | null {
  const min = o.minQuality ?? (o.tier === 'simple' ? 3 : o.tier === 'standard' ? 4 : 4);
  const c = PROVIDER_MATRIX.filter((p) => p.kind === o.kind && p.tiers.includes(o.tier) && p.quality >= min && (o.includeCandidates || p.integrated) && !(o.excludeMock !== false && p.name === 'mock') && (o.maxP95Ms === undefined || p.p95Ms <= o.maxP95Ms) && !o.breakerOpen?.(p.name));
  return c.sort((a, b) => a.costCentsPerSec - b.costCentsPerSec || b.quality - a.quality)[0] ?? null;
}
/** Agrupa cenas por provedor escolhido (batching: um lote por provedor quando o provedor tiver API de lote). */
export function batchByProvider<T extends { text: string; durationSec: number; prompt: string }>(scenes: T[], kind: 'video' | 'tts' = 'video'): Record<string, T[]> {
  const out: Record<string, T[]> = {}; for (const s of scenes) { const p = chooseProvider({ kind, tier: sceneComplexity(s), includeCandidates: true })?.name ?? 'unrouted'; (out[p] ??= []).push(s); } return out;
}
