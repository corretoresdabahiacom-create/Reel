import { env } from '../../config/env.js';
import { measuredCall } from '../../providers/ai/measured.js';
import { elError } from './messages.js';
import { logger } from '../../observability/logger.js';
import * as engine from './engine.js';

/**
 * Provedores do Módulo 3, só no servidor (R4). Hoje só o `mock` (FFmpeg local). Provedor real: `external: true` passa a
 * exigir o consentimento `external_provider`; o contrato precisa vetar treino com as referências do usuário.
 * `calls` conta toda chamada que chega ao provedor — o teste usa para provar que, sem consentimento, nada foi enviado.
 */
export interface ElementsProvider {
  name: string; external: boolean;
  insert(src: string, reference: string, at: engine.Placement, dir: string): Promise<{ out: string }>;
  recolor(src: string, box: engine.Box, hueDeg: number, dir: string): Promise<{ out: string }>;
  erase(src: string, box: engine.Box, dir: string): Promise<{ out: string }>;
}
export const providerCalls = { count: 0, lastReference: null as string | null };
const fail = () => { if (process.env.MOCK_FAIL_ELEMENTS === '1') throw new Error('falha simulada do provedor de elementos (mock)'); };
const mock: ElementsProvider = {
  name: 'mock', external: false,
  async insert(src, ref, at, dir) { providerCalls.count++; providerCalls.lastReference = ref; fail(); return engine.insertElement(src, ref, at, dir); },
  async recolor(src, box, hue, dir) { providerCalls.count++; fail(); return engine.recolor(src, box, hue, dir); },
  async erase(src, box, dir) { providerCalls.count++; fail(); return engine.eraseRegion(src, box, dir); },
};
const providers: Record<string, ElementsProvider> = { mock };
export const elProviderName = () => env.AI_ELEMENTS_PROVIDER;
export const elProviderExternal = () => providers[env.AI_ELEMENTS_PROVIDER]!.external;
/** Toda ida ao provedor deixa um log estruturado (só IDs e operação — R7). É o rastro auditável de "nada foi enviado". */
export const PROVIDER_CALL_LOG = 'elements.provider.call';
const run = <T>(operation: string, ctx: { userId: string; projectId: string }, call: (p: ElementsProvider) => Promise<T>) =>
  measuredCall({ kind: 'elements', primary: env.AI_ELEMENTS_PROVIDER, fallback: 'mock', operation, ctx, unavailable: () => elError(503, 'elements_unavailable'),
    call: (n) => { logger.info({ provider: n, operation, projectId: ctx.projectId }, PROVIDER_CALL_LOG); return call(providers[n]!); } });
export const elProviders = {
  insert: (src: string, ref: string, at: engine.Placement, dir: string, ctx: { userId: string; projectId: string }) => run('element_insert', ctx, (p) => p.insert(src, ref, at, dir)),
  recolor: (src: string, box: engine.Box, hue: number, dir: string, ctx: { userId: string; projectId: string }) => run('element_recolor', ctx, (p) => p.recolor(src, box, hue, dir)),
  erase: (src: string, box: engine.Box, dir: string, ctx: { userId: string; projectId: string }) => run('element_remove', ctx, (p) => p.erase(src, box, dir)),
};
