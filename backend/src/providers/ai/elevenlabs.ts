import { env } from '../../config/env.js';
import type { TtsProvider } from './types.js';
/**
 * ElevenLabs TTS (POST /v1/text-to-speech/{voice_id}, modelo multilíngue v2). ⚠ Não testado contra a API real (sem chave nesta fase).
 * Vozes: defina IDs reais por idioma/gênero em ELEVENLABS_VOICE_<LOCALE>_<GENDER> (ex.: ELEVENLABS_VOICE_EN_FEMALE). Custo estimado ~0,03 USD/1k caracteres.
 */
export class ElevenLabsTts implements TtsProvider {
  name = 'elevenlabs';
  async synthesize(text: string, locale: string, voice: { gender: 'male' | 'female' | 'neutral' }) {
    if (!env.ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY ausente');
    const t0 = Date.now(); const L = locale.replace('-', '_').toUpperCase();
    const voiceId = process.env[`ELEVENLABS_VOICE_${L}_${voice.gender.toUpperCase()}`] ?? process.env.ELEVENLABS_VOICE_DEFAULT ?? '21m00Tcm4TlvDq8ikWAM';
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }) });
    if (!r.ok) throw new Error(`elevenlabs ${r.status}`);
    return { audio: Buffer.from(await r.arrayBuffer()), ext: 'mp3' as const, voice: voiceId, usage: { provider: 'elevenlabs', operation: 'tts', costCents: Math.ceil(text.length / 1000 * 3), latencyMs: Date.now() - t0 } };
  }
}
