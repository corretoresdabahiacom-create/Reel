import { asSystem, asUser, pool, tx } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo, type UserRow } from '../users/users.repository.js';
import { projectsRepo } from '../projects/projects.repository.js';
import { enqueue, Q } from '../../queues/index.js';
import { signRef, storage } from '../../providers/storage.js';
import { AppError, notFound } from '../../utils/errors.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { mixTracks, TARGET_LUFS } from './audioMixer.js';
import { resolveTrackFile, searchTracks, generateTrack, trackFor, trackDto, type TrackFilters } from './musicLibrary.js';
import { suggestSfx } from './sfxSuggester.js';
import { voiceClone } from './voiceClone.js';
import { audioProviders, isExternal, musicProviderName, voiceProviderName } from './providers.js';
import { MOODS, SFX } from './presets.js';
import { audioError, AUDIO_MESSAGES } from './messages.js';
import type { MixBody } from './types.js';
import type { Row } from '../../db/rows.generated.js';

export const FLAG = 'ff_audio';
interface VersionRow {
  id: string; project_id: string; source_video_key: string; music_track_id: string | null; voice_source: string; voice_model_id: string | null;
  settings: { gains?: Record<string, number>; ducking?: boolean }; sfx_events: { timestampSec: number; sfxId: string; gainDb?: number }[];
  voice_stem_url: string | null; music_stem_url: string | null; sfx_stem_url: string | null; mixed_url: string | null; video_url: string | null;
  loudness_lufs: number | null; status: string; error_code: string | null; created_at: string; updated_at: string;
}
const user = async (userId: string): Promise<UserRow> => { const u = await asSystem((db) => usersRepo.byId(db, userId)); if (!u) throw notFound(); return u; };

/** R1: com `ff_audio` desligada a funcionalidade não existe para o usuário (404, como uma rota inexistente). */
export async function requireAudio(userId: string): Promise<UserRow> {
  const u = await user(userId);
  if (!(await isEnabled(FLAG, { userId, region: u.region, plan: u.plan }))) throw notFound();
  return u;
}
/** R6: mídia do usuário só vai para provedor EXTERNO com consentimento `external_provider` ativo. Os mocks rodam no nosso servidor. */
async function assertExternalConsent(userId: string, kind: 'music' | 'voice'): Promise<void> {
  if (!isExternal(kind)) return;
  const ok = await asUser(userId, async (db) => (await db.query<{ "?column?": number | null }>(`SELECT 1 FROM consents WHERE user_id=$1 AND type='external_provider' AND revoked_at IS NULL AND verified_at IS NOT NULL LIMIT 1`, [userId])).rowCount);
  if (!ok) throw audioError(403, 'external_provider_consent_required');
}
async function ownedProject(userId: string, projectId: string) {
  const p = await asUser(userId, (db) => projectsRepo.byId(db, projectId)); if (!p) throw audioError(404, 'project_not_found', undefined, 'not_found');
  return p as typeof p & { active_audio_version_id?: string | null };
}
const ttl = () => env.AUDIO_STEM_URL_TTL_SEC; // R5: 24 h para mídia intermediária
const signed = (ref: string | null) => (ref ? signRef(ref, ttl()) : Promise.resolve(null));
async function versionDto(v: VersionRow, activeId: string | null | undefined) {
  return {
    id: v.id, status: v.status, errorCode: v.error_code, active: v.id === activeId, createdAt: v.created_at,
    musicTrackId: v.music_track_id, voiceSource: v.voice_source, gains: v.settings.gains ?? {}, ducking: v.settings.ducking ?? true, sfxEvents: v.sfx_events,
    loudnessLufs: v.loudness_lufs, targetLufs: TARGET_LUFS,
    videoUrl: await signed(v.video_url), mixedUrl: await signed(v.mixed_url),
    stems: { voiceUrl: await signed(v.voice_stem_url), musicUrl: await signed(v.music_stem_url), sfxUrl: await signed(v.sfx_stem_url) },
    urlsExpireInSec: ttl(),
  };
}

export const audioService = {
  /** Banner "Seu áudio será processado por X" + catálogos fixos (humores, SFX). */
  async config(userId: string) {
    await requireAudio(userId);
    return {
      providers: { music: musicProviderName(), voice: voiceProviderName(), sfx: 'local', mixing: 'local' },
      externalProcessing: { music: isExternal('music'), voice: isExternal('voice') },
      notice: isExternal('music') || isExternal('voice') ? 'Seu áudio será processado por um provedor externo de IA.' : 'Seu áudio será processado nos servidores do NexusReel (provedor de demonstração).',
      messages: AUDIO_MESSAGES, moods: MOODS, sfx: Object.entries(SFX).map(([id, s]) => ({ id, label: s.label, durationSec: s.dur })), targetLufs: TARGET_LUFS, stemUrlTtlSec: ttl(),
    };
  },
  async tracks(userId: string, f: TrackFilters) { const u = await requireAudio(userId); return { items: (await searchTracks(userId, u.region, f)).map(trackDto) }; },
  async generate(userId: string, prompt: string, durationSec: number) {
    await requireAudio(userId); await assertExternalConsent(userId, 'music');
    return trackDto(await generateTrack(userId, prompt, durationSec));
  },
  async previewUrl(userId: string, trackId: string) {
    const u = await requireAudio(userId); const t = await trackFor(userId, u.region, trackId);
    return { url: await signRef(await resolveTrackFile(t), ttl()), expiresInSec: ttl() };
  },
  async suggestSfx(userId: string, projectId: string) {
    await requireAudio(userId); const p = await ownedProject(userId, projectId);
    if (!p.final_video_url) throw audioError(409, 'video_not_assembled');
    const scenes = await asUser(userId, (db) => projectsRepo.scenes(db, projectId));
    return { items: await suggestSfx(p.final_video_url, { userId, projectId }, scenes.map((s) => s.duration_sec)) };
  },

  /** Pede uma mixagem: cria a versão (fila) e devolve 202. O vídeo final original não é tocado. */
  async requestMix(userId: string, projectId: string, b: MixBody) {
    const u = await requireAudio(userId); const p = await ownedProject(userId, projectId);
    if (!p.final_video_url) throw audioError(409, 'video_not_assembled');
    await trackFor(userId, u.region, b.musicTrackId); // 404 se a faixa não for acessível/licenciada
    if (b.voice.source === 'clone') {
      if (!b.voice.voiceModelId) throw audioError(400, 'voice_model_required', undefined, 'bad_request');
      await voiceClone.usableVoice(userId, b.voice.voiceModelId); await assertExternalConsent(userId, 'voice');
    }
    const v = await tx({ userId }, async (db) => {
      const r = await db.query<{ id: string }>(`INSERT INTO audio_versions (project_id, source_video_key, music_track_id, voice_source, voice_model_id, settings, sfx_events)
        VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [projectId, p.final_video_url, b.musicTrackId, b.voice.source, b.voice.voiceModelId ?? null, { gains: b.gains, ducking: b.ducking }, JSON.stringify(b.sfxEvents)]);
      await audit(db, userId, 'audio.mix.request', 'project', projectId, { audioVersionId: r.rows[0]!.id, voice: b.voice.source, sfx: b.sfxEvents.length }); return r.rows[0]!;
    });
    await enqueue(Q.audioMix, 'mix', { audioVersionId: v.id, userId }, { plan: u.plan, userId, jobId: `audio-${v.id}` });
    return { audioVersionId: v.id, status: 'queued' };
  },

  /** Worker `audio-mix`. Idempotente: versão já concluída não é refeita (retry ou job duplicado). */
  async processMix(d: { audioVersionId: string; userId: string }, isFinal: boolean) {
    const v = await asSystem(async (db) => (await db.query<VersionRow>('SELECT * FROM audio_versions WHERE id=$1', [d.audioVersionId])).rows[0]);
    if (!v || v.status === 'done') return { skipped: true };
    await asSystem((db) => db.query(`UPDATE audio_versions SET status='processing', updated_at=now() WHERE id=$1`, [v.id]));
    const t0 = Date.now();
    try {
      const track = await asSystem(async (db) => (await db.query<Pick<Row<'music_tracks'>, 'file_url' | 'duration'>>('SELECT file_url, duration FROM music_tracks WHERE id=$1', [v.music_track_id])).rows[0]);
      if (!track) throw audioError(409, 'music_track_missing');
      const musicUrl = await resolveTrackFile(track);
      let voiceUrl: string | null | undefined; // undefined = extrair do vídeo; null = sem voz
      if (v.voice_source === 'none') voiceUrl = null;
      if (v.voice_source === 'clone') {
        const providerVoiceId = await voiceClone.usableVoice(d.userId, v.voice_model_id!); // revogou no meio? para aqui (403)
        const scenes = await asSystem((db) => projectsRepo.scenes(db, v.project_id)); let t = 0;
        let segs = scenes.map((s) => { const seg = { startSec: t, text: s.text, maxSec: Math.min(2, s.duration_sec) }; t += Math.min(2, s.duration_sec); return seg; }); // mesmo tempo por cena do assemble mock
        if (!segs.length) { // sem cenas (vídeo importado): narra o roteiro, uma frase a cada 2 s
          const script = (await asSystem((db) => projectsRepo.byId(db, v.project_id)))?.script ?? '';
          segs = script.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 30).map((text, i) => ({ startSec: i * 2, text, maxSec: 2 })); t = segs.length * 2;
        }
        const wav = await audioProviders.speak(providerVoiceId, segs, t, { userId: d.userId, projectId: v.project_id });
        const key = `projects/${v.project_id}/audio/${v.id}/voice-clone.wav`; await storage.put('videos', key, wav, 'audio/wav'); voiceUrl = key;
      }
      const r = await mixTracks({ videoUrl: v.source_video_key, voiceUrl, musicUrl, sfxEvents: v.sfx_events, gains: v.settings.gains, ducking: v.settings.ducking, outPrefix: `projects/${v.project_id}/audio/${v.id}` });
      await asSystem(async (db) => {
        await db.query(`UPDATE audio_versions SET status='done', error_code=NULL, voice_url=$2, music_url=$3, sfx_url=$4, voice_stem_url=$5, music_stem_url=$6, sfx_stem_url=$7, mixed_url=$8, video_url=$9, loudness_lufs=$10, updated_at=now() WHERE id=$1`,
          [v.id, voiceUrl ?? null, musicUrl, r.stems.sfxUrl, r.stems.voiceUrl, r.stems.musicUrl, r.stems.sfxUrl, r.mixedUrl, r.videoUrl, r.loudnessLufs]);
        // a nova versão vira a ativa — se o vídeo final ainda for o mesmo de quando a mixagem foi pedida
        await db.query(`UPDATE projects SET active_audio_version_id=$1 WHERE id=$2 AND final_video_url=$3`, [v.id, v.project_id, v.source_video_key]);
        await audit(db, d.userId, 'audio.mix.done', 'project', v.project_id, { audioVersionId: v.id, lufs: r.loudnessLufs });
      });
      logger.info({ audioVersionId: v.id, projectId: v.project_id, ms: Date.now() - t0, lufs: r.loudnessLufs, voice: v.voice_source }, 'mixagem concluída'); // R7: só IDs e números
      return { ok: true };
    } catch (e) {
      const code = e instanceof AppError ? e.code : 'mix_failed';
      if (isFinal || (e instanceof AppError && e.status < 500)) {
        await asSystem((db) => db.query(`UPDATE audio_versions SET status='failed', error_code=$2, updated_at=now() WHERE id=$1`, [v.id, code]));
        logger.warn({ audioVersionId: v.id, code }, 'mixagem falhou');
        if (e instanceof AppError && e.status < 500) return { ok: false, code }; // erro do usuário/estado: não adianta repetir
      }
      throw e;
    }
  },

  async versions(userId: string, projectId: string) {
    await requireAudio(userId); const p = await ownedProject(userId, projectId);
    const rows = await asUser(userId, async (db) => (await db.query<VersionRow>('SELECT * FROM audio_versions WHERE project_id=$1 ORDER BY created_at DESC LIMIT 20', [projectId])).rows);
    return { activeVersionId: p.active_audio_version_id ?? null, originalVideoUrl: p.final_video_url ? await signRef(p.final_video_url, ttl()) : null, items: await Promise.all(rows.map((r) => versionDto(r, p.active_audio_version_id))) };
  },
  async activate(userId: string, projectId: string, versionId: string) {
    await requireAudio(userId); const p = await ownedProject(userId, projectId);
    const ok = await tx({ userId }, async (db) => {
      const r = await db.query(`UPDATE projects SET active_audio_version_id=$2 WHERE id=$1 AND EXISTS (SELECT 1 FROM audio_versions a WHERE a.id=$2 AND a.project_id=$1 AND a.status='done' AND a.source_video_key=$3)`, [projectId, versionId, p.final_video_url]);
      if (r.rowCount) await audit(db, userId, 'audio.activate', 'project', projectId, { audioVersionId: versionId }); return r.rowCount === 1;
    });
    if (!ok) throw audioError(409, 'audio_version_not_usable');
    return this.versions(userId, projectId);
  },
  /** "Reverter para áudio original": só volta o ponteiro; nenhuma mídia é apagada. */
  async revert(userId: string, projectId: string) {
    await requireAudio(userId); await ownedProject(userId, projectId);
    await tx({ userId }, async (db) => { await db.query(`UPDATE projects SET active_audio_version_id=NULL WHERE id=$1`, [projectId]); await audit(db, userId, 'audio.revert', 'project', projectId, {}); });
    return this.versions(userId, projectId);
  },

  /**
   * Vídeo a publicar: o mixado ativo, se `ff_audio` estiver ligada para o usuário e a versão for da montagem atual;
   * senão, exatamente o vídeo final de hoje. Qualquer erro aqui cai no comportamento atual (não quebra publicação).
   */
  async effectiveVideoRef(project: { id: string; final_video_url: string | null; active_audio_version_id?: string | null }, u: { id: string; region: string; plan: string }): Promise<string | null> {
    if (!project.active_audio_version_id || !project.final_video_url) return project.final_video_url;
    try {
      if (!(await isEnabled(FLAG, { userId: u.id, region: u.region, plan: u.plan }))) return project.final_video_url;
      const r = (await pool.query<Pick<Row<'audio_versions'>, 'video_url'>>(`SELECT video_url FROM audio_versions WHERE id=$1 AND project_id=$2 AND status='done' AND source_video_key=$3`, [project.active_audio_version_id, project.id, project.final_video_url])).rows[0];
      return r?.video_url ?? project.final_video_url;
    } catch { return project.final_video_url; }
  },

  /** R15: versões não ativas mais antigas que AUDIO_VERSION_RETENTION_DAYS são apagadas (linha + arquivos). */
  async purgeExpired(): Promise<{ deleted: number }> {
    const rows = await asSystem(async (db) => (await db.query<{ id: string; project_id: string }>(`DELETE FROM audio_versions a WHERE a.created_at < now() - make_interval(days => $1)
      AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.active_audio_version_id = a.id) RETURNING id, project_id`, [env.AUDIO_VERSION_RETENTION_DAYS])).rows);
    for (const r of rows) await storage.deletePrefix('videos', `projects/${r.project_id}/audio/${r.id}/`).catch(() => undefined);
    return { deleted: rows.length };
  },
};
