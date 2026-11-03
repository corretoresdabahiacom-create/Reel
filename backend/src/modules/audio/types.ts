import { z } from 'zod';
import { SFX_IDS } from './presets.js';

export interface SfxEvent { timestampSec: number; sfxId: string; gainDb?: number }
export interface Gains { voice: number; music: number; sfx: number } // 0–2 (1 = nível original)
export interface MixInput {
  /** Vídeo de origem (referência de storage). Nunca é sobrescrito. */
  videoUrl: string;
  /** Voz pronta (ex.: voz clonada). Ausente → extrai a voz do vídeo; `null` → sem voz. */
  voiceUrl?: string | null;
  musicUrl: string;
  sfxEvents: SfxEvent[];
  gains?: Partial<Gains>;
  ducking?: boolean;
  /** Prefixo de storage onde os arquivos novos são gravados (projects/<id>/audio/<versão>/). */
  outPrefix: string;
}
export interface MixResult {
  mixedUrl: string; videoUrl: string; loudnessLufs: number; voiceDetected: boolean;
  stems: { voiceUrl: string | null; musicUrl: string; sfxUrl: string };
}

export const sfxEventSchema = z.object({ timestampSec: z.number().min(0).max(120), sfxId: z.enum(SFX_IDS as [string, ...string[]]), gainDb: z.number().min(-24).max(6).optional() });
export const gainsSchema = z.object({ voice: z.number().min(0).max(2).default(1), music: z.number().min(0).max(2).default(0.6), sfx: z.number().min(0).max(2).default(0.8) });
export const mixBodySchema = z.object({
  musicTrackId: z.string().uuid(),
  voice: z.object({ source: z.enum(['original', 'clone', 'none']).default('original'), voiceModelId: z.string().uuid().optional() }).default({ source: 'original' }),
  sfxEvents: z.array(sfxEventSchema).max(40).default([]),
  gains: gainsSchema.default({}),
  ducking: z.boolean().default(true),
}).strict();
export type MixBody = z.infer<typeof mixBodySchema>;
