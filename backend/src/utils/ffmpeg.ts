import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function ffmpeg(args: string[], timeoutMs = 120_000): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg timeout')); }, timeoutMs);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (c) => { clearTimeout(t); if (c === 0) resolve(); else reject(new Error(`ffmpeg saiu com ${c}: ${err.slice(-400)}`)); });
  });
}
/** Volume médio (dB) do primeiro áudio do arquivo; -Infinity se não há áudio ou é mudo. Serve de trava: vídeo/voz sem som não passa. */
export async function meanVolumeDb(file: string): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-vn', '-af', 'volumedetect', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] }); let e = '';
    p.stderr.on('data', (d) => { e += d; }); p.on('error', () => resolve(-Infinity));
    p.on('close', () => { const m = /mean_volume:\s*(-?[\d.]+)\s*dB/.exec(e); resolve(m ? parseFloat(m[1]!) : -Infinity); });
  });
}
export async function ffprobeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]); let o = '';
    p.stdout.on('data', (d) => { o += d; }); p.on('error', reject); p.on('close', () => resolve(parseFloat(o) || 0));
  });
}
/** Diretório temporário isolado por tarefa; limpa sempre. */
export async function withTmp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'nexus-')); try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
export { writeFile, readFile };
