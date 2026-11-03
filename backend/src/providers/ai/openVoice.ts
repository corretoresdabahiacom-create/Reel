import { spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../../config/env.js';
import { withTmp } from '../../utils/ffmpeg.js';
import type { TtsProvider } from './types.js';
import { OPEN_VOICES, edgeEnabled, kokoroInstalled, kokoroModel, piperModelPath, resolveVoice, voiceAvailable, voiceById, voiceLocale } from './voices.js';

/**
 * Vozes abertas e gratuitas, rodando no próprio servidor (instalação gratuita, APP_PROFILE=free):
 * - `espeak`: espeak-ng (pacote do sistema; pt-BR, en, es; leve, sem modelo para baixar; voz robótica);
 * - `piper`: Piper (voz neural; `pip install piper-tts` + um .onnx por voz em PIPER_VOICES_DIR, vindo do build do Docker);
 * - `kokoro`: Kokoro-82M (Apache-2.0; vozes femininas e masculinas em pt-BR/en/es);
 * - `open`: escolhe a melhor voz instalada (catálogo em voices.ts). Sem modelo, falha e o roteador usa AI_TTS_FALLBACK (espeak).
 * O texto vai pela entrada padrão (nunca como argumento de linha de comando).
 */
type Gender = 'male' | 'female' | 'neutral';
function run(cmd: string, args: string[], input: string, timeoutMs = 60_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'ignore', 'pipe'] }); let err = '';
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error(`${cmd}: tempo esgotado`)); }, timeoutMs);
    p.stderr.on('data', (d) => { err = (err + d).slice(-500); });
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (code) => { clearTimeout(t); if (code === 0) resolve(); else reject(new Error(`${cmd} saiu com ${code}: ${err.trim()}`)); });
    p.stdin.end(input);
  });
}
// eslint-disable-next-line no-control-regex -- remove caracteres de controle de propósito (texto vai para o sintetizador)
const clean = (text: string) => text.replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 5000);

const ESPEAK_VOICE: Record<string, string> = { 'pt-BR': 'pt-br', pt: 'pt-br', en: 'en-us', 'en-US': 'en-us', es: 'es', 'es-MX': 'es-419' };
export class EspeakTts implements TtsProvider {
  name = 'espeak';
  async synthesize(text: string, locale: string, voice: { gender: Gender; voiceId?: string }) {
    const t0 = Date.now(); const v = `${ESPEAK_VOICE[locale] ?? ESPEAK_VOICE[locale.slice(0, 2)] ?? 'pt-br'}${voice.gender === 'female' ? '+f3' : voice.gender === 'male' ? '+m3' : ''}`;
    const audio = await withTmp(async (dir) => { const o = join(dir, 'v.wav'); await run(env.ESPEAK_BIN, ['-v', v, '-s', '160', '--stdin', '-w', o], clean(text)); return readFile(o); });
    return { audio, ext: 'wav' as const, voice: `espeak-${v}`, usage: { provider: 'espeak', operation: 'tts', costCents: 0, latencyMs: Date.now() - t0 } };
  }
}

/** Piper: voz neural leve (um .onnx por voz em PIPER_VOICES_DIR). Sem `voiceId`, escolhe pelo idioma/gênero (catálogo). */
export const piperModelFor = (locale: string, gender: Gender): string => {
  const lang = voiceLocale(locale);
  const override = { 'pt-BR': env.PIPER_VOICE_PT_BR, en: env.PIPER_VOICE_EN, es: env.PIPER_VOICE_ES }[lang];
  if (override) return override;
  const g = gender === 'male' ? 'male' : 'female';
  const piper = OPEN_VOICES.filter((v) => v.engine === 'piper' && v.locale === lang);
  return (piper.find((v) => v.gender === g && voiceAvailable(v)) ?? piper.find((v) => v.gender === g) ?? piper[0])!.model;
};
async function piperSpeak(model: string, text: string): Promise<Buffer> {
  const file = piperModelPath(model);
  await access(file).catch(() => { throw new Error(`piper: modelo de voz ausente (${file})`); });
  return withTmp(async (dir) => { const o = join(dir, 'v.wav'); await run(env.PIPER_BIN, ['--model', file, '--output_file', o], clean(text), 120_000); return readFile(o); });
}
export class PiperTts implements TtsProvider {
  name = 'piper';
  async synthesize(text: string, locale: string, voice: { gender: Gender; voiceId?: string }) {
    const t0 = Date.now(); const chosen = voice.voiceId ? voiceById(voice.voiceId) : undefined;
    const model = chosen?.engine === 'piper' ? chosen.model : piperModelFor(locale, voice.gender);
    const audio = await piperSpeak(model, text);
    return { audio, ext: 'wav' as const, voice: `piper-${model}`, usage: { provider: 'piper', operation: 'tts', costCents: 0, latencyMs: Date.now() - t0 } };
  }
}
/** Kokoro-82M (Apache-2.0) via kokoro-onnx: vozes femininas e masculinas em pt-BR, en e es. */
async function kokoroSpeak(model: string, lang: string, text: string): Promise<Buffer> {
  if (!kokoroInstalled()) throw new Error(`kokoro: modelo ausente (${kokoroModel()})`);
  return withTmp(async (dir) => { const o = join(dir, 'v.wav');
    await run(env.KOKORO_PYTHON, [env.KOKORO_SCRIPT, kokoroModel(), env.KOKORO_VOICES, model, lang, o], clean(text), 180_000); return readFile(o); });
}
export class KokoroTts implements TtsProvider {
  name = 'kokoro';
  async synthesize(text: string, locale: string, voice: { gender: Gender; voiceId?: string }) {
    const t0 = Date.now(); const lang = voiceLocale(locale);
    const v = (voice.voiceId ? voiceById(voice.voiceId) : undefined)?.engine === 'kokoro' ? voiceById(voice.voiceId!)!
      : OPEN_VOICES.find((x) => x.engine === 'kokoro' && x.locale === lang && x.gender === (voice.gender === 'male' ? 'male' : 'female'))!;
    const audio = await kokoroSpeak(v.model, v.lang, text);
    return { audio, ext: 'wav' as const, voice: `kokoro-${v.model}`, usage: { provider: 'kokoro', operation: 'tts', costCents: 0, latencyMs: Date.now() - t0 } };
  }
}
/** Voz neural online (Edge TTS) via edge-tts; devolve MP3. Qualquer falha lança e quem chama cai para a voz local. */
async function edgeSpeak(model: string, text: string): Promise<Buffer> {
  if (!edgeEnabled()) throw new Error('edge: desligado (EDGE_TTS=0)');
  return withTmp(async (dir) => { const o = join(dir, 'v.mp3');
    await run(env.EDGE_PYTHON || env.KOKORO_PYTHON, [env.EDGE_SCRIPT, model, o], clean(text), 90_000); return readFile(o); });
}
/**
 * `open`: a melhor voz aberta INSTALADA para o idioma/gênero (ou a escolhida pelo usuário), em Piper ou Kokoro.
 * Nenhuma instalada → erro, e o roteador cai para AI_TTS_FALLBACK (espeak-ng).
 */
export class OpenTts implements TtsProvider {
  name = 'open';
  async synthesize(text: string, locale: string, voice: { gender: Gender; voiceId?: string }) {
    const t0 = Date.now(); let v = resolveVoice(locale, voice.gender, voice.voiceId);
    if (!v) throw new Error('nenhuma voz aberta instalada (Piper/Kokoro)');
    if (v.engine === 'edge') {
      try { const audio = await edgeSpeak(v.model, text); return { audio, ext: 'mp3' as const, voice: v.id, usage: { provider: 'edge', operation: 'tts', costCents: 0, latencyMs: Date.now() - t0 } }; }
      catch { // serviço fora do ar/bloqueado: mesma voz local mais próxima (mesmo idioma e gênero), sem quebrar o vídeo
        const lang = voiceLocale(locale); v = OPEN_VOICES.find((x) => x.engine !== 'edge' && x.locale === lang && x.gender === v!.gender && voiceAvailable(x)) ?? OPEN_VOICES.find((x) => x.engine !== 'edge' && x.locale === lang && voiceAvailable(x));
        if (!v) throw new Error('voz neural indisponível e nenhuma voz local instalada'); }
    }
    const audio = v.engine === 'piper' ? await piperSpeak(v.model, text) : await kokoroSpeak(v.model, v.lang, text);
    return { audio, ext: 'wav' as const, voice: v.id, usage: { provider: v.engine, operation: 'tts', costCents: 0, latencyMs: Date.now() - t0 } };
  }
}
/** A montagem narra as cenas quando a voz configurada fala de verdade (não o tom do mock). */
export const narrationEnabled = (): boolean => env.AI_TTS_PROVIDER !== 'mock';
