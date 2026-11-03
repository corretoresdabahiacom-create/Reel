import { env } from '../../config/env.js';
import { measuredCall } from '../../providers/ai/measured.js';
import { bgError } from './messages.js';
import * as engine from './engine.js';

/**
 * Provedores do Módulo 2, só no servidor (R4). Hoje só existe o `mock` (motor FFmpeg local, sem IA). Um provedor real
 * (matting/inpainting) entra implementando esta interface e marcando `external: true`, o que passa a exigir o
 * consentimento `external_provider` antes de enviar a mídia (R6). O contrato precisa vetar treino com a mídia do usuário.
 */
export interface BackgroundProvider {
  name: string; external: boolean;
  remove(src: string, dir: string, opts: { fill?: string }): Promise<{ alpha: string; flat: string }>;
  generate(prompt: string, w: number, h: number, dir: string): Promise<string>;
  replace(src: string, bgImage: string, dir: string): Promise<{ out: string }>;
  outpaint(src: string, aspect: engine.Aspect, dir: string): Promise<{ out: string; W: number; H: number }>;
}
const fail = () => { if (process.env.MOCK_FAIL_BACKGROUND === '1') throw new Error('falha simulada do provedor de fundo (mock)'); };
const mock: BackgroundProvider = {
  name: 'mock', external: false,
  async remove(src, dir, opts) { fail(); return engine.removeBg(src, dir, opts); },
  async generate(prompt, w, h, dir) { fail(); return engine.generateBackground(prompt, w, h, dir); },
  async replace(src, bg, dir) { fail(); return engine.replaceBg(src, bg, dir); },
  async outpaint(src, aspect, dir) { fail(); return engine.outpaint(src, aspect, dir); },
};
const providers: Record<string, BackgroundProvider> = { mock };
export const bgProviderName = () => env.AI_BACKGROUND_PROVIDER;
export const bgProviderExternal = () => providers[env.AI_BACKGROUND_PROVIDER]!.external;

const run = <T>(operation: string, ctx: { userId: string; projectId: string }, call: (p: BackgroundProvider) => Promise<T>) =>
  measuredCall({ kind: 'background', primary: env.AI_BACKGROUND_PROVIDER, fallback: 'mock', operation, ctx, unavailable: () => bgError(503, 'background_unavailable'), call: (n) => call(providers[n]!) });
export const bgProviders = {
  remove: (src: string, dir: string, opts: { fill?: string }, ctx: { userId: string; projectId: string }) => run('bg_remove', ctx, (p) => p.remove(src, dir, opts)),
  generate: (prompt: string, w: number, h: number, dir: string, ctx: { userId: string; projectId: string }) => run('bg_generate', ctx, (p) => p.generate(prompt, w, h, dir)),
  replace: (src: string, bg: string, dir: string, ctx: { userId: string; projectId: string }) => run('bg_replace', ctx, (p) => p.replace(src, bg, dir)),
  outpaint: (src: string, aspect: engine.Aspect, dir: string, ctx: { userId: string; projectId: string }) => run('bg_outpaint', ctx, (p) => p.outpaint(src, aspect, dir)),
};
