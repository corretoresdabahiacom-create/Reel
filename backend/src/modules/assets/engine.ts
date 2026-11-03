import { join } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { ffmpeg } from '../../utils/ffmpeg.js';
import { edgeColor, probe } from '../background/engine.js';
import type { DeviceProfile } from '../../config/deviceProfiles.js';
import type { CarProfile } from '../../config/carProfiles.js';

/**
 * Módulo 6 — conversões 100% locais (FFmpeg). Nada vai a provedor externo.
 * Loop perfeito: o trecho [início, início+dur] termina com uma fusão de `FADE` s entre a cauda e a cabeça do próprio
 * trecho; o último quadro desemboca exatamente no primeiro, então o loop não "pula".
 */
export const FADE = 0.5;
/** Sem metadados do arquivo de origem (localização, aparelho, nome): só o que o asset precisa. */
const NOMETA = ['-map_metadata', '-1'];
export const GIF_MAX_SEC = 10, GIF_MAX_BYTES = 10 * 1024 * 1024;
export const STICKER_SIZE = 512, STICKER_MAX_SEC = 6, STICKER_TARGET_BYTES = 500 * 1024; // padrão de figurinha animada (WebP 512×512, ≤500 KB)

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
/** Escala para preencher (corta o excesso). */
export const cover = (w: number, h: number) => `scale=${w}:${h}:force_original_aspect_ratio=increase:flags=lanczos,crop=${w}:${h},setsar=1`;
/** Encaixa o vídeo inteiro sobre uma cópia desfocada dele mesmo (sem barras pretas). Recebe e devolve rótulos. */
export const blurFill = (inp: string, out: string, w: number, h: number) =>
  `[${inp}]split=2[bf_a][bf_b];[bf_a]scale=${even(w / 4)}:${even(h / 4)}:force_original_aspect_ratio=increase,crop=${even(w / 4)}:${even(h / 4)},boxblur=10:2,eq=brightness=-0.06,scale=${w}:${h}[bf_bg];` +
  `[bf_b]scale=${w}:${h}:force_original_aspect_ratio=decrease:flags=lanczos[bf_fg];[bf_bg][bf_fg]overlay=(W-w)/2:(H-h)/2,setsar=1[${out}]`;
const fill = (inp: string, out: string, p: { width: number; height: number; fill: 'cover' | 'blur' }) =>
  p.fill === 'blur' ? blurFill(inp, out, p.width, p.height) : `[${inp}]${cover(p.width, p.height)}[${out}]`;

/** Trecho que dá loop: devolve o grafo que lê [0:v] e entrega [lp]. `dur` já descontado da fusão. */
export function loopGraph(start: number, dur: number, fps: number, fade = FADE): string {
  const t = (a: number) => a.toFixed(3);
  return `[0:v]fps=${fps},format=yuv420p,split=3[lp1][lp2][lp3];` +
    `[lp1]trim=start=${t(start + fade)}:end=${t(start + dur)},setpts=PTS-STARTPTS[lp_mid];` +
    `[lp2]trim=start=${t(start + dur)}:end=${t(start + dur + fade)},setpts=PTS-STARTPTS[lp_tail];` +
    `[lp3]trim=start=${t(start)}:end=${t(start + fade)},setpts=PTS-STARTPTS[lp_head];` +
    `[lp_tail][lp_head]xfade=transition=fade:duration=${t(fade)}:offset=0[lp_x];[lp_mid][lp_x]concat=n=2:v=1:a=0[lp]`;
}
/** Janela válida: começa em `start`, dura até `want` (≤ max), cabendo a fusão no fim do vídeo. */
export function clipWindow(srcDur: number, start: number, want: number, max: number, needLoop: boolean): { start: number; dur: number } {
  const s = Math.max(0, Math.min(start, Math.max(0, srcDur - 1)));
  const room = srcDur - s - (needLoop ? FADE : 0) - 0.05;
  const dur = Math.min(want, max, room);
  if (dur < 1) throw new Error('trecho curto demais');
  return { start: s, dur: Math.round(dur * 100) / 100 };
}
const size = async (f: string) => (await stat(f)).size;

/** GIF: loop perfeito, ≤10 s, ≤10 MB. Reduz largura/FPS/cores até caber. */
export async function makeGif(src: string, dir: string, o: { start: number; dur: number }): Promise<{ file: string; width: number; fps: number; colors: number }> {
  const tries: Array<[number, number, number]> = [[480, 15, 256], [400, 12, 192], [320, 12, 128], [240, 10, 96], [180, 8, 64]];
  const out = join(dir, 'out.gif');
  for (const [w, fps, colors] of tries) {
    const g = `${loopGraph(o.start, o.dur, fps)};[lp]scale=${w}:-2:flags=lanczos,split[ga][gb];[ga]palettegen=max_colors=${colors}:stats_mode=diff[gp];[gb][gp]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle[v]`;
    await ffmpeg(['-y', '-i', src, ...NOMETA, '-filter_complex', g, '-map', '[v]', '-loop', '0', out], 300_000);
    if ((await size(out)) <= GIF_MAX_BYTES) return { file: out, width: w, fps, colors };
  }
  throw new Error('GIF não coube em 10 MB');
}
/** Sticker/emote: WebP animado 512×512 com fundo transparente (cor da borda vira alfa), loop perfeito, alvo ≤500 KB. */
export async function makeSticker(src: string, dir: string, o: { start: number; dur: number }): Promise<{ file: string; keyColor: string; quality: number; fps: number }> {
  const keyColor = await edgeColor(src); const out = join(dir, 'out.webp'); const S = STICKER_SIZE;
  let last = { quality: 0, fps: 0 };
  for (const [q, fps] of [[75, 15], [60, 15], [50, 12], [40, 10], [30, 10]] as const) {
    const g = `${loopGraph(o.start, o.dur, fps)};[lp]format=rgba,colorkey=${keyColor}:0.22:0.14,scale=${S}:${S}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${S}:${S}:(ow-iw)/2:(oh-ih)/2:color=black@0,format=yuva420p[v]`;
    await ffmpeg(['-y', '-i', src, ...NOMETA, '-filter_complex', g, '-map', '[v]', '-an', '-c:v', 'libwebp_anim', '-lossless', '0', '-quality', String(q), '-loop', '0', '-preset', 'picture', out], 300_000);
    last = { quality: q, fps };
    if ((await size(out)) <= STICKER_TARGET_BYTES) break;
  }
  return { file: out, keyColor, ...last };
}
/** Wallpaper animado de celular Android / PC: MP4 (H.264) ou WebM (VP9), loop perfeito, sem áudio. */
export async function makeLoopVideo(src: string, dir: string, p: DeviceProfile, o: { start: number; dur: number }, format: 'mp4' | 'webm'): Promise<string> {
  const out = join(dir, `out.${format}`);
  const g = `${loopGraph(o.start, o.dur, p.fps)};${fill('lp', 'v0', p)};[v0]format=yuv420p[v]`;
  const codec = format === 'webm'
    ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', p.width >= 3840 ? '36' : '33', '-deadline', 'realtime', '-cpu-used', '8', '-row-mt', '1']
    : ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '20', '-movflags', '+faststart'];
  await ffmpeg(['-y', '-i', src, ...NOMETA, '-filter_complex', g, '-map', '[v]', '-an', ...codec, out], 900_000);
  return out;
}
/** iOS Live Photo: MOV (H.264 + áudio) com `com.apple.quicktime.content.identifier` e o JPEG do quadro-chave. */
export async function makeLivePhoto(src: string, dir: string, p: DeviceProfile, o: { start: number; dur: number }, contentId: string): Promise<{ mov: string; jpg: string; stillSec: number }> {
  const mov = join(dir, 'live.mov'), jpg = join(dir, 'live.jpg'); const stillSec = Math.round((o.dur / 2) * 100) / 100;
  await ffmpeg(['-y', '-ss', String(o.start), '-t', String(o.dur), '-i', src, ...NOMETA, '-vf', `fps=${p.fps},${cover(p.width, p.height)},format=yuv420p`, '-map', '0:v:0', '-map', '0:a?',
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
    '-metadata', `com.apple.quicktime.content.identifier=${contentId}`, '-movflags', 'use_metadata_tags', '-f', 'mov', mov], 300_000);
  await ffmpeg(['-y', '-ss', String(o.start + stillSec), '-i', src, ...NOMETA, '-frames:v', '1', '-vf', cover(p.width, p.height), '-q:v', '2', '-metadata', `comment=${contentId}`, jpg]);
  return { mov, jpg, stillSec };
}
/** Multimídia automotiva: MP4 H.264 **Baseline** (sem B-frames), nível do perfil, AAC-LC estéreo, faststart. */
export async function makeCar(src: string, dir: string, p: CarProfile, o: { start: number; dur: number }): Promise<string> {
  const out = join(dir, 'out.mp4'); const k = p.videoKbps;
  const g = `[0:v]fps=${p.fps},format=yuv420p[c0];${blurFill('c0', 'c1', p.width, p.height)};[c1]format=yuv420p[v]`;
  await ffmpeg(['-y', '-ss', String(o.start), '-t', String(o.dur), '-i', src, ...NOMETA, '-filter_complex', g, '-map', '[v]', '-map', '0:a?',
    '-c:v', 'libx264', '-profile:v', 'baseline', '-level:v', p.h264Level, '-preset', 'veryfast', '-bf', '0', '-g', String(p.fps * 2),
    '-b:v', `${k}k`, '-maxrate', `${k}k`, '-bufsize', `${k * 2}k`, '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-profile:a', 'aac_low', '-ar', String(p.sampleRate), '-ac', '2', '-b:a', `${p.audioKbps}k`, '-movflags', '+faststart', out], 900_000);
  return out;
}
/** Screensaver: quadros JPEG (o protetor de tela nativo de fotos lê a pasta) + o vídeo em loop. */
export async function makeScreensaver(src: string, dir: string, p: DeviceProfile, o: { start: number; dur: number }, frames = 12): Promise<{ frames: string[]; video: string }> {
  const g = `[0:v]fps=${(frames / o.dur).toFixed(4)},format=yuv420p[s0];${blurFill('s0', 's1', p.width, p.height)}`;
  await ffmpeg(['-y', '-ss', String(o.start), '-t', String(o.dur), '-i', src, ...NOMETA, '-filter_complex', g, '-map', '[s1]', '-frames:v', String(frames), '-q:v', '3', join(dir, 'ss-%02d.jpg')], 300_000);
  const list = Array.from({ length: frames }, (_, i) => join(dir, `ss-${String(i + 1).padStart(2, '0')}.jpg`));
  const video = await makeLoopVideo(src, dir, { ...p, kind: 'pc' }, o, 'mp4');
  const ok: string[] = []; for (const f of list) if (await stat(f).then(() => true, () => false)) ok.push(f);
  return { frames: ok, video };
}
export { probe, readFile };
