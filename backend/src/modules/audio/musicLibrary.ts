import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { env } from '../../config/env.js';
import { composerAvailable, renderMusic, COMPOSER_MOODS, type Mood } from './composer.js';
import { asSystem, asUser } from '../../db/pool.js';
import { storage } from '../../providers/storage.js';
import { ffmpeg, withTmp } from '../../utils/ffmpeg.js';
import { MUSIC_PRESETS, musicExpr, presetFromPrompt } from './presets.js';
import { audioError } from './messages.js';
import { audioProviders } from './providers.js';

export interface TrackFilters { mood?: string; genre?: string; bpmMin?: number; bpmMax?: number; maxDurationSec?: number; minDurationSec?: number; limit?: number }
export interface TrackRow { id: string; title: string; mood: string; genre: string; bpm: number; duration: number; license_region: string[]; file_url: string; owner_user_id: string | null; source: string; license?: string | null; attribution?: string | null; source_url?: string | null }
export const trackDto = (t: TrackRow) => ({ id: t.id, title: t.title, mood: t.mood, genre: t.genre, bpm: t.bpm, durationSec: t.duration, source: t.source, licenseRegions: t.license_region });

/**
 * Biblioteca licenciada por região: só aparecem as faixas cuja licença cobre a região do usuário (`*` = todas),
 * mais as que o próprio usuário gerou. O RLS garante que ninguém vê trilha gerada por outro usuário.
 */
export async function searchTracks(userId: string, region: string, f: TrackFilters = {}): Promise<TrackRow[]> {
  const w: string[] = [`(owner_user_id = $1 OR (owner_user_id IS NULL AND ('*' = ANY(license_region) OR $2 = ANY(license_region))))`]; const v: unknown[] = [userId, region];
  const add = (sql: string, val: unknown) => { v.push(val); w.push(sql.replace('?', `$${v.length}`)); };
  if (f.mood) add('mood = ?', f.mood); if (f.genre) add('genre = ?', f.genre);
  if (f.bpmMin !== undefined) add('bpm >= ?', f.bpmMin); if (f.bpmMax !== undefined) add('bpm <= ?', f.bpmMax);
  if (f.maxDurationSec !== undefined) add('duration <= ?', f.maxDurationSec); if (f.minDurationSec !== undefined) add('duration >= ?', f.minDurationSec);
  v.push(Math.min(100, f.limit ?? 50));
  return asUser(userId, async (db) => (await db.query<TrackRow>(`SELECT * FROM music_tracks WHERE ${w.join(' AND ')} ORDER BY owner_user_id NULLS LAST, mood, bpm LIMIT $${v.length}`, v)).rows);
}
/** Faixa acessível ao usuário (biblioteca da região dele ou gerada por ele); senão 404. */
export async function trackFor(userId: string, region: string, id: string): Promise<TrackRow> {
  const t = await asUser(userId, async (db) => (await db.query<TrackRow>('SELECT * FROM music_tracks WHERE id=$1', [id])).rows[0]);
  if (!t || (!t.owner_user_id && !t.license_region.includes('*') && !t.license_region.includes(region))) throw audioError(404, 'track_not_available', undefined, 'not_found');
  return t;
}

/** Geração de música original (Módulo 1): o tom vem do prompt (ex.: "calmo para spa", "energético para treino"). */
export async function generateTrack(userId: string, prompt: string, durationSec: number, projectId?: string, titleOverride?: string): Promise<TrackRow> {
  const { mood, preset } = presetFromPrompt(prompt);
  const seed = parseInt(createHash('sha256').update(`${userId}:${prompt}:${Date.now()}`).digest('hex').slice(0, 8), 16); // cada geração = peça nova
  const audio = await audioProviders.generateMusic({ mood, preset, seed }, durationSec, { userId, projectId });
  const id = randomUUID(); const ref = `uploads/${userId}/music/${id}.m4a`; // com os arquivos do usuário: some na exclusão de conta (LGPD)
  await storage.put('uploads', `${userId}/music/${id}.m4a`, audio, 'audio/mp4');
  const title = titleOverride ?? `Trilha gerada — ${prompt.trim().slice(0, 40)}`;
  return asSystem(async (db) => (await db.query<TrackRow>(`INSERT INTO music_tracks (id, title, mood, genre, bpm, duration, license_region, file_url, owner_user_id, source)
    VALUES ($1,$2,$3,'generated',$4,$5,ARRAY['*'],$6,$7,'generated') RETURNING *`, [id, title, mood, preset.bpm, durationSec, ref, userId])).rows[0]!);
}

/** Referência de storage do arquivo da faixa. As `builtin:*` são renderizadas uma vez e ficam em cache no storage. */
const rendering = new Map<string, Promise<string>>();
export async function resolveTrackFile(t: Pick<TrackRow, 'file_url' | 'duration'>): Promise<string> {
  if (!t.file_url.startsWith('builtin:')) return t.file_url.replace(/^videos\//, ''); // a biblioteca importada grava "videos/<chave>"; a referência de armazenamento é só a chave
  const name = t.file_url.slice(8); const preset = MUSIC_PRESETS[name]; if (!preset) throw audioError(404, 'track_not_available', undefined, 'not_found');
  // compositor instalado: a faixa da biblioteca vira música de verdade (instrumentos reais), renderizada uma vez e guardada
  const composed = env.AI_MUSIC_PROVIDER === 'composer' && composerAvailable() && (COMPOSER_MOODS as string[]).includes(name);
  const key = composed ? `library/builtin/${name}-composer-v1.m4a` : `library/builtin/${name}-v1.m4a`;
  if (await storage.exists('videos', key)) return key;
  let p = rendering.get(key);
  if (!p) {
    p = (composed
      ? renderMusic(name as Mood, t.duration, parseInt(createHash('sha256').update(name).digest('hex').slice(0, 8), 16)).then(async (b) => { await storage.put('videos', key, b, 'audio/mp4'); return key; })
      : withTmp(async (dir) => { const o = join(dir, 'b.m4a');
        await ffmpeg(['-f', 'lavfi', '-i', `aevalsrc='${musicExpr(preset)}':s=44100:d=${t.duration}`, '-ac', '2', '-af', 'alimiter=limit=0.9', '-c:a', 'aac', '-b:a', '160k', o]);
        await storage.put('videos', key, await readFile(o), 'audio/mp4'); return key; })).finally(() => rendering.delete(key));
    rendering.set(key, p);
  }
  return p;
}
