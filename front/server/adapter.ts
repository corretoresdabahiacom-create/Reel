import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';

/** FFmpeg: vertical 1080×1920 (crop central), H.264/AAC, corta em maxSec e, se passar do limite de tamanho, recodifica com bitrate calculado. */
export interface Profile { maxSec: number; maxMB: number; width: number; height: number }
const run = (args: string[]) => new Promise<void>((res, rej) => { const p = spawn('ffmpeg', ['-y', ...args], { stdio: 'ignore' }); p.on('error', rej); p.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))); });

export async function adapt(input: string, output: string, pr: Profile): Promise<{ applied: string[]; sizeBytes: number; durationSec: number }> {
  const applied = ['resize 9:16', 'transcode H.264/AAC', `trim ≤${pr.maxSec}s`];
  const vf = `scale=${pr.width}:${pr.height}:force_original_aspect_ratio=increase,crop=${pr.width}:${pr.height}`;
  const base = ['-i', input, '-t', String(pr.maxSec), '-vf', vf, '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart'];
  await run([...base, '-crf', '23', output]);
  let size = statSync(output).size;
  if (size > pr.maxMB * 1024 * 1024) {
    const kbps = Math.floor(((pr.maxMB * 0.92 * 8192) / pr.maxSec) - 128); // 8% de folga, áudio 128 kbps
    await run([...base, '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`, output]);
    size = statSync(output).size; applied.push(`compress ≤${pr.maxMB}MB`);
  }
  return { applied, sizeBytes: size, durationSec: pr.maxSec }; // TODO: ler duração real com ffprobe
}
