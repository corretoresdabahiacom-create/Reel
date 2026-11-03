import { join } from 'node:path';
import { storage, refLocation } from '../../providers/storage.js';
import { ffmpeg, ffprobeDuration, withTmp, writeFile, readFile } from '../../utils/ffmpeg.js';
import { spawn } from 'node:child_process';
import { INTEGRATIONS } from '../../integrations/index.js';
import type { PlatformId } from '../../utils/validate.js';
import type { VideoInfo } from '../../integrations/types.js';
import { stat } from 'node:fs/promises';

async function dims(file: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => { const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', file]); let o = ''; p.stdout.on('data', (d) => { o += d; }); p.on('error', reject);
    p.on('close', () => { const [w, h] = o.trim().split('x').map(Number); resolve({ width: w || 0, height: h || 0 }); }); });
}
export interface Adapted { info: Omit<VideoInfo, 'path'>; applied: string[]; key: string }
/**
 * Adapta o vídeo ao perfil da plataforma (FFmpeg): 9:16 1080×1920, H.264 + AAC, `faststart`, corte na duração máxima e
 * bitrate calculado para caber no limite de tamanho. Roda no worker, antes do upload. O arquivo local é entregue ao callback `use`.
 */
export async function withAdapted<T>(platform: PlatformId, srcRef: string, projectId: string, use: (v: VideoInfo, a: Adapted) => Promise<T>): Promise<T> {
  const rules = INTEGRATIONS[platform].publish.rules; const applied: string[] = [];
  return withTmp(async (dir) => {
    const src = join(dir, 'src.mp4'), out = join(dir, 'out.mp4'); const l = refLocation(srcRef); await writeFile(src, await storage.get(l.bucket, l.key));
    const dur0 = await ffprobeDuration(src); const d0 = await dims(src);
    const maxDur = rules.maxSec - 0.5; const dur = Math.min(dur0, maxDur); if (dur0 > maxDur) applied.push(`corte para ${rules.maxSec}s`);
    if (d0.width !== 1080 || d0.height !== 1920) applied.push('ajuste para 1080×1920 (9:16)');
    const audioKbps = 128; const budgetBits = rules.maxBytes * 0.9 * 8; const vKbps = Math.max(300, Math.min(6000, Math.floor(budgetBits / Math.max(dur, 1) / 1000) - audioKbps));
    const hasAudio = await new Promise<boolean>((res) => { const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', src]); let o = ''; p.stdout.on('data', (d) => { o += d; }); p.on('close', () => res(o.trim().length > 0)); });
    await ffmpeg(['-i', src, ...(hasAudio ? [] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo']), '-t', String(dur), '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', `${vKbps}k`, '-maxrate', `${Math.round(vKbps * 1.2)}k`, '-bufsize', `${vKbps * 2}k`,
      '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-shortest', '-movflags', '+faststart', out]);
    applied.push('MP4 H.264/AAC com faststart'); const size = (await stat(out)).size; const d = await dims(out); const outDur = await ffprobeDuration(out);
    const key = `projects/${projectId}/adapted/${platform}-${Date.now()}.mp4`; await storage.put('videos', key, await readFile(out), 'video/mp4');
    const info: VideoInfo = { path: out, bytes: size, durationSec: Math.round(outDur * 100) / 100, width: d.width, height: d.height, publicUrl: rules.usesPublicUrl ? await storage.signedGetUrl('videos', key, 3600) : undefined };
    return use(info, { info, applied, key });
  });
}
