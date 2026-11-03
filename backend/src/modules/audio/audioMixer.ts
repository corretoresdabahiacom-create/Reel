import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { storage, refLocation } from '../../providers/storage.js';
import { ffmpeg, withTmp } from '../../utils/ffmpeg.js';
import { duration, extractAudio, detectVoice, normalizeLoudness, measureLufs, hasAudioStream } from './analysis.js';
import { sfxFile } from './sfx.js';
import type { MixInput, MixResult } from './types.js';

export const TARGET_LUFS = -14;
const AAC = ['-c:a', 'aac', '-b:a', '160k', '-ar', '44100'];
async function fetchRef(ref: string, file: string): Promise<string> { const l = refLocation(ref); await writeFile(file, await storage.get(l.bucket, l.key)); return file; }
async function putRef(ref: string, file: string, ct: string): Promise<string> { const l = refLocation(ref); await storage.put(l.bucket, l.key, await readFile(file), ct); return ref; }
const vol = (g: number | undefined, d: number) => Math.max(0, Math.min(2, g ?? d)).toFixed(3);

/**
 * Mixagem automática (Módulo 1). Envolve o vídeo final pronto — não altera `assembleVideo` nem o MP4 original:
 * 1. voz: a fornecida (voz clonada) ou extraída do vídeo; se o VAD não detectar fala, o stem de voz fica `null`;
 * 2. trilha: em loop até a duração do vídeo, com fade-out; com voz e `ducking`, abaixa sozinha quando a voz entra (sidechain);
 * 3. SFX: cada evento no seu instante;
 * 4. mix normalizado em duas passadas para -14 LUFS (padrão de Reels/Shorts/TikTok) e muxado num MP4 NOVO;
 * 5. stems separados (voz, música como soa no mix, SFX), cada um no seu arquivo.
 */
export async function mixTracks(input: MixInput): Promise<MixResult> {
  return withTmp(async (dir) => {
    const video = await fetchRef(input.videoUrl, join(dir, 'in.mp4'));
    const dur = Math.max(1, await duration(video)); const D = dur.toFixed(3);
    // 1) voz
    let voice: string | null = null;
    if (input.voiceUrl) voice = await fetchRef(input.voiceUrl, join(dir, 'voice-in'));
    else if (input.voiceUrl === undefined) voice = await extractAudio(video, dir);
    let voiceDetected = false;
    if (voice) { voiceDetected = (await detectVoice(voice)).hasVoice; if (!voiceDetected && !input.voiceUrl) voice = null; }
    // 2) música
    const music = await fetchRef(input.musicUrl, join(dir, 'music-in'));
    // 3) SFX: um stem com todos os eventos (silêncio se não houver)
    const sfxStem = join(dir, 'sfx.wav');
    const events = input.sfxEvents.filter((e) => e.timestampSec < dur).slice(0, 40);
    if (events.length) {
      const files = await Promise.all(events.map((e) => sfxFile(e.sfxId)));
      const ins = files.flatMap((f) => ['-i', f]);
      const chains = events.map((e, i) => `[${i}:a]aformat=sample_rates=44100:channel_layouts=stereo,adelay=${Math.round(e.timestampSec * 1000)}:all=1,volume=${(e.gainDb ?? 0).toFixed(1)}dB[s${i}]`).join(';');
      await ffmpeg([...ins, '-filter_complex', `${chains};${events.map((_, i) => `[s${i}]`).join('')}amix=inputs=${events.length}:normalize=0:duration=longest,apad,atrim=0:${D},volume=${vol(input.gains?.sfx, 0.8)}[out]`, '-map', '[out]', '-ar', '44100', sfxStem]);
    } else await ffmpeg(['-f', 'lavfi', '-t', D, '-i', 'anullsrc=r=44100:cl=stereo', sfxStem]);
    // 4) música (como soa no mix) + voz, ducking por sidechain
    const musicStem = join(dir, 'music.wav'), voiceStem = join(dir, 'voice.wav');
    const musicChain = `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,atrim=0:${D},asetpts=N/SR/TB,volume=${vol(input.gains?.music, 0.6)},afade=t=out:st=${Math.max(0, dur - 1.5).toFixed(2)}:d=1.5`;
    if (voice) {
      await ffmpeg(['-i', voice, '-filter_complex', `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,apad,atrim=0:${D},volume=${vol(input.gains?.voice, 1)}[out]`, '-map', '[out]', voiceStem]);
      const duck = input.ducking !== false
        ? `${musicChain}[m];[1:a]aformat=sample_rates=44100:channel_layouts=stereo[sc];[m][sc]sidechaincompress=threshold=0.02:ratio=8:attack=20:release=350:makeup=1[out]`
        : `${musicChain}[out]`;
      await ffmpeg(['-stream_loop', '-1', '-i', music, '-i', voiceStem, '-filter_complex', duck, '-map', '[out]', '-t', D, musicStem]);
    } else {
      await ffmpeg(['-stream_loop', '-1', '-i', music, '-filter_complex', `${musicChain}[out]`, '-map', '[out]', '-t', D, musicStem]);
    }
    // 5) soma + normalização -14 LUFS
    const sum = join(dir, 'sum.wav'), mixed = join(dir, 'mix.m4a');
    const parts = [musicStem, sfxStem, ...(voice ? [voiceStem] : [])];
    await ffmpeg([...parts.flatMap((f) => ['-i', f]), '-filter_complex', `${parts.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${parts.length}:normalize=0:duration=first[out]`, '-map', '[out]', '-t', D, sum]);
    await normalizeLoudness(sum, mixed, TARGET_LUFS, AAC);
    const loudnessLufs = Math.round((await measureLufs(mixed)) * 10) / 10;
    // 6) vídeo NOVO com o áudio mixado (vídeo copiado sem recodificar; original intacto)
    const outVideo = join(dir, 'video.mp4');
    await ffmpeg(['-i', video, '-i', mixed, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', outVideo]);
    // 7) stems codificados e gravados
    const enc = async (src: string, name: string) => { const o = join(dir, name); await ffmpeg(['-i', src, ...AAC, o]); return o; };
    const p = input.outPrefix.replace(/\/$/, '');
    const [mixedUrl, videoUrl, musicUrl, sfxUrl, voiceUrl] = await Promise.all([
      putRef(`${p}/mix.m4a`, mixed, 'audio/mp4'), putRef(`${p}/video.mp4`, outVideo, 'video/mp4'),
      enc(musicStem, 'stem-music.m4a').then((f) => putRef(`${p}/stem-music.m4a`, f, 'audio/mp4')),
      enc(sfxStem, 'stem-sfx.m4a').then((f) => putRef(`${p}/stem-sfx.m4a`, f, 'audio/mp4')),
      voice ? enc(voiceStem, 'stem-voice.m4a').then((f) => putRef(`${p}/stem-voice.m4a`, f, 'audio/mp4')) : Promise.resolve(null),
    ]);
    return { mixedUrl, videoUrl, loudnessLufs, voiceDetected: !!voice, stems: { voiceUrl, musicUrl, sfxUrl } };
  });
}

/**
 * Módulo 9 — substituir fala num ponto do vídeo (edição pela transcrição): silencia o áudio original em cada trecho e
 * encaixa o TTS ali (acelerado/alongado para caber, de 0,5× a 2×). O vídeo é copiado; sai um MP4 NOVO.
 */
/** `duck`: volume do áudio original nos trechos (0 = mudo, padrão do Módulo 9; o Módulo 11 usa 0,25 para a audiodescrição por cima). */
export async function spliceSpeech(videoFile: string, parts: Array<{ startSec: number; endSec: number; file: string }>, out: string, opts: { duck?: number } = {}): Promise<void> {
  const D = Math.max(0.1, await duration(videoFile)); const hasA = await hasAudioStream(videoFile);
  const ins = ['-i', videoFile, ...parts.flatMap((p) => ['-i', p.file]), ...(hasA ? [] : ['-f', 'lavfi', '-t', D.toFixed(3), '-i', 'anullsrc=r=44100:cl=stereo'])];
  const baseIn = hasA ? '0:a' : `${parts.length + 1}:a`;
  const mute = parts.map((p) => `between(t,${p.startSec.toFixed(3)},${p.endSec.toFixed(3)})`).join('+');
  const chains = [`[${baseIn}]aformat=sample_rates=44100:channel_layouts=stereo,volume=volume=${Math.max(0, Math.min(1, opts.duck ?? 0)).toFixed(2)}:enable='${mute}'[base]`];
  for (const [i, p] of parts.entries()) {
    const target = Math.max(0.1, p.endSec - p.startSec); const td = Math.max(0.1, await duration(p.file)); const f = Math.min(2, Math.max(0.5, td / target));
    chains.push(`[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=stereo,atempo=${f.toFixed(4)},apad,atrim=0:${target.toFixed(3)},adelay=${Math.round(p.startSec * 1000)}:all=1[p${i}]`);
  }
  const mix = `[base]${parts.map((_, i) => `[p${i}]`).join('')}amix=inputs=${parts.length + 1}:normalize=0:duration=first[a]`;
  await ffmpeg([...ins, '-filter_complex', `${chains.join(';')};${mix}`, '-map', '0:v', '-map', '[a]', '-c:v', 'copy', ...AAC, '-t', D.toFixed(3), out], 300_000);
}
