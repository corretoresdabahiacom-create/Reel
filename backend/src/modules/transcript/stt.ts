import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { env } from '../../config/env.js';
import { rmsFrames } from '../audio/analysis.js';

/**
 * Módulo 9 — provedores de transcrição (STT) com tempo por palavra.
 * - `openai` (Whisper, `timestamp_granularities[]=word`): dados enviados pela API não são usados para treino (política
 *   da OpenAI para a API) — não verificável aqui, sem rede/credencial.
 * - `deepgram` (nova-2): envia `mip_opt_out=true` (fora do programa de melhoria de modelo) — não verificável aqui.
 * - `mock` (dev/test): ALINHA o texto das cenas ao áudio real do vídeo — acha as janelas com som (RMS a cada 50 ms) em cada
 *   cena e distribui as palavras nelas, proporcional ao tamanho. Não "ouve": serve para exercitar o fluxo de ponta a ponta.
 */
export interface Word { w: string; start: number; end: number; conf: number; scene: number }
export interface SttResult { provider: string; language: string; words: Word[] }
export interface SceneSpan { index: number; startMs: number; endMs: number; text: string }

async function mockAlign(audioWav: string | null, scenes: SceneSpan[], language: string): Promise<SttResult> {
  const frames = audioWav ? await rmsFrames(audioWav) : []; const peak = frames.length ? Math.max(...frames) : -120; const thr = Math.max(-50, peak - 25);
  const words: Word[] = [];
  for (const s of scenes) {
    const toks = s.text.split(/\s+/).map((w) => w.trim()).filter(Boolean).slice(0, 400); if (!toks.length) continue;
    const f0 = Math.floor(s.startMs / 50), f1 = Math.min(frames.length, Math.ceil(s.endMs / 50));
    let a = -1, b = -1; for (let i = f0; i < f1; i++) if ((frames[i] ?? -120) > thr) { if (a < 0) a = i; b = i; }
    const span0 = a >= 0 ? a * 50 : s.startMs + (s.endMs - s.startMs) * 0.1, span1 = a >= 0 ? (b + 1) * 50 : s.endMs - (s.endMs - s.startMs) * 0.1;
    const weights = toks.map((w) => w.length + 2); const total = weights.reduce((x, y) => x + y, 0); const len = Math.max(200, span1 - span0);
    let at = span0;
    for (const [i, w] of toks.entries()) { const d = (weights[i]! / total) * len; words.push({ w, start: Math.round(at), end: Math.round(at + d * 0.85), conf: 0.9, scene: s.index }); at += d; }
  }
  return { provider: 'mock', language, words };
}
async function openai(audioWav: string, language: string, scenes: SceneSpan[]): Promise<SttResult> {
  const fd = new FormData(); fd.append('file', new Blob([await readFile(audioWav)], { type: 'audio/wav' }), 'audio.wav'); fd.append('model', 'whisper-1');
  fd.append('response_format', 'verbose_json'); fd.append('timestamp_granularities[]', 'word'); fd.append('language', language.slice(0, 2));
  const r = await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: fd, signal: AbortSignal.timeout(300_000) });
  if (!r.ok) throw new Error(`whisper HTTP ${r.status}`); // corpo nunca no log (teria a transcrição)
  const j = (await r.json()) as { words?: Array<{ word: string; start: number; end: number }> };
  return { provider: 'openai', language, words: (j.words ?? []).map((x) => ({ w: x.word, start: Math.round(x.start * 1000), end: Math.round(x.end * 1000), conf: 1, scene: sceneAt(scenes, x.start * 1000) })) };
}
async function deepgram(audioWav: string, language: string, scenes: SceneSpan[]): Promise<SttResult> {
  const q = new URLSearchParams({ model: 'nova-2', smart_format: 'true', punctuate: 'true', language, mip_opt_out: 'true' }); // opt-out de treino
  const r = await fetch(`https://api.deepgram.com/v1/listen?${q}`, { method: 'POST', headers: { authorization: `Token ${env.DEEPGRAM_API_KEY}`, 'content-type': 'audio/wav' }, body: new Uint8Array(await readFile(audioWav)) as unknown as BodyInit, signal: AbortSignal.timeout(300_000) });
  if (!r.ok) throw new Error(`deepgram HTTP ${r.status}`);
  const j = (await r.json()) as { results?: { channels?: Array<{ alternatives?: Array<{ words?: Array<{ punctuated_word?: string; word: string; start: number; end: number; confidence: number }> }> }> } };
  const ws = j.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
  return { provider: 'deepgram', language, words: ws.map((x) => ({ w: x.punctuated_word ?? x.word, start: Math.round(x.start * 1000), end: Math.round(x.end * 1000), conf: x.confidence, scene: sceneAt(scenes, x.start * 1000) })) };
}
/** Whisper local (código aberto, gratuito): roda no próprio servidor; o áudio não sai da máquina. */
async function whisperLocal(audioWav: string, language: string, scenes: SceneSpan[]): Promise<SttResult> {
  const out = await new Promise<string>((resolve, reject) => {
    const p = spawn(env.WHISPER_PYTHON, [env.WHISPER_SCRIPT, audioWav, env.WHISPER_MODEL, language], { env: { ...process.env, WHISPER_MODELS_DIR: env.WHISPER_MODELS_DIR }, stdio: ['ignore', 'pipe', 'pipe'] });
    let o = '', e = ''; const t = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('whisper: tempo esgotado')); }, 600_000);
    p.stdout.on('data', (d) => { o += d; }); p.stderr.on('data', (d) => { e = (e + d).slice(-400); });
    p.on('error', (err) => { clearTimeout(t); reject(err); });
    p.on('close', (code) => { clearTimeout(t); if (code === 0) resolve(o); else reject(new Error(`whisper saiu com ${code}: ${e.trim().split('\n').pop() ?? ''}`)); });
  });
  let j: { words?: Array<{ w: string; start: number; end: number; conf?: number }> };
  try { j = JSON.parse(out) as typeof j; } catch { throw new Error('whisper: saída inválida'); }
  return { provider: 'whisper', language, words: (j.words ?? []).filter((x) => x.w && Number.isFinite(x.start) && Number.isFinite(x.end))
    .map((x) => ({ w: x.w, start: Math.round(x.start * 1000), end: Math.round(x.end * 1000), conf: x.conf ?? 1, scene: sceneAt(scenes, x.start * 1000) })) };
}
export const sceneAt = (scenes: SceneSpan[], ms: number) => (scenes.find((s) => ms >= s.startMs && ms < s.endMs) ?? scenes[scenes.length - 1])?.index ?? 0;
export const sttProviderName = () => env.AI_STT_PROVIDER;
export async function transcribeAudio(audioWav: string | null, scenes: SceneSpan[], language: string): Promise<SttResult> {
  const p = env.AI_STT_PROVIDER;
  if (p === 'mock' || !audioWav) return mockAlign(audioWav, scenes, language);
  if (p === 'whisper') return whisperLocal(audioWav, language, scenes);
  return p === 'openai' ? openai(audioWav, language, scenes) : deepgram(audioWav, language, scenes);
}
