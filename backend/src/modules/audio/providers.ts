import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { env } from '../../config/env.js';
import { ffmpeg, withTmp } from '../../utils/ffmpeg.js';
import { recordUsage, viaFallback } from '../../providers/ai/router.js';
import { audioError } from './messages.js';
import { musicExpr, speechExpr, type MusicPreset } from './presets.js';
import { COMPOSER_MOODS, renderMusic, type Mood } from './composer.js';

/**
 * Provedores do Módulo 1. Tudo no servidor (R4): o cliente nunca vê chave nem token de provedor.
 * Toda chamada passa pelo circuit breaker compartilhado (3 falhas em 5 min → abre; R14) e grava em `ai_usage` (R11),
 * inclusive quando falha. Música: `composer` (compositor local com instrumentos reais, gratuito) ou `mock` (tons de demonstração).
 */
/** `mood` + `seed` (do prompt) servem ao compositor; `preset` é o tom de demonstração do mock. */
export interface MusicSpec { mood: string; preset: MusicPreset; seed: number }
export interface MusicProvider { name: string; external: boolean; generate(spec: MusicSpec, durationSec: number): Promise<Buffer> }
export interface VoiceCloneProvider {
  name: string; external: boolean;
  /** Cria o modelo de voz a partir da amostra verificada. O contrato com o provedor real precisa de opt-out de treino global. */
  createVoice(sample: Buffer, ctx: { userId: string; consentId: string }): Promise<{ providerVoiceId: string }>;
  deleteVoice(providerVoiceId: string): Promise<void>;
  /** Narração com a voz clonada: um trecho por cena, cada um começando no início da cena. */
  speak(providerVoiceId: string, segments: { startSec: number; text: string; maxSec: number }[], totalSec: number): Promise<Buffer>;
}

class MockMusic implements MusicProvider {
  name = 'mock'; external = false;
  async generate({ preset: p }: MusicSpec, durationSec: number): Promise<Buffer> {
    if (process.env.MOCK_FAIL_MUSIC === '1') throw new Error('falha simulada do provedor de música (mock)');
    return withTmp(async (dir) => { const o = join(dir, 'g.m4a');
      await ffmpeg(['-f', 'lavfi', '-i', `aevalsrc='${musicExpr(p)}':s=44100:d=${durationSec}`, '-ac', '2', '-af', 'alimiter=limit=0.9', '-c:a', 'aac', '-b:a', '160k', o]); return readFile(o); });
  }
}
class MockVoiceClone implements VoiceCloneProvider {
  name = 'mock'; external = false;
  async createVoice(sample: Buffer) { return { providerVoiceId: `mockvoice_${createHash('sha256').update(sample).digest('hex').slice(0, 16)}` }; }
  async deleteVoice() { /* nada a apagar no mock */ }
  async speak(id: string, segments: { startSec: number; text: string; maxSec: number }[], totalSec: number): Promise<Buffer> {
    const parts = segments.filter((s) => s.text.trim()).map((s) => speechExpr(id, s.startSec, Math.max(0.6, Math.min(s.maxSec - 0.2, s.text.length / 14))));
    const expr = parts.length ? parts.join('+') : '0';
    return withTmp(async (dir) => { const o = join(dir, 'v.wav'); await ffmpeg(['-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=${Math.max(1, totalSec).toFixed(2)}`, '-ac', '1', o]); return readFile(o); });
  }
}
/** Compositor local (gratuito): peça original tocada com instrumentos reais (composer.ts). Sem soundfont, falha → mock. */
class ComposerMusic implements MusicProvider {
  name = 'composer'; external = false;
  async generate({ mood, seed }: MusicSpec, durationSec: number): Promise<Buffer> {
    if (process.env.MOCK_FAIL_MUSIC === '1') throw new Error('falha simulada do provedor de música');
    return renderMusic((COMPOSER_MOODS as string[]).includes(mood) ? (mood as Mood) : 'upbeat', durationSec, seed, (seed % 5) - 2);
  }
}
const music: Record<string, MusicProvider> = { mock: new MockMusic(), composer: new ComposerMusic() };
const voice: Record<string, VoiceCloneProvider> = { mock: new MockVoiceClone() };
export const musicProviderName = () => env.AI_MUSIC_PROVIDER;
export const voiceProviderName = () => env.AI_VOICE_CLONE_PROVIDER;
export const isExternal = (kind: 'music' | 'voice') => (kind === 'music' ? music[env.AI_MUSIC_PROVIDER]! : voice[env.AI_VOICE_CLONE_PROVIDER]!).external;

/** Chamada medida: grava ai_usage (ok ou erro) e passa pelo breaker/fallback. Falha de todos → 503 com mensagem clara. */
async function measured<T>(kind: 'music' | 'voice', operation: string, ctx: { userId: string; projectId?: string }, call: (name: string) => Promise<T>): Promise<T> {
  const primary = kind === 'music' ? env.AI_MUSIC_PROVIDER : env.AI_VOICE_CLONE_PROVIDER;
  try {
    // nomes com prefixo: o breaker de "mock" do áudio não se mistura com o do vídeo (chaves cb:open:<nome> no Redis)
    return await viaFallback(`audio_${kind}`, `${kind}:${primary}`, `${kind}:mock`, async (key) => {
      const name = key.slice(kind.length + 1); const t0 = Date.now();
      try { const r = await call(name); await recordUsage({ provider: name, operation, costCents: 0, latencyMs: Date.now() - t0, userId: ctx.userId, projectId: ctx.projectId, status: 'ok' }); return r; }
      catch (e) { await recordUsage({ provider: name, operation, costCents: 0, latencyMs: Date.now() - t0, userId: ctx.userId, projectId: ctx.projectId, status: 'error' }).catch(() => undefined); throw e; }
    });
  } catch { throw audioError(503, kind === 'music' ? 'music_unavailable' : 'voice_unavailable', undefined, 'audio_provider_unavailable'); }
}
export const audioProviders = {
  generateMusic: (spec: MusicSpec, durationSec: number, ctx: { userId: string; projectId?: string }) =>
    measured('music', 'music_generate', ctx, (n) => music[n]!.generate(spec, durationSec)),
  createVoice: (sample: Buffer, ctx: { userId: string; consentId: string }) =>
    measured('voice', 'voice_clone_create', ctx, (n) => voice[n]!.createVoice(sample, ctx)),
  deleteVoice: (id: string, ctx: { userId: string }) => measured('voice', 'voice_clone_delete', ctx, (n) => voice[n]!.deleteVoice(id)),
  speak: (id: string, segs: { startSec: number; text: string; maxSec: number }[], totalSec: number, ctx: { userId: string; projectId: string }) =>
    measured('voice', 'voice_clone_tts', ctx, (n) => voice[n]!.speak(id, segs, totalSec)),
};
