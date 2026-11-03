import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ffmpeg } from '../../utils/ffmpeg.js';
import { ffmpegCapture, normalizeLoudness, measureLufs } from '../audio/analysis.js';

/**
 * Motor de união (Módulo 4), FFmpeg local:
 * - normalizeInputs: mesma resolução (com barras se a proporção diferir), mesmo FPS, H.264/yuv420p, AAC 44,1 kHz estéreo
 *   (silêncio se o vídeo não tiver áudio) e o MESMO nível de loudness nas duas partes (replanejamento de áudio);
 * - analyzeBoundary/chooseTransition: mede luz, cor e movimento no fim do 1º e no começo do 2º e escolhe a transição;
 * - render: xfade + acrossfade e normalização final em -14 LUFS.
 */
export interface MediaInfo { width: number; height: number; fps: number; duration: number; hasAudio: boolean; sampleRate: number; channels: number; vcodec: string; acodec: string | null }
export function probeMedia(file: string): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration', '-of', 'json', file]); let o = '';
    p.stdout.on('data', (d) => { o += d; }); p.on('error', reject);
    p.on('close', () => { try {
      const j = JSON.parse(o) as { streams: Array<Record<string, string | number>>; format: { duration: string } };
      const v = j.streams.find((s) => s.codec_type === 'video') ?? {}; const a = j.streams.find((s) => s.codec_type === 'audio');
      const [n, dd] = String(v.r_frame_rate ?? '30/1').split('/').map(Number) as [number, number];
      resolve({ width: Number(v.width ?? 0), height: Number(v.height ?? 0), fps: Math.round((n / (dd || 1)) * 100) / 100, duration: Number(j.format?.duration ?? 0), hasAudio: !!a,
        sampleRate: Number(a?.sample_rate ?? 0), channels: Number(a?.channels ?? 0), vcodec: String(v.codec_name ?? ''), acodec: a ? String(a.codec_name) : null });
    } catch (e) { reject(e); } });
  });
}
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
export interface Target { width: number; height: number; fps: number }
/** Alvo comum: proporção do PRIMEIRO vídeo, maior resolução das duas (lado maior até 1920) e o maior FPS até 30. */
export function targetFor(a: MediaInfo, b: MediaInfo): Target {
  const r = a.width / a.height; let h = Math.max(a.height, b.height, 2); let w = h * r; const k = Math.min(1, 1920 / Math.max(w, h)); w *= k; h *= k;
  return { width: even(w), height: even(h), fps: Math.min(30, Math.max(a.fps || 30, b.fps || 30, 12)) };
}
export const SEGMENT_LUFS = -16, TARGET_LUFS = -14;

/** Normaliza um vídeo para o alvo e iguala o loudness (duas passadas). */
export async function normalizeOne(src: string, info: MediaInfo, t: Target, dir: string, name: string): Promise<string> {
  const vtmp = join(dir, `${name}-v.mp4`), out = join(dir, `${name}.mp4`);
  const vf = `scale=${t.width}:${t.height}:force_original_aspect_ratio=decrease,pad=${t.width}:${t.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${t.fps},format=yuv420p`;
  const audioIn = info.hasAudio ? [] : ['-f', 'lavfi', '-t', info.duration.toFixed(3), '-i', 'anullsrc=r=44100:cl=stereo'];
  await ffmpeg(['-i', src, ...audioIn, '-map', '0:v:0', '-map', info.hasAudio ? '0:a:0' : '1:a:0', '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
    '-af', 'aresample=44100,aformat=channel_layouts=stereo', '-c:a', 'aac', '-b:a', '160k', '-shortest', vtmp], 600_000);
  if (!info.hasAudio) { await ffmpeg(['-i', vtmp, '-c', 'copy', out]); return out; }
  await normalizeLoudness(vtmp, out, SEGMENT_LUFS, ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k']);
  return out;
}

/** Luz média (0–255), cor média (RGB) e movimento (diferença média entre quadros) num trecho. */
async function stats(file: string, ss: number, t: number): Promise<{ y: number; rgb: [number, number, number]; motion: number }> {
  const log = await ffmpegCapture(['-ss', ss.toFixed(3), '-t', t.toFixed(3), '-i', file, '-an', '-vf', 'signalstats,metadata=print:key=lavfi.signalstats.YAVG,metadata=print:key=lavfi.signalstats.YDIF', '-f', 'null', '-']);
  const nums = (k: string) => [...log.matchAll(new RegExp(`${k}=([\\d.]+)`, 'g'))].map((m) => Number(m[1]));
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const rgb = await new Promise<[number, number, number]>((resolve) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', ss.toFixed(3), '-i', file, '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']); const c: Buffer[] = [];
    p.stdout.on('data', (d: Buffer) => c.push(d)); p.on('close', () => { const b = Buffer.concat(c); resolve([b[0] ?? 0, b[1] ?? 0, b[2] ?? 0]); }); p.on('error', () => resolve([0, 0, 0]));
  });
  const ydif = nums('YDIF'); return { y: avg(nums('YAVG')), rgb, motion: avg(ydif.slice(1)) };
}
export interface Analysis { lumaDiff: number; colorDist: number; motion: number; endA: { y: number; rgb: number[] }; startB: { y: number; rgb: number[] } }
export async function analyzeBoundary(a: string, durA: number, b: string): Promise<Analysis> {
  const win = Math.min(1, durA / 2); const ea = await stats(a, Math.max(0, durA - win), win); const sb = await stats(b, 0, win);
  const r = (x: number) => Math.round(x * 10) / 10;
  return { lumaDiff: r(Math.abs(ea.y - sb.y)), colorDist: r(Math.hypot(ea.rgb[0] - sb.rgb[0], ea.rgb[1] - sb.rgb[1], ea.rgb[2] - sb.rgb[2])), motion: r((ea.motion + sb.motion) / 2),
    endA: { y: r(ea.y), rgb: ea.rgb }, startB: { y: r(sb.y), rgb: sb.rgb } };
}
export const TRANSITIONS = ['fade', 'fadeblack', 'dissolve', 'slideleft', 'smoothleft', 'circleopen', 'zoomin'] as const;
export type Transition = (typeof TRANSITIONS)[number];
/** Regras da transição "por IA" (heurística explicável): grava o motivo junto com as medidas. */
export function chooseTransition(x: Analysis): { type: Transition; durationSec: number; reason: string } {
  if (x.lumaDiff > 60) return { type: 'fadeblack', durationSec: 1, reason: 'luz muito diferente entre o fim do 1º e o começo do 2º: passa pelo preto para não ofuscar' };
  if (x.motion > 8) return { type: 'slideleft', durationSec: 0.6, reason: 'muito movimento nas bordas: transição direcional acompanha o ritmo' };
  if (x.colorDist > 80) return { type: 'dissolve', durationSec: 0.8, reason: 'cores diferentes com luz parecida: dissolve mistura as paletas' };
  return { type: 'fade', durationSec: 0.6, reason: 'cenas parecidas: fusão curta e discreta' };
}
/** União final: xfade no vídeo, acrossfade no áudio e normalização em -14 LUFS. */
export async function render(a: string, durA: number, b: string, tr: { type: Transition; durationSec: number }, dir: string): Promise<{ out: string; lufs: number }> {
  const d = Math.min(tr.durationSec, durA / 2); const mixed = join(dir, 'merged-raw.mp4'), out = join(dir, 'merged.mp4');
  await ffmpeg(['-i', a, '-i', b, '-filter_complex', `[0:v][1:v]xfade=transition=${tr.type}:duration=${d.toFixed(3)}:offset=${(durA - d).toFixed(3)},format=yuv420p[v];[0:a][1:a]acrossfade=d=${d.toFixed(3)}[a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', '-b:a', '160k', mixed], 900_000);
  await normalizeLoudness(mixed, out, TARGET_LUFS, ['-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart']);
  return { out, lufs: Math.round((await measureLufs(out)) * 10) / 10 };
}
