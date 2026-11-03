import type { Locale, LocalizedVersion } from '../../types/phase5';
import { LOCALES } from '../../types/phase5';
import { withRetry, withCircuitBreaker } from '../resilience/retry';
import { log } from '../observability/logger';
export const CREDITS_PER_LANGUAGE = 5;
export type VoiceGender = 'male' | 'female' | 'neutral';
export const VOICES: Record<Locale, Record<VoiceGender, string>> = {
  'pt-BR': { male: 'pt-BR-Antonio', female: 'pt-BR-Francisca', neutral: 'pt-BR-Neutra' },
  en: { male: 'en-US-Guy', female: 'en-US-Jenny', neutral: 'en-US-Neutral' },
  es: { male: 'es-MX-Jorge', female: 'es-MX-Dalia', neutral: 'es-MX-Neutra' },
};
export type DubStep = 'video' | 'audio' | 'subtitles' | 'sync';
export const DUB_STEPS: DubStep[] = ['video', 'audio', 'subtitles', 'sync'];
export interface DubOptions { voiceGender?: VoiceGender; sourceLocale?: Locale; script?: string; onProgress?: (locale: Locale, step: DubStep, pct: number) => void; sleep?: (ms: number) => Promise<void>; failLocale?: Locale }
const nap = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** Heurística simples por stopwords (mock). TODO: Whisper language-id ou Google Translate detect. */
export function detectLanguage(text: string): Locale {
  const t = ` ${text.toLowerCase()} `; const score = (w: string[]) => w.reduce((a, x) => a + (t.includes(` ${x} `) ? 1 : 0), 0);
  const pt = score(['você', 'não', 'para', 'com', 'uma', 'que', 'muito', 'melhor', 'é', 'nosso']);
  const es = score(['usted', 'para', 'con', 'una', 'que', 'muy', 'mejor', 'es', 'nuestro', 'los', 'las']);
  const en = score(['the', 'and', 'for', 'with', 'you', 'your', 'best', 'is', 'our', 'this']);
  if (en > pt && en > es) return 'en'; if (es > pt) return 'es'; return 'pt-BR';
}
/** Legendas WebVTT. A tradução do texto é mockada (TODO: Google/DeepL/GPT com glossário de marca). */
export function generateSubtitles(cues: Array<{ start: number; end: number; text: string }>, locale: Locale): string {
  const ts = (s: number) => new Date(s * 1000).toISOString().substring(11, 23);
  return 'WEBVTT\n\n' + cues.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n[${locale}] ${c.text}`).join('\n\n') + '\n';
}
// TODO TTS/dublagem real: ElevenLabs (Dubbing API), Azure Speech (neural voices) ou Google Cloud TTS. Manter esta assinatura.
async function ttsStub(_text: string, _voice: string): Promise<string> { return 'mock://audio.mp3'; }
/** Dubla um vídeo para N idiomas em paralelo; falha de um idioma não derruba os outros. */
export async function dubVideo(videoUrl: string, targetLocales: Locale[], o: DubOptions = {}): Promise<Array<LocalizedVersion & { error?: string }>> {
  const sleep = o.sleep ?? nap; const gender = o.voiceGender ?? 'neutral';
  return Promise.all(targetLocales.filter((l) => LOCALES.includes(l)).map(async (locale) => {
    try {
      return await withCircuitBreaker('dubbing', () => withRetry(async () => {
        if (o.failLocale === locale) throw new Error('Provedor de voz indisponível (simulado)');
        let pct = 0;
        for (const step of DUB_STEPS) { await sleep(300); pct += 25; o.onProgress?.(locale, step, pct); }
        await ttsStub(o.script ?? '', VOICES[locale][gender]);
        const v: LocalizedVersion = { locale, videoUrl: `${videoUrl}#dub=${locale}`, subtitlesUrl: `mock://subs/${locale}.vtt`, audioUrl: `mock://audio/${locale}.mp3`, createdAt: new Date().toISOString(), status: 'ready' };
        log('info', 'dubbing.done', { provider: 'mock', status: 'ok', locale }); return v;
      }, { retries: o.failLocale === locale ? 1 : 2, baseDelayMs: 10, sleep }));
    } catch (e) {
      log('error', 'dubbing.failed', { provider: 'mock', status: 'error', locale, error: (e as Error).message });
      return { locale, videoUrl: '', subtitlesUrl: '', audioUrl: '', createdAt: new Date().toISOString(), status: 'failed' as const, error: (e as Error).message };
    }
  }));
}
