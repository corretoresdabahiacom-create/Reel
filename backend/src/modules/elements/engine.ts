import { join } from 'node:path';
import { ffmpeg } from '../../utils/ffmpeg.js';
import { probe, removeBg } from '../background/engine.js';

/**
 * Motor local de demonstração (FFmpeg) do Módulo 3, sem IA:
 * - inserir: recorta o fundo da foto de referência (mesmo recorte com borda suave do Módulo 2) e compõe o elemento na
 *   cena, na posição e no tamanho pedidos, com uma sombra suave para assentar no chão;
 * - recolorir (ex.: cor da roupa): gira o matiz só dentro da região indicada;
 * - remover objeto: preenche a região com o entorno (interpolação do filtro `delogo`).
 * Um provedor real (composição/inpainting generativo) entra pela interface de providers.ts.
 */
export interface Box { x: number; y: number; w: number; h: number } // frações 0–1 do quadro
export interface Placement { x: number; y: number; scale: number }  // centro do elemento (0–1) e altura relativa ao quadro
const isImage = (f: string) => /\.(png|jpe?g|webp)$/i.test(f);
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
const px = (frac: number, total: number) => Math.round(frac * total);
const vOut = (dir: string, name: string) => join(dir, name + '.mp4');
const V = ['-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart'];

/** Box em pixels, dentro do quadro e com margem de 1 px (exigência do delogo). */
export function boxPx(b: Box, W: number, H: number): { x: number; y: number; w: number; h: number } {
  const x = Math.min(Math.max(1, px(b.x, W)), W - 3), y = Math.min(Math.max(1, px(b.y, H)), H - 3);
  return { x, y, w: Math.max(2, Math.min(px(b.w, W), W - x - 1)), h: Math.max(2, Math.min(px(b.h, H), H - y - 1)) };
}

export async function insertElement(src: string, reference: string, at: Placement, dir: string): Promise<{ out: string }> {
  const info = await probe(src); const W = info.width, H = info.height;
  const cut = (await removeBg(reference, dir)).alpha; // PNG com alfa do elemento
  const eh = even(Math.max(16, at.scale * H)); const cx = px(at.x, W), cy = px(at.y, H);
  // sombra: a própria silhueta escurecida e desfocada, um pouco abaixo
  const g = `[1:v]format=rgba,scale=-2:${eh}[el];[el]split[e1][e2];[e2]colorchannelmixer=rr=0:gg=0:bb=0:aa=0.35,boxblur=6:1[sh];` +
    `[0:v][sh]overlay=x=${cx}-w/2+6:y=${cy}-h/2+10:format=auto:shortest=1[b];[b][e1]overlay=x=${cx}-w/2:y=${cy}-h/2:format=auto:shortest=1`;
  if (isImage(src)) { const out = join(dir, 'inserted.png'); await ffmpeg(['-i', src, '-i', cut, '-filter_complex', `${g},format=rgb24`, '-frames:v', '1', out]); return { out }; }
  const out = vOut(dir, 'inserted');
  await ffmpeg(['-i', src, '-loop', '1', '-i', cut, '-filter_complex', `${g}[v]`, '-map', '[v]', '-map', '0:a?', ...V, '-shortest', out], 300_000);
  return { out };
}

/** Recolorir uma região (ex.: roupa): gira o matiz em `hueDeg` só dentro da caixa. */
export async function recolor(src: string, box: Box, hueDeg: number, dir: string): Promise<{ out: string }> {
  const info = await probe(src); const b = boxPx(box, info.width, info.height);
  const g = `[0:v]split[a][b];[b]crop=${b.w}:${b.h}:${b.x}:${b.y},hue=h=${Math.round(hueDeg)}:s=1.15[c];[a][c]overlay=${b.x}:${b.y}`;
  if (isImage(src)) { const out = join(dir, 'recolor.png'); await ffmpeg(['-i', src, '-filter_complex', `${g},format=rgb24`, '-frames:v', '1', out]); return { out }; }
  const out = vOut(dir, 'recolor'); await ffmpeg(['-i', src, '-filter_complex', `${g}[v]`, '-map', '[v]', '-map', '0:a?', ...V, out], 300_000); return { out };
}

/** Remover objeto: a região é preenchida a partir das bordas (interpolação), sem deixar buraco. */
export async function eraseRegion(src: string, box: Box, dir: string): Promise<{ out: string }> {
  const info = await probe(src); const b = boxPx(box, info.width, info.height);
  const f = `delogo=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}`;
  if (isImage(src)) { const out = join(dir, 'erased.png'); await ffmpeg(['-i', src, '-vf', `format=yuv444p,${f},format=rgb24`, '-frames:v', '1', out]); return { out }; }
  const out = vOut(dir, 'erased'); await ffmpeg(['-i', src, '-vf', f, '-map', '0:v', '-map', '0:a?', ...V, out], 300_000); return { out };
}
