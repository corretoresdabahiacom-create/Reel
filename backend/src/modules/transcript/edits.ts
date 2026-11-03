import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import type pg from 'pg';
import { storage, refLocation } from '../../providers/storage.js';
import { synthesizeSpeech } from '../../providers/ai/router.js';
import { ffmpeg, ffprobeDuration, withTmp } from '../../utils/ffmpeg.js';
import { hasAudioStream } from '../audio/analysis.js';
import { spliceSpeech } from '../audio/audioMixer.js';
import { audit } from '../../repositories/audit.js';
import { trError } from './messages.js';
import type { SceneSpan } from './stt.js';

/**
 * Módulo 9 — motor de edição usado pela transcrição E pelo agente.
 * Operações em tempo do vídeo atual: `cut` (remove o trecho) e `replace` (silencia o trecho e encaixa TTS com o texto novo,
 * via `audioMixer.spliceSpeech` do Módulo 1). `render` gera a PRÉVIA (vídeo novo + um clipe por cena afetada) sem tocar
 * no projeto; `applyRendered` cria as versões novas de cena (`derived_from_scene_id`, R2) e aponta o projeto para o vídeo
 * novo — o arquivo original continua no storage (o anterior fica guardado para desfazer).
 */
export type EditOp = { type: 'cut'; startMs: number; endMs: number; reason?: string } | { type: 'replace'; startMs: number; endMs: number; text: string; reason?: string };
export interface RenderResult { videoKey: string; durationMs: number; sourceDurationMs: number; removedMs: number; scenes: Array<{ sceneId: string; index: number; startMs: number; durationMs: number; clipKey: string | null; text: string }> }
export interface SceneRow { id: string; index: number; text: string; duration_sec: number }

/** Cenas → intervalos no vídeo (cumulativo, ajustado à duração real do arquivo). */
export function sceneSpans(scenes: SceneRow[], videoMs: number): SceneSpan[] {
  const total = scenes.reduce((a, s) => a + s.duration_sec * 1000, 0); const k = total > 0 ? videoMs / total : 1; let at = 0;
  return scenes.map((s) => { const d = s.duration_sec * 1000 * k; const span = { index: s.index, startMs: Math.round(at), endMs: Math.round(at + d), text: s.text }; at += d; return span; });
}
/** Ordena, junta cortes encostados e recusa sobreposição corte×substituição; garante ≥ 1 s de vídeo. */
export function normalizeOps(ops: EditOp[], durMs: number): EditOp[] {
  const clean = ops.map((o) => ({ ...o, startMs: Math.max(0, Math.round(o.startMs)), endMs: Math.min(durMs, Math.round(o.endMs)) })).filter((o) => o.endMs - o.startMs >= 20);
  if (clean.length !== ops.length) throw trError(422, 'invalid_range');
  const cuts = clean.filter((o) => o.type === 'cut').sort((a, b) => a.startMs - b.startMs); const merged: EditOp[] = [];
  for (const c of cuts) { const last = merged[merged.length - 1]; if (last && c.startMs <= last.endMs + 1) last.endMs = Math.max(last.endMs, c.endMs); else merged.push({ ...c }); }
  const reps = clean.filter((o) => o.type === 'replace').sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < reps.length; i++) if (reps[i]!.startMs < reps[i - 1]!.endMs) throw trError(422, 'overlapping_edits');
  for (const r of reps) if (merged.some((c) => r.startMs < c.endMs && c.startMs < r.endMs)) throw trError(422, 'overlapping_edits');
  const removed = merged.reduce((a, c) => a + (c.endMs - c.startMs), 0); if (durMs - removed < 1000) throw trError(422, 'too_short');
  return [...merged, ...reps].sort((a, b) => a.startMs - b.startMs);
}
/** Onde um instante do vídeo antigo cai no vídeo novo (descontando os cortes antes dele). */
export const mapTime = (t: number, cuts: Array<{ startMs: number; endMs: number }>) => t - cuts.reduce((a, c) => a + (t <= c.startMs ? 0 : Math.min(t, c.endMs) - c.startMs), 0);

export async function render(o: { sourceKey: string; ops: EditOp[]; scenes: SceneRow[]; sceneTexts: Map<number, string>; locale: string; outPrefix: string; ctx: { userId: string; projectId: string } }): Promise<RenderResult> {
  return withTmp(async (dir) => {
    const src = join(dir, 'in.mp4'); const l = refLocation(o.sourceKey); await writeFile(src, await storage.get(l.bucket, l.key)); // só leitura do original
    const durMs = Math.round((await ffprobeDuration(src)) * 1000); const ops = normalizeOps(o.ops, durMs);
    const cuts = ops.filter((x) => x.type === 'cut'); const reps = ops.filter((x): x is Extract<EditOp, { type: 'replace' }> => x.type === 'replace');
    let cur = src;
    if (reps.length) { // 1) substituições: TTS no ponto
      const parts: Array<{ startSec: number; endSec: number; file: string }> = [];
      for (const [i, r] of reps.entries()) { const t = await synthesizeSpeech(r.text, o.locale, { gender: 'neutral' }, o.ctx); const f = join(dir, `tts-${i}.${t.ext}`); await writeFile(f, t.audio); parts.push({ startSec: r.startMs / 1000, endSec: r.endMs / 1000, file: f }); }
      const out = join(dir, 'spliced.mp4'); await spliceSpeech(cur, parts, out); cur = out;
    }
    if (cuts.length) { // 2) cortes
      const keep = `not(${cuts.map((c) => `between(t,${(c.startMs / 1000).toFixed(3)},${(c.endMs / 1000).toFixed(3)})`).join('+')})`;
      const hasA = await hasAudioStream(cur); const out = join(dir, 'cut.mp4');
      await ffmpeg(['-i', cur, '-vf', `select='${keep}',setpts=N/FRAME_RATE/TB`, ...(hasA ? ['-af', `aselect='${keep}',asetpts=N/SR/TB`] : ['-an']), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', ...(hasA ? ['-c:a', 'aac', '-b:a', '160k'] : []), '-movflags', '+faststart', out], 600_000);
      cur = out;
    } else if (cur === src) throw trError(422, 'invalid_range');
    const newMs = Math.round((await ffprobeDuration(cur)) * 1000);
    const videoKey = `${o.outPrefix}/video.mp4`; await storage.put('videos', videoKey, await readFile(cur), 'video/mp4');
    // 3) cenas afetadas → um clipe novo por cena (vira a versão nova da cena ao aplicar)
    const spans = sceneSpans(o.scenes, durMs); const scenes: RenderResult['scenes'] = [];
    for (const s of spans) {
      const hit = ops.some((x) => x.startMs < s.endMs && s.startMs < x.endMs); if (!hit) continue;
      const a = mapTime(s.startMs, cuts), b = mapTime(s.endMs, cuts); const sceneRow = o.scenes.find((x) => x.index === s.index)!;
      let clipKey: string | null = null;
      if (b - a >= 300) { const f = join(dir, `scene-${s.index}.mp4`); await ffmpeg(['-ss', (a / 1000).toFixed(3), '-t', ((b - a) / 1000).toFixed(3), '-i', cur, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-c:a', 'aac', f]);
        clipKey = `${o.outPrefix}/scene-${s.index}.mp4`; await storage.put('videos', clipKey, await readFile(f), 'video/mp4'); }
      scenes.push({ sceneId: sceneRow.id, index: s.index, startMs: Math.round(a), durationMs: Math.round(b - a), clipKey, text: o.sceneTexts.get(s.index) ?? sceneRow.text });
    }
    return { videoKey, durationMs: newMs, sourceDurationMs: durMs, removedMs: cuts.reduce((x, c) => x + c.endMs - c.startMs, 0), scenes };
  });
}
/** Aplica a prévia (dentro da transação do chamador): versões novas de cena + vídeo novo no projeto. Recusa se o vídeo mudou. */
export async function applyRendered(db: pg.PoolClient, o: { projectId: string; userId: string; expectedSource: string; result: RenderResult; action: string; refId: string }): Promise<{ derivedSceneIds: string[]; previousVideoKey: string }> {
  const p = (await db.query<{ final_video_url: string | null }>('SELECT final_video_url FROM projects WHERE id=$1 FOR UPDATE', [o.projectId])).rows[0];
  if (!p || p.final_video_url !== o.expectedSource) throw trError(409, 'source_changed');
  const ids: string[] = [];
  for (const s of o.result.scenes) {
    const src = (await db.query<{ index: number }>('SELECT index FROM scenes WHERE id=$1 AND project_id=$2', [s.sceneId, o.projectId])).rows[0]; if (!src) continue;
    await db.query<{ pg_advisory_xact_lock: unknown }>('SELECT pg_advisory_xact_lock(hashtext($1))', [`scene:${o.projectId}:${src.index}`]);
    const dur = Math.min(15, Math.max(3, Math.round(s.durationMs / 1000))); // a regra de `scenes` exige 3–15 s; a duração real fica no resultado da edição
    const ins = await db.query<{ id: string }>(`INSERT INTO scenes (project_id, index, text, duration_sec, prompt, reference_mode, reference_images, video_url, last_frame_url, chained_from_scene_id, status, error_message, retried, consistency, version, derived_from_scene_id)
      SELECT project_id, index, $2, $3, prompt, reference_mode, reference_images, COALESCE($4, video_url), last_frame_url, chained_from_scene_id, status, error_message, retried, consistency,
             (SELECT COALESCE(MAX(version), 0) + 1 FROM scenes WHERE project_id=$5 AND index=$6), id FROM scenes WHERE id=$1 RETURNING id`,
      [s.sceneId, s.text.slice(0, 2000), dur, s.clipKey, o.projectId, src.index]);
    await db.query('UPDATE scenes SET selected=false WHERE project_id=$1 AND index=$2 AND selected', [o.projectId, src.index]); // a versão nova vira a atual
    ids.push(ins.rows[0]!.id);
  }
  await db.query('UPDATE projects SET final_video_url=$2, duration_sec=$3 WHERE id=$1', [o.projectId, o.result.videoKey, Math.max(1, Math.round(o.result.durationMs / 1000))]);
  await audit(db, o.userId, o.action, 'project', o.projectId, { refId: o.refId, derivedScenes: ids.length, removedMs: o.result.removedMs }); // sem texto
  return { derivedSceneIds: ids, previousVideoKey: o.expectedSource };
}

/** Palavras depois das edições (para o texto novo das cenas e para a transcrição derivada do vídeo novo). */
export function wordsAfter<W extends { w: string; start: number; end: number; scene: number }>(words: W[], ops: EditOp[]): Array<{ w: string; start: number; end: number; scene: number; conf: number }> {
  const cuts = ops.filter((o) => o.type === 'cut'); const reps = ops.filter((o): o is Extract<EditOp, { type: 'replace' }> => o.type === 'replace');
  const mid = (x: { start: number; end: number }) => (x.start + x.end) / 2;
  const out: Array<{ w: string; start: number; end: number; scene: number; conf: number }> = []; const done = new Set<number>();
  for (const x of words) {
    if (cuts.some((c) => mid(x) >= c.startMs && mid(x) <= c.endMs)) continue;
    const ri = reps.findIndex((r) => mid(x) >= r.startMs && mid(x) <= r.endMs);
    if (ri >= 0) { if (done.has(ri)) continue; done.add(ri); const r = reps[ri]!; const toks = r.text.split(/\s+/).filter(Boolean); const step = (r.endMs - r.startMs) / Math.max(1, toks.length);
      toks.forEach((w, i) => out.push({ w, start: Math.round(r.startMs + i * step), end: Math.round(r.startMs + (i + 0.85) * step), scene: x.scene, conf: 1 })); continue; }
    out.push({ w: x.w, start: x.start, end: x.end, scene: x.scene, conf: 1 });
  }
  return out.map((x) => ({ ...x, start: Math.round(mapTime(x.start, cuts)), end: Math.round(mapTime(x.end, cuts)) }));
}
export const textsByScene = (words: Array<{ w: string; scene: number }>) => { const m = new Map<number, string[]>(); for (const x of words) { const a = m.get(x.scene) ?? []; a.push(x.w); m.set(x.scene, a); } return new Map([...m].map(([k, v]) => [k, v.join(' ')])); };
