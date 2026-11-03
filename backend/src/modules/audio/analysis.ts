import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ffmpeg, ffprobeDuration } from '../../utils/ffmpeg.js';

/** Roda o FFmpeg e devolve o stderr (onde ficam as medições de filtros como ebur128, astats, loudnorm e showinfo). */
export function ffmpegCapture(args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-nostats', ...args], { stdio: ['ignore', 'ignore', 'pipe'] }); let err = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 4_000_000) err = err.slice(-2_000_000); });
    const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg timeout')); }, timeoutMs);
    p.on('error', (e) => { clearTimeout(t); reject(e); });
    p.on('close', (c) => { clearTimeout(t); if (c === 0) resolve(err); else reject(new Error(`ffmpeg saiu com ${c}: ${err.slice(-300)}`)); });
  });
}
export const duration = ffprobeDuration;

/** O arquivo tem pelo menos uma trilha de áudio? */
export function hasAudioStream(file: string): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', file]); let o = '';
    p.stdout.on('data', (d) => { o += d; }); p.on('error', () => resolve(false)); p.on('close', () => resolve(o.trim().length > 0));
  });
}

/** Extrai o áudio de um vídeo para WAV mono 44,1 kHz. Devolve null se o vídeo não tiver áudio. */
export async function extractAudio(videoFile: string, dir: string): Promise<string | null> {
  if (!(await hasAudioStream(videoFile))) return null;
  const out = join(dir, 'extracted.wav'); await ffmpeg(['-i', videoFile, '-vn', '-ac', '1', '-ar', '44100', out]); return out;
}

/** Nível RMS (dBFS) a cada janela de 50 ms. */
export async function rmsFrames(file: string): Promise<number[]> {
  const log = await ffmpegCapture(['-i', file, '-af', 'aformat=channel_layouts=mono,asetnsamples=n=2205:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level', '-f', 'null', '-']);
  return [...log.matchAll(/RMS_level=(-?inf|-?[\d.]+)/g)].map((x) => (x[1]!.includes('inf') ? -120 : Number(x[1])));
}

export interface VoiceActivity { hasVoice: boolean; activeRatio: number; modulationDb: number; snrDb: number; durationSec: number }
/**
 * Detecção de voz (VAD) heurística, sem modelo: fala alterna sílabas e pausas, então tem janelas ativas e inativas
 * misturadas e o nível varia bastante entre as janelas ativas. Um tom contínuo (trilha, zumbido) tem nível quase constante
 * e não é contado como voz. Limiares calibrados para não confundir trilha com voz; um VAD de verdade (ex.: Silero)
 * entra no lugar desta função sem mudar a interface.
 */
export async function detectVoice(file: string): Promise<VoiceActivity> {
  const fr = await rmsFrames(file); const durationSec = await duration(file);
  if (fr.length < 4) return { hasVoice: false, activeRatio: 0, modulationDb: 0, snrDb: 0, durationSec };
  const peak = Math.max(...fr); const thr = Math.max(-50, peak - 25);
  const act = fr.filter((x) => x > thr); const idle = fr.filter((x) => x <= thr);
  const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const ma = mean(act); const modulationDb = Math.sqrt(mean(act.map((x) => (x - ma) ** 2)));
  const activeRatio = act.length / fr.length;
  // transições ativa↔inativa por segundo (sílabas/pausas); tom contínuo quase não tem transição
  let flips = 0; for (let i = 1; i < fr.length; i++) if ((fr[i]! > thr) !== (fr[i - 1]! > thr)) flips++;
  const flipsPerSec = flips / Math.max(0.5, durationSec);
  const snrDb = idle.length ? ma - mean(idle) : 0;
  const hasVoice = peak > -45 && activeRatio > 0.15 && activeRatio < 0.97 && flipsPerSec >= 0.8 && (modulationDb > 1.5 || snrDb > 12);
  return { hasVoice, activeRatio: round(activeRatio), modulationDb: round(modulationDb), snrDb: round(snrDb), durationSec: round(durationSec) };
}

/**
 * Para gravações de narração: fala fluente (leitura contínua, sem pausas longas) quase não alterna ativo/inativo e o
 * `hasVoice` acima — calibrado para não confundir trilha com voz — a recusaria. Aceita também nível bem modulado com
 * fundo silencioso e algum respiro (tom, ruído e música contínua continuam fora).
 */
// Medido (out/2026): fala contínua de 4 s → ativo 0,90–0,97 e modulação 3,8–5,7 dB; trilha → ativo 0,99; tom/ruído → modulação ~0.
export const looksLikeSpeech = (v: VoiceActivity): boolean => v.hasVoice || (v.durationSec >= 1 && v.activeRatio > 0.15 && v.activeRatio <= 0.98 && v.modulationDb > 3 && v.snrDb > 15);
/** Loudness integrada (LUFS, EBU R128). */
export async function measureLufs(file: string): Promise<number> {
  const log = await ffmpegCapture(['-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']);
  const m = [...log.matchAll(/\bI:\s+(-?[\d.]+) LUFS/g)].pop(); return m ? Number(m[1]) : NaN;
}

/** Normalização de loudness em duas passadas (mede, depois aplica com os valores medidos) para chegar a `target` LUFS. */
export async function normalizeLoudness(input: string, output: string, target = -14, extra: string[] = []): Promise<void> {
  const log = await ffmpegCapture(['-i', input, '-af', `loudnorm=I=${target}:TP=-1.5:LRA=11:print_format=json`, '-f', 'null', '-']);
  const j = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1)) as Record<string, string>;
  const f = `loudnorm=I=${target}:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true`;
  await ffmpeg(['-i', input, '-af', `${f},aresample=44100`, ...extra, output]);
}

/** Instantes (s) de troca de cena no vídeo (detector de cena do FFmpeg). */
export async function sceneCuts(videoFile: string, threshold = 0.3): Promise<number[]> {
  const log = await ffmpegCapture(['-i', videoFile, '-an', '-vf', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-']);
  return [...log.matchAll(/pts_time:([\d.]+)/g)].map((x) => round(Number(x[1])));
}
const round = (x: number) => Math.round(x * 100) / 100;
