import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { asSystem, asUser } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo, type UserRow } from '../users/users.repository.js';
import { projectsRepo } from '../projects/projects.repository.js';
import { signRef, storage, refLocation } from '../../providers/storage.js';
import { ffmpeg, ffprobeDuration, withTmp } from '../../utils/ffmpeg.js';
import { notFound } from '../../utils/errors.js';
import { audit } from '../../repositories/audit.js';
import { env } from '../../config/env.js';
import { synthesizeSpeech } from '../../providers/ai/router.js';
import { OPEN_VOICES, voiceAvailable, voiceById, voiceLocale, resolveVoice } from '../../providers/ai/voices.js';
import type { AssemblyAudio } from '../../providers/ai/types.js';
import { detectVoice, hasAudioStream, looksLikeSpeech } from './analysis.js';
import { resolveTrackFile, trackFor, trackDto, searchTracks, generateTrack, type TrackRow } from './musicLibrary.js';
import { composerAvailable, COMPOSER_MOODS } from './composer.js';
import { audioError, msg } from './messages.js';
import { scan } from '../uploads/uploads.routes.js';

/**
 * Estúdio de voz (ff_voice_studio, desligada por padrão): escolher entre as vozes abertas instaladas e ouvir a prévia
 * (texto → voz), gravar a própria narração (tratada: ruído reduzido e volume padronizado), enviar a própria música
 * (com declaração de direitos) e guardar as escolhas do projeto, que a montagem aplica. Tudo roda no servidor, sem custo.
 */
export const STUDIO_FLAG = 'ff_voice_studio';
const ttl = () => env.AUDIO_STEM_URL_TTL_SEC;
export async function requireStudio(userId: string): Promise<UserRow> {
  const u = await asSystem((db) => usersRepo.byId(db, userId)); if (!u) throw notFound();
  if (!(await isEnabled(STUDIO_FLAG, { userId, region: u.region, plan: u.plan }))) throw notFound();
  return u;
}
interface RecordingRow { id: string; user_id: string; project_id: string | null; file_url: string; duration_sec: number; created_at: string }
const recordingDto = async (r: RecordingRow) => ({ id: r.id, projectId: r.project_id, durationSec: Math.round(r.duration_sec * 10) / 10, createdAt: r.created_at, url: await signRef(r.file_url, ttl()) });

export const audioSettingsSchema = z.object({
  narration: z.object({ mode: z.enum(['tts', 'recorded', 'none']).default('tts'), voiceId: z.string().max(80).optional(), recordingId: z.string().uuid().optional() }).default({ mode: 'tts' }),
  music: z.object({ trackId: z.string().uuid().nullable().default(null), volume: z.number().min(0).max(1).default(0.35) }).default({ trackId: null, volume: 0.35 }),
  /** Legendas queimadas no vídeo (padrão: sim). */
  captions: z.boolean().default(true),
}).strict();
export type AudioSettings = z.infer<typeof audioSettingsSchema>;

/** Converte qualquer áudio aceito para AAC tratado. `voice`: passa-alta + redução de ruído + volume de fala (-16 LUFS). */
async function transcode(buf: Buffer, kind: 'voice' | 'music'): Promise<{ audio: Buffer; durationSec: number; hasVoice: boolean }> {
  return withTmp(async (dir) => {
    const inp = join(dir, 'in.bin'), out = join(dir, 'out.m4a'); await writeFile(inp, buf);
    if (!(await hasAudioStream(inp).catch(() => false))) throw audioError(422, kind === 'voice' ? 'recording_invalid' : 'music_invalid');
    const af = kind === 'voice' ? 'highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11' : 'loudnorm=I=-16:TP=-1.5:LRA=11';
    try { await ffmpeg(['-i', inp, '-vn', '-af', af, '-ac', kind === 'voice' ? '1' : '2', '-ar', '44100', '-c:a', 'aac', '-b:a', kind === 'voice' ? '128k' : '160k', out], 300_000); }
    catch { throw audioError(422, kind === 'voice' ? 'recording_invalid' : 'music_invalid'); }
    const durationSec = await ffprobeDuration(out);
    const hasVoice = kind === 'voice' ? looksLikeSpeech(await detectVoice(out)) : false;
    return { audio: await readFile(out), durationSec, hasVoice };
  });
}

export const voiceStudio = {
  /** Vozes do catálogo com disponibilidade neste servidor, licença e a voz padrão por gênero. */
  async voices(userId: string, locale?: string) {
    await requireStudio(userId);
    const lang = locale ? voiceLocale(locale) : undefined;
    const items = OPEN_VOICES.filter((v) => !lang || v.locale === lang).map((v) => ({ id: v.id, label: v.label, locale: v.locale, gender: v.gender, engine: v.engine, license: v.license, commercial: v.commercial, available: voiceAvailable(v) }));
    const def = (g: 'female' | 'male') => (lang ? resolveVoice(lang, g)?.id ?? null : null);
    return { items, defaults: { female: def('female'), male: def('male') }, fallback: 'espeak', composer: composerAvailable() };
  },

  /** Texto → voz: gera a fala com a voz escolhida e devolve um link assinado (para ouvir ou baixar). */
  async tts(userId: string, b: { text: string; locale: string; voiceId?: string; gender?: 'female' | 'male' }) {
    await requireStudio(userId);
    if (b.text.length > env.TTS_PREVIEW_MAX_CHARS) throw audioError(400, 'tts_text_too_long', { max: env.TTS_PREVIEW_MAX_CHARS });
    if (b.voiceId && !voiceById(b.voiceId)) throw audioError(404, 'voice_not_found', undefined, 'not_found');
    let r: Awaited<ReturnType<typeof synthesizeSpeech>>;
    try { r = await synthesizeSpeech(b.text, b.locale, { gender: b.gender ?? voiceById(b.voiceId ?? '')?.gender ?? 'female', voiceId: b.voiceId }, { userId }); }
    catch { throw audioError(503, 'tts_unavailable'); }
    const { audio, durationSec } = await withTmp(async (dir) => { const i = join(dir, `t.${r.ext}`), o = join(dir, 't.m4a'); await writeFile(i, r.audio);
      await ffmpeg(['-i', i, '-ac', '1', '-ar', '44100', '-c:a', 'aac', '-b:a', '128k', o]); return { audio: await readFile(o), durationSec: await ffprobeDuration(o) }; });
    const id = randomUUID(); const key = `${userId}/tts/${id}.m4a`; await storage.put('uploads', key, audio, 'audio/mp4');
    return { id, url: await signRef(`uploads/${key}`, ttl()), expiresInSec: ttl(), durationSec: Math.round(durationSec * 10) / 10, voice: r.voice };
  },

  /** Narração gravada no app (ou enviada): checa se é áudio, se há voz e o tamanho; guarda já tratada. */
  async uploadRecording(userId: string, buf: Buffer, projectId?: string) {
    const u = await requireStudio(userId);
    if (!buf.length) throw audioError(422, 'recording_invalid');
    if (buf.length > env.RECORDING_MAX_BYTES) throw audioError(413, 'recording_too_large', { maxBytes: env.RECORDING_MAX_BYTES }, 'payload_too_large');
    if (projectId && !(await asUser(userId, (db) => projectsRepo.byId(db, projectId)))) throw audioError(404, 'project_not_found', undefined, 'not_found');
    await scan(buf);
    const t = await transcode(buf, 'voice');
    if (t.durationSec < 1) throw audioError(422, 'recording_too_short');
    if (t.durationSec > env.RECORDING_MAX_SEC + 0.5) { const e = audioError(422, 'recording_too_long', { maxSec: env.RECORDING_MAX_SEC }); e.message = msg('recording_too_long', u.locale).replace('{max}', String(env.RECORDING_MAX_SEC)); throw e; }
    if (!t.hasVoice) throw audioError(422, 'recording_no_voice');
    const id = randomUUID(); const ref = `uploads/${userId}/recordings/${id}.m4a`;
    await storage.put('uploads', `${userId}/recordings/${id}.m4a`, t.audio, 'audio/mp4');
    const row = await asUser(userId, async (db) => { const r = (await db.query<RecordingRow>(`INSERT INTO voice_recordings (id, user_id, project_id, file_url, duration_sec) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [id, userId, projectId ?? null, ref, t.durationSec])).rows[0]!;
      await audit(db, userId, 'audio.recording.create', 'voice_recording', id, { durationSec: Math.round(t.durationSec) }); return r; });
    return recordingDto(row);
  },
  async recordings(userId: string) {
    await requireStudio(userId);
    const rows = await asUser(userId, async (db) => (await db.query<RecordingRow>('SELECT * FROM voice_recordings WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [userId])).rows);
    return { items: await Promise.all(rows.map(recordingDto)) };
  },
  async deleteRecording(userId: string, id: string) {
    await requireStudio(userId);
    const row = await asUser(userId, async (db) => (await db.query<RecordingRow>('DELETE FROM voice_recordings WHERE id=$1 AND user_id=$2 RETURNING *', [id, userId])).rows[0]);
    if (!row) throw audioError(404, 'recording_not_found', undefined, 'not_found');
    const l = refLocation(row.file_url); await storage.delete(l.bucket, l.key).catch(() => undefined);
    await asSystem((db) => audit(db, userId, 'audio.recording.delete', 'voice_recording', id, {}));
    return { deleted: true };
  },

  /** Música do próprio usuário: exige a declaração de direitos; só ele vê (RLS por owner_user_id). */
  async uploadMusic(userId: string, buf: Buffer, q: { title?: string; rights?: string }) {
    await requireStudio(userId);
    if (q.rights !== 'own' && q.rights !== 'licensed') throw audioError(400, 'music_rights_required');
    if (!buf.length) throw audioError(422, 'music_invalid');
    if (buf.length > env.MUSIC_UPLOAD_MAX_BYTES) throw audioError(413, 'music_too_large', { maxBytes: env.MUSIC_UPLOAD_MAX_BYTES }, 'payload_too_large');
    await scan(buf);
    const t = await transcode(buf, 'music');
    if (t.durationSec < 5 || t.durationSec > 600) throw audioError(422, 'music_invalid');
    const id = randomUUID(); const ref = `uploads/${userId}/music/${id}.m4a`;
    await storage.put('uploads', `${userId}/music/${id}.m4a`, t.audio, 'audio/mp4');
    // eslint-disable-next-line no-control-regex -- tira caracteres de controle do título enviado
    const title = (q.title ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 80) || 'Minha música';
    const row = await asSystem(async (db) => { const r = (await db.query<TrackRow>(`INSERT INTO music_tracks (id, title, mood, genre, bpm, duration, license_region, file_url, owner_user_id, source, license)
      VALUES ($1,$2,'custom','upload',100,$3,ARRAY['*'],$4,$5,'upload',$6) RETURNING *`, [id, title, Math.max(5, Math.min(600, Math.round(t.durationSec))), ref, userId, q.rights === 'own' ? 'Declarado pelo usuário: obra própria' : 'Declarado pelo usuário: licenciada para uso'])).rows[0]!;
      await audit(db, userId, 'audio.music.upload', 'music_track', id, { rights: q.rights }); return r; });
    return trackDto(row);
  },

  /** Biblioteca (licenciada para a região) + músicas do próprio usuário (geradas ou enviadas), com licença e crédito. */
  async tracks(userId: string, mood?: string) {
    const u = await requireStudio(userId);
    const rows = await searchTracks(userId, u.region, { mood, limit: 60 });
    return { items: rows.map((t) => ({ ...trackDto(t), license: t.license ?? null, attribution: t.attribution ?? null, sourceUrl: t.source_url ?? null, mine: !!t.owner_user_id })), moods: COMPOSER_MOODS, composer: composerAvailable() };
  },
  async trackPreview(userId: string, trackId: string) {
    const u = await requireStudio(userId); const t = await trackFor(userId, u.region, trackId);
    return { url: await signRef(await resolveTrackFile(t), ttl()), expiresInSec: ttl() };
  },
  /** Música nova composta pelo app no humor pedido (instrumentos reais, sem direitos de terceiros). */
  async composeTrack(userId: string, mood: string, durationSec: number) {
    await requireStudio(userId);
    const label: Record<string, string> = { upbeat: 'Alegre', corporate: 'Corporativa', energetic: 'Energia', calm: 'Calma', emotional: 'Emoção', fun: 'Divertida', lofi: 'Lo-fi', epic: 'Épica' };
    const t = await generateTrack(userId, mood, durationSec, undefined, `Música ${label[mood] ?? mood} · ${new Date().toISOString().slice(11, 16)}`);
    return trackDto(t);
  },

  /** Escolhas de áudio do projeto (voz, gravação, música, volume). Valida a posse de cada item. */
  async setProjectAudio(userId: string, projectId: string, body: AudioSettings) {
    const u = await requireStudio(userId);
    if (!(await asUser(userId, (db) => projectsRepo.byId(db, projectId)))) throw audioError(404, 'project_not_found', undefined, 'not_found');
    const n = body.narration;
    if (n.mode === 'recorded') {
      if (!n.recordingId) throw audioError(404, 'recording_not_found', undefined, 'not_found');
      const ok = await asUser(userId, async (db) => (await db.query<{ "?column?": number | null }>('SELECT 1 FROM voice_recordings WHERE id=$1 AND user_id=$2', [n.recordingId, userId])).rowCount);
      if (!ok) throw audioError(404, 'recording_not_found', undefined, 'not_found');
    }
    if (n.voiceId && !voiceById(n.voiceId)) throw audioError(404, 'voice_not_found', undefined, 'not_found');
    if (body.music.trackId) await trackFor(userId, u.region, body.music.trackId);
    await asUser(userId, async (db) => { await db.query('UPDATE projects SET audio_settings=$2 WHERE id=$1', [projectId, body]); await audit(db, userId, 'project.audio_settings', 'project', projectId, { narration: n.mode, music: !!body.music.trackId }); });
    return this.projectAudio(userId, projectId);
  },
  async projectAudio(userId: string, projectId: string) {
    await requireStudio(userId);
    const p = await asUser(userId, (db) => projectsRepo.byId(db, projectId)) as { audio_settings?: AudioSettings | null } | undefined;
    if (!p) throw audioError(404, 'project_not_found', undefined, 'not_found');
    return { settings: p.audio_settings ?? null };
  },

  /**
   * Para a montagem: as escolhas do projeto em referências de storage. `undefined` = flag desligada ou nada escolhido
   * (a montagem segue exatamente como antes). Item que sumiu (gravação apagada) cai para a voz sintetizada.
   */
  async assemblyAudio(userId: string, projectId: string): Promise<AssemblyAudio | undefined> {
    try {
      const u = await asSystem((db) => usersRepo.byId(db, userId)); if (!u) return undefined;
      if (!(await isEnabled(STUDIO_FLAG, { userId, region: u.region, plan: u.plan }))) return undefined;
      const s = (await asSystem((db) => projectsRepo.byId(db, projectId)) as { audio_settings?: AudioSettings | null } | undefined)?.audio_settings;
      if (!s) return undefined;
      let recordingRef: string | undefined; let mode = s.narration.mode;
      if (mode === 'recorded') {
        recordingRef = (await asSystem(async (db) => (await db.query<{ file_url: string }>('SELECT file_url FROM voice_recordings WHERE id=$1 AND user_id=$2', [s.narration.recordingId, userId])).rows[0]))?.file_url;
        if (!recordingRef) mode = 'tts';
      }
      let musicRef: string | null = null;
      if (s.music.trackId) { const t = await trackFor(userId, u.region, s.music.trackId).catch(() => null); if (t) musicRef = await resolveTrackFile(t); }
      return { narration: { mode, voiceId: s.narration.voiceId, recordingRef }, musicRef, musicVolume: s.music.volume, captions: s.captions !== false };
    } catch { return undefined; } // nunca derruba a montagem por causa do estúdio
  },
};
