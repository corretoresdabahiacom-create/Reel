import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ffmpeg } from '../../utils/ffmpeg.js';

/**
 * Motor local de demonstração (FFmpeg) do Módulo 2. Não usa modelo de IA:
 * - remoção: estima a cor do fundo pelas bordas do quadro e recorta por distância de cor (`colorkey`) com borda suave
 *   (`blend`), o que preserva parte de cabelo/pelos/translúcidos como alfa parcial. Funciona bem em fundo liso
 *   (foto de produto, estúdio); fundo complexo exige o provedor real de matting (ver docs/modules/BACKGROUND.md);
 * - fundo por texto: gradiente com paleta derivada do prompt ("cozinha moderna", "escritório", "praia"…);
 * - outpainting: o quadro original inteiro fica no centro (nada é cortado) e as laterais são preenchidas com uma
 *   extensão desfocada da própria imagem.
 */
export type Aspect = '16:9' | '9:16' | '1:1';
export const ASPECTS: Aspect[] = ['16:9', '9:16', '1:1'];
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

export function probe(file: string): Promise<{ width: number; height: number; duration: number; hasVideo: boolean; frames: number }> {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,nb_frames:format=duration', '-of', 'json', file]); let o = '';
    p.stdout.on('data', (d) => { o += d; }); p.on('error', () => resolve({ width: 0, height: 0, duration: 0, hasVideo: false, frames: 0 }));
    p.on('close', () => { try { const j = JSON.parse(o); const s = j.streams?.[0] ?? {}; resolve({ width: s.width ?? 0, height: s.height ?? 0, duration: Number(j.format?.duration ?? 0), hasVideo: !!s.width, frames: Number(s.nb_frames ?? 0) }); } catch { resolve({ width: 0, height: 0, duration: 0, hasVideo: false, frames: 0 }); } });
  });
}
function rawFrame(args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...args, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']); const chunks: Buffer[] = [];
    p.stdout.on('data', (d: Buffer) => chunks.push(d)); p.on('error', reject); p.on('close', (c) => (c === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error('ffmpeg falhou ao ler pixels'))));
  });
}
/** Cor média das quatro bordas (primeiro quadro), em hex. */
export async function edgeColor(file: string): Promise<string> {
  const g = '[0:v]split=4[a][b][c][d];[a]crop=iw:max(2\\,ih/40):0:0,scale=1:1[t];[b]crop=iw:max(2\\,ih/40):0:ih-max(2\\,ih/40),scale=1:1[u];[c]crop=max(2\\,iw/40):ih:0:0,scale=1:1[l];[d]crop=max(2\\,iw/40):ih:iw-max(2\\,iw/40):0,scale=1:1[r];[t][u][l][r]hstack=4[o]';
  const px = await rawFrame(['-i', file, '-filter_complex', g, '-map', '[o]', '-frames:v', '1']);
  let r = 0, gg = 0, b = 0; for (let i = 0; i < 4; i++) { r += px[i * 4]!; gg += px[i * 4 + 1]!; b += px[i * 4 + 2]!; }
  return '0x' + [r, gg, b].map((x) => Math.round(x / 4).toString(16).padStart(2, '0')).join('');
}
/** Pixels RGBA de um quadro (usado nos testes e para checar o alfa). */
export const framePixels = (file: string, w: number, h: number, at = 0) => rawFrame(['-ss', String(at), '-i', file, '-frames:v', '1', '-vf', `scale=${w}:${h}`]);

const KEY = (color: string) => `colorkey=${color}:0.22:0.14`; // similaridade + borda suave (alfa parcial)
const isImage = (f: string) => /\.(png|jpe?g|webp)$/i.test(f);

/** Remoção de fundo: PNG com alfa (foto) ou WebM VP9 com alfa + MP4 sobre cor sólida (vídeo, para o pipeline de montagem). */
export async function removeBg(src: string, dir: string, opts: { fill?: string } = {}): Promise<{ alpha: string; flat: string; keyColor: string }> {
  const keyColor = await edgeColor(src);
  if (isImage(src)) {
    const alpha = join(dir, 'cutout.png'), flat = join(dir, 'flat.png');
    await ffmpeg(['-i', src, '-vf', `format=rgba,${KEY(keyColor)}`, alpha]);
    await ffmpeg(['-f', 'lavfi', '-i', `color=c=${opts.fill ?? '0xffffff'}:s=16x16`, '-i', alpha, '-filter_complex', '[0:v][1:v]scale2ref[bg][fg];[bg][fg]overlay=0:0:format=auto,format=rgb24', '-frames:v', '1', flat]);
    return { alpha, flat, keyColor };
  }
  const alpha = join(dir, 'cutout.webm'), flat = join(dir, 'flat.mp4');
  await ffmpeg(['-i', src, '-an', '-vf', `format=rgba,${KEY(keyColor)}`, '-c:v', 'libvpx-vp9', '-pix_fmt', 'yuva420p', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '0', '-crf', '36', alpha], 300_000);
  await ffmpeg(['-i', src, '-f', 'lavfi', '-i', `color=c=${opts.fill ?? '0xffffff'}:s=16x16`, '-filter_complex', `[0:v]format=rgba,${KEY(keyColor)}[fg];[1:v][fg]scale2ref[bg][fg2];[bg][fg2]overlay=0:0:shortest=1,format=yuv420p[v]`, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'copy', '-movflags', '+faststart', flat], 300_000);
  return { alpha, flat, keyColor };
}

/** Paleta do fundo gerado por texto (provedor mock). Determinística: o mesmo prompt gera o mesmo fundo. */
const PALETTES: Array<[RegExp, string[]]> = [
  [/cozinha|kitchen|cocina/, ['0xf5e6d3', '0xd9b38c', '0x8c6a4f', '0xfaf7f2']], [/escrit|office|oficina/, ['0xdfe7ef', '0x9fb3c8', '0x52677d', '0xf4f6f8']],
  [/praia|beach|playa|mar\b/, ['0x9fd8ef', '0xf3e2b3', '0x4fb0d6', '0xfff6e0']], [/est[uú]dio|studio|branco|white|blanco/, ['0xffffff', '0xf0f0f0', '0xdedede', '0xfafafa']],
  [/natureza|jardim|garden|floresta|forest/, ['0xb7d7a8', '0x6aa36f', '0x2f6b3f', '0xe6f2dc']], [/noite|night|neon|festa|party/, ['0x1b1035', '0x6b2fb3', '0xe0428c', '0x0d0a1f']],
];
export function paletteFor(prompt: string): string[] {
  const t = prompt.toLowerCase(); const hit = PALETTES.find(([r]) => r.test(t))?.[1];
  if (hit) return hit;
  const h = createHash('sha256').update(t).digest('hex'); return [0, 6, 12, 18].map((i) => '0x' + h.slice(i, i + 6));
}
export async function generateBackground(prompt: string, w: number, h: number, dir: string): Promise<string> {
  const out = join(dir, 'bg.png'); const c = paletteFor(prompt);
  await ffmpeg(['-f', 'lavfi', '-i', `gradients=s=${even(w)}x${even(h)}:c0=${c[0]}:c1=${c[1]}:c2=${c[2]}:c3=${c[3]}:n=4:type=linear:seed=${parseInt(createHash('md5').update(prompt).digest('hex').slice(0, 6), 16)}`, '-frames:v', '1', '-vf', 'gblur=sigma=12', out]);
  return out;
}

/** Troca de fundo: recorta o primeiro plano e compõe sobre a imagem de fundo (gerada ou enviada), ajustada ao quadro. */
export async function replaceBg(src: string, bgImage: string, dir: string): Promise<{ out: string; keyColor: string }> {
  const keyColor = await edgeColor(src); const info = await probe(src); const W = even(info.width), H = even(info.height);
  const bg = `[1:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[bg]`;
  if (isImage(src)) {
    const out = join(dir, 'replaced.png');
    await ffmpeg(['-i', src, '-loop', '1', '-i', bgImage, '-filter_complex', `${bg};[0:v]format=rgba,${KEY(keyColor)}[fg];[bg][fg]overlay=0:0:format=auto,format=rgb24`, '-frames:v', '1', out]);
    return { out, keyColor };
  }
  const out = join(dir, 'replaced.mp4');
  await ffmpeg(['-i', src, '-loop', '1', '-i', bgImage, '-filter_complex', `${bg};[0:v]format=rgba,${KEY(keyColor)}[fg];[bg][fg]overlay=0:0:shortest=1,format=yuv420p[v]`, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'copy', '-shortest', '-movflags', '+faststart', out], 300_000);
  return { out, keyColor };
}

/**
 * Tamanho de saída do outpainting: só ACRESCENTA área ao redor do original (nunca corta). O lado maior fica limitado a
 * `maxSide` (1920, o máximo das plataformas): 1080x1920 → 16:9 vira 1920x1080 em vez de 3414x1920, o que deixa o
 * processamento ~3× mais leve; o original inteiro continua no centro, só reduzido.
 */
export function outpaintSize(w: number, h: number, aspect: Aspect, maxSide = 1920): { W: number; H: number } {
  const [aw, ah] = aspect.split(':').map(Number) as [number, number]; const r = aw / ah;
  let W = w / h < r ? h * r : w, Hh = w / h < r ? h : w / r; const k = Math.min(1, maxSide / Math.max(W, Hh)); W *= k; Hh *= k;
  return { W: even(W), H: even(Hh) };
}
export async function outpaint(src: string, aspect: Aspect, dir: string): Promise<{ out: string; W: number; H: number }> {
  const info = await probe(src); const { W, H } = outpaintSize(info.width, info.height, aspect);
  const g = `[0:v]split[a][b];[a]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},boxblur=24:2,eq=brightness=-0.06:saturation=0.9,setsar=1[bg];[b]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2`;
  if (isImage(src)) { const out = join(dir, 'outpaint.png'); await ffmpeg(['-i', src, '-filter_complex', `${g},format=rgb24`, '-frames:v', '1', out]); return { out, W, H }; }
  const out = join(dir, 'outpaint.mp4');
  await ffmpeg(['-i', src, '-filter_complex', `${g},format=yuv420p[v]`, '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-preset', 'veryfast', '-c:a', 'copy', '-movflags', '+faststart', out], 300_000);
  return { out, W, H };
}
/** Último quadro do vídeo (o encadeamento de cenas parte dele). */
export async function lastFrame(video: string, dir: string): Promise<string> { const f = join(dir, 'last.jpg'); await ffmpeg(['-sseof', '-0.2', '-i', video, '-frames:v', '1', '-q:v', '4', f]); return f; }
