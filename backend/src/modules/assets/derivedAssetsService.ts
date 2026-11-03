import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo, type UserRow } from '../users/users.repository.js';
import { enqueue, Q } from '../../queues/index.js';
import { storage, refLocation } from '../../providers/storage.js';
import { recordUsage } from '../../providers/ai/router.js';
import { audioService } from '../audio/audio.service.js';
import { withTmp } from '../../utils/ffmpeg.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { AppError, notFound } from '../../utils/errors.js';
import { DEVICE_PROFILES, deviceProfile, type DeviceProfile } from '../../config/deviceProfiles.js';
import { CAR_PROFILES, carProfile } from '../../config/carProfiles.js';
import { zipStore } from '../export/zip.js';
import { clipWindow, makeCar, makeGif, makeLivePhoto, makeLoopVideo, makeScreensaver, makeSticker, probe, GIF_MAX_SEC, STICKER_MAX_SEC, GIF_MAX_BYTES, STICKER_TARGET_BYTES } from './engine.js';
import { assetError, ASSET_MESSAGES } from './messages.js';

/**
 * Módulo 6 — Assets derivados (`ff_assets`): `toGif`, `toSticker`, `toWallpaper`, `toCarMultimedia`, `toScreensaver`.
 * - Tudo local (FFmpeg); o vídeo de origem só é LIDO.
 * - Cache por usuário: `cache_key = sha256(user_id + source_project_id + hash do vídeo de origem + output_config)`. A busca
 *   no cache filtra por `user_id` (e roda sob RLS do dono) e o arquivo vive em `derived/<user_id>/<cache_key>.<ext>`:
 *   o mesmo vídeo e a mesma configuração de outro usuário nunca reaproveitam o arquivo de ninguém.
 * - Nome de arquivo padronizado, sem título nem dado pessoal: `nexusreel-<tipo>[-<perfil>]-<id>.<ext>`.
 * - Metadados do vídeo de origem (localização, aparelho) não vão para o asset (`-map_metadata -1`).
 */
export const FLAG = 'ff_assets';
export const ENGINE_VERSION = 1; // entra no output_config: mudar a conversão invalida o cache
export const TYPES = ['gif', 'sticker', 'wallpaper', 'car', 'screensaver'] as const;
export type AssetType = (typeof TYPES)[number];
export const assetBodySchema = z.object({
  type: z.enum(TYPES),
  profile: z.string().trim().min(1).max(40).optional(),
  format: z.enum(['mp4', 'webm']).optional(),
  startSec: z.number().min(0).max(600).optional(),
  durationSec: z.number().min(1).max(130).optional(),
}).strict();
export type AssetBody = z.infer<typeof assetBodySchema>;
export interface OutputConfig { type: AssetType; profile: string | null; format: string; startSec: number; durationSec: number; v: number }
interface AssetRow { id: string; user_id: string; source_project_id: string | null; type: AssetType; device_profile: string | null; file_url: string | null; size_bytes: string | null; cache_key: string | null;
  created_at: string; output_config: OutputConfig; status: string; error_code: string | null; mime: string | null; file_name: string | null; cache_hit: boolean; info: Record<string, unknown>; expires_at: string | null }
interface ProjectRow { id: string; user_id: string; status: string; final_video_url: string | null; active_audio_version_id: string | null; deleted_at: string | null }

const EXT: Record<string, { ext: string; mime: string }> = {
  gif: { ext: 'gif', mime: 'image/gif' }, webp: { ext: 'webp', mime: 'image/webp' }, mp4: { ext: 'mp4', mime: 'video/mp4' }, webm: { ext: 'webm', mime: 'video/webm' }, zip: { ext: 'zip', mime: 'application/zip' },
};
const user = async (userId: string): Promise<UserRow> => { const u = await asSystem((db) => usersRepo.byId(db, userId)); if (!u) throw notFound(); return u; };
export async function requireAssets(userId: string): Promise<UserRow> {
  const u = await user(userId); if (!(await isEnabled(FLAG, { userId, region: u.region, plan: u.plan }))) throw notFound(); return u;
}
/** Chave do cache: inclui o usuário, o projeto, o conteúdo do vídeo de origem e a configuração (canônica). */
export function cacheKeyFor(userId: string, projectId: string, sourceSha: string, c: OutputConfig): string {
  const canon = JSON.stringify(Object.keys(c).sort().map((k) => [k, (c as unknown as Record<string, unknown>)[k]]));
  return createHash('sha256').update(JSON.stringify(['nexusreel-asset', userId, projectId, sourceSha, canon])).digest('hex');
}
/** Valida tipo × perfil × formato e devolve a configuração normalizada (o que entra no cache). */
export function normalize(b: AssetBody): OutputConfig {
  const start = Math.round((b.startSec ?? 0) * 100) / 100; const v = ENGINE_VERSION;
  const dev = (kinds: DeviceProfile['kind'][]) => { const p = b.profile ? deviceProfile(b.profile) : undefined; if (!p || !kinds.includes(p.kind)) throw assetError(422, 'invalid_profile', { allowed: DEVICE_PROFILES.filter((x) => kinds.includes(x.kind)).map((x) => x.id) }); return p; };
  switch (b.type) {
    case 'gif': if (b.format) throw assetError(422, 'invalid_format'); return { type: 'gif', profile: null, format: 'gif', startSec: start, durationSec: Math.min(b.durationSec ?? 6, GIF_MAX_SEC), v };
    case 'sticker': if (b.format) throw assetError(422, 'invalid_format'); return { type: 'sticker', profile: null, format: 'webp', startSec: start, durationSec: Math.min(b.durationSec ?? 3, STICKER_MAX_SEC), v };
    case 'wallpaper': {
      const p = dev(['phone_live_ios', 'phone_live_android', 'pc']);
      const format = p.kind === 'phone_live_ios' ? 'live_zip' : p.kind === 'pc' ? (b.format ?? 'mp4') : 'mp4';
      if (b.format && !(p.formats as string[]).includes(b.format)) throw assetError(422, 'invalid_format', { allowed: p.formats });
      return { type: 'wallpaper', profile: p.id, format, startSec: start, durationSec: Math.min(b.durationSec ?? p.defaultSec, p.maxSec), v };
    }
    case 'screensaver': { const p = dev(['screensaver']); if (b.format) throw assetError(422, 'invalid_format'); return { type: 'screensaver', profile: p.id, format: 'frames_zip', startSec: start, durationSec: Math.min(b.durationSec ?? p.defaultSec, p.maxSec), v }; }
    case 'car': {
      const p = b.profile ? carProfile(b.profile) : undefined; if (!p) throw assetError(422, 'invalid_profile', { allowed: CAR_PROFILES.map((x) => x.id) });
      if (b.format && b.format !== 'mp4') throw assetError(422, 'invalid_format', { allowed: ['mp4'] });
      return { type: 'car', profile: p.id, format: 'mp4', startSec: start, durationSec: Math.min(b.durationSec ?? p.maxSec, p.maxSec), v };
    }
  }
}
const fileNameFor = (r: { id: string; type: string }, c: OutputConfig, ext: string) => `nexusreel-${r.type}${c.profile ? '-' + c.profile.replace(/[^a-z0-9]+/gi, '-') : ''}-${r.id.slice(0, 8)}.${ext}`;
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const setRow = (id: string, sql: string, vals: unknown[]) => asSystem((db) => db.query(`UPDATE derived_assets SET ${sql}, updated_at=now() WHERE id=$1`, [id, ...vals]));
const howTo = (r: AssetRow) => (r.device_profile ? (deviceProfile(r.device_profile)?.note ?? carProfile(r.device_profile)?.note ?? null) : null);

const README = (p: DeviceProfile) => [
  `NexusReel — protetor de tela (${p.label})`, '',
  'PT-BR: ' + p.note + '. O vídeo em loop (MP4) também funciona em apps de protetor de tela com vídeo.',
  p.platform === 'windows' ? 'EN: Extract the folder → Settings → Personalization → Lock screen → Screen saver → Photos → Settings → Browse to the folder. ES: Extrae la carpeta → Configuración → Personalización → Pantalla de bloqueo → Protector de pantalla → Fotos → Configuración → Examinar la carpeta.'
    : 'EN: Extract the folder → System Settings → Screen Saver → a photo screen saver → Source → Choose Folder. ES: Extrae la carpeta → Ajustes del Sistema → Salvapantallas → un salvapantallas de fotos → Origen → Elegir carpeta.',
  '', 'Nenhum programa (.scr/.saver) é instalado: só imagens e um vídeo.', '',
].join('\r\n');

export const derivedAssetsService = {
  /** POST /projects/:projectId/assets — valida e enfileira. */
  async request(userId: string, projectId: string, b: AssetBody) {
    const u = await requireAssets(userId); const c = normalize(b);
    const p = await asUser(userId, async (db) => (await db.query<ProjectRow>('SELECT id, user_id, status, final_video_url, active_audio_version_id, deleted_at FROM projects WHERE id=$1', [projectId])).rows[0]);
    if (!p || p.deleted_at) throw assetError(404, 'project_not_found', undefined, 'not_found'); // RLS: projeto de outro usuário = 404
    if (p.status !== 'ready' || !p.final_video_url) throw assetError(409, 'video_not_assembled');
    const row = await tx({ userId }, async (db) => {
      const r = await db.query<{ id: string }>(`INSERT INTO derived_assets (user_id, source_project_id, type, device_profile, output_config) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [userId, projectId, c.type, c.profile, c]);
      await audit(db, userId, 'asset.request', 'project', projectId, { assetId: r.rows[0]!.id, type: c.type, profile: c.profile }); return r.rows[0]!;
    });
    await enqueue(Q.assetsDerive, 'derive', { assetId: row.id, userId }, { plan: u.plan, userId, jobId: `asset-${row.id}` });
    return { assetId: row.id, status: 'queued', type: c.type, profile: c.profile, format: c.format };
  },
  /** Conversões (chamadas pelo worker). Cada uma devolve o arquivo final e a extensão. */
  async toGif(src: string, dir: string, c: OutputConfig, dur: number) { const w = clipWindow(dur, c.startSec, c.durationSec, GIF_MAX_SEC, true); const r = await makeGif(src, dir, w); return { file: r.file, kind: 'gif', info: { width: r.width, fps: r.fps, colors: r.colors, durationSec: w.dur, loop: 'perfect' } }; },
  async toSticker(src: string, dir: string, c: OutputConfig, dur: number) { const w = clipWindow(dur, c.startSec, c.durationSec, STICKER_MAX_SEC, true); const r = await makeSticker(src, dir, w); return { file: r.file, kind: 'webp', info: { width: 512, height: 512, fps: r.fps, quality: r.quality, durationSec: w.dur, transparent: true } }; },
  async toWallpaper(src: string, dir: string, c: OutputConfig, dur: number, assetId: string) {
    const p = deviceProfile(c.profile!)!; const w = clipWindow(dur, c.startSec, c.durationSec, p.maxSec, p.loop);
    if (p.kind === 'phone_live_ios') {
      const contentId = assetId.toUpperCase(); const r = await makeLivePhoto(src, dir, p, w, contentId); const base = `nexusreel-live-${assetId.slice(0, 8)}`;
      const zip = zipStore([{ name: `${base}.mov`, data: await readFile(r.mov) }, { name: `${base}.jpg`, data: await readFile(r.jpg) },
        { name: 'live.json', data: Buffer.from(JSON.stringify({ contentIdentifier: contentId, stillImageTimeSec: r.stillSec, width: p.width, height: p.height }, null, 2)) }]);
      const out = join(dir, 'live.zip'); await writeFile(out, zip);
      return { file: out, kind: 'zip', info: { width: p.width, height: p.height, durationSec: w.dur, contentIdentifier: contentId, parts: ['mov', 'jpg'] } };
    }
    const fmt = (c.format === 'webm' ? 'webm' : 'mp4') as 'mp4' | 'webm';
    return { file: await makeLoopVideo(src, dir, p, w, fmt), kind: fmt, info: { width: p.width, height: p.height, fps: p.fps, durationSec: w.dur, loop: 'perfect' } };
  },
  async toCarMultimedia(src: string, dir: string, c: OutputConfig, dur: number) {
    const p = carProfile(c.profile!)!; const w = clipWindow(dur, c.startSec, c.durationSec, p.maxSec, false);
    return { file: await makeCar(src, dir, p, w), kind: 'mp4', info: { width: p.width, height: p.height, fps: p.fps, h264: `Baseline@${p.h264Level}`, audio: 'AAC-LC', durationSec: w.dur, verifiedProfile: p.verified } };
  },
  async toScreensaver(src: string, dir: string, c: OutputConfig, dur: number) {
    const p = deviceProfile(c.profile!)!; const w = clipWindow(dur, c.startSec, c.durationSec, p.maxSec, true);
    const r = await makeScreensaver(src, dir, p, w);
    const entries = [...(await Promise.all(r.frames.map(async (f, i) => ({ name: `NexusReel/nexusreel-${String(i + 1).padStart(2, '0')}.jpg`, data: await readFile(f) })))),
      { name: 'NexusReel/nexusreel-loop.mp4', data: await readFile(r.video) }, { name: 'LEIA-ME.txt', data: Buffer.from(README(p)) }];
    const out = join(dir, 'ss.zip'); await writeFile(out, zipStore(entries));
    return { file: out, kind: 'zip', info: { width: p.width, height: p.height, frames: r.frames.length, durationSec: w.dur, platform: p.platform } };
  },
  /** Worker `assets-derive`: cache por usuário → conversão local → upload. Idempotente. */
  async process(d: { assetId: string; userId: string }, isFinal: boolean) {
    const r = await asSystem(async (db) => (await db.query<AssetRow>('SELECT * FROM derived_assets WHERE id=$1', [d.assetId])).rows[0]);
    if (!r || r.status === 'done' || r.status === 'expired') return { skipped: true };
    const t0 = Date.now();
    try {
      await setRow(r.id, `status='processing'`, []);
      const u = await user(r.user_id); const c = r.output_config;
      const p = await asSystem(async (db) => (await db.query<ProjectRow>('SELECT id, user_id, status, final_video_url, active_audio_version_id, deleted_at FROM projects WHERE id=$1 AND user_id=$2', [r.source_project_id, r.user_id])).rows[0]);
      if (!p || p.deleted_at || !p.final_video_url) throw assetError(404, 'project_not_found', undefined, 'not_found'); // dono conferido de novo
      const l = refLocation((await audioService.effectiveVideoRef(p, u)) ?? p.final_video_url); const srcBuf = await storage.get(l.bucket, l.key); // só leitura
      const key = cacheKeyFor(r.user_id, p.id, sha(srcBuf), c);
      // Cache: só do PRÓPRIO usuário (filtro explícito + RLS do dono) e só arquivo ainda válido
      const hit = await asUser(r.user_id, async (db) => (await db.query<AssetRow>(`SELECT * FROM derived_assets WHERE user_id=$1 AND cache_key=$2 AND status='done' AND file_url IS NOT NULL AND expires_at > now() AND id <> $3 ORDER BY created_at DESC LIMIT 1`, [r.user_id, key, r.id])).rows[0]);
      if (hit && hit.file_url!.startsWith(`derived/${r.user_id}/`) && (await storage.exists('videos', hit.file_url!))) {
        const ext = hit.file_url!.split('.').pop()!;
        await setRow(r.id, `status='done', file_url=$2, size_bytes=$3, cache_key=$4, mime=$5, file_name=$6, info=$7, cache_hit=true, error_code=NULL, expires_at=now() + make_interval(days => $8::int)`,
          [hit.file_url, hit.size_bytes, key, hit.mime, fileNameFor(r, c, ext), hit.info, env.ASSETS_TTL_DAYS]);
        await recordUsage({ provider: 'local', operation: `asset_${c.type}_cache`, costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: p.id, status: 'ok' });
        logger.info({ assetId: r.id, type: c.type, profile: c.profile, cacheHit: true, ms: Date.now() - t0 }, 'asset derivado (cache)');
        return { ok: true, cacheHit: true };
      }
      const out = await withTmp(async (dir) => {
        const src = join(dir, 'src.mp4'); await writeFile(src, srcBuf); const dur = (await probe(src)).duration;
        let res: { file: string; kind: string; info: Record<string, unknown> };
        try {
          res = c.type === 'gif' ? await this.toGif(src, dir, c, dur) : c.type === 'sticker' ? await this.toSticker(src, dir, c, dur)
            : c.type === 'wallpaper' ? await this.toWallpaper(src, dir, c, dur, r.id) : c.type === 'car' ? await this.toCarMultimedia(src, dir, c, dur) : await this.toScreensaver(src, dir, c, dur);
        } catch (e) { if ((e as Error).message === 'trecho curto demais') throw assetError(422, 'clip_too_short'); throw e; }
        const body = await readFile(res.file); const m = EXT[res.kind]!;
        const fileUrl = `derived/${r.user_id}/${key}.${m.ext}`; await storage.put('videos', fileUrl, body, m.mime); // arquivo NOVO; origem intacta
        return { fileUrl, bytes: body.length, mime: m.mime, ext: m.ext, info: res.info };
      });
      await setRow(r.id, `status='done', file_url=$2, size_bytes=$3, cache_key=$4, mime=$5, file_name=$6, info=$7, cache_hit=false, error_code=NULL, expires_at=now() + make_interval(days => $8::int)`,
        [out.fileUrl, out.bytes, key, out.mime, fileNameFor(r, c, out.ext), out.info, env.ASSETS_TTL_DAYS]);
      await recordUsage({ provider: 'local', operation: `asset_${c.type}`, costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: p.id, status: 'ok' });
      await asSystem((db) => audit(db, r.user_id, 'asset.done', 'project', p.id, { assetId: r.id, type: c.type, profile: c.profile }));
      logger.info({ assetId: r.id, type: c.type, profile: c.profile, bytes: out.bytes, cacheHit: false, ms: Date.now() - t0 }, 'asset derivado'); // R7: sem PII
      return { ok: true, cacheHit: false };
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'asset_failed';
      const definitive = err instanceof AppError && err.status < 500;
      if (isFinal || definitive) {
        await setRow(r.id, `status='failed', error_code=$2`, [code]);
        await recordUsage({ provider: 'local', operation: `asset_${r.type}`, costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: r.source_project_id ?? undefined, status: 'error' }).catch(() => undefined);
        logger.warn({ assetId: r.id, type: r.type, code }, 'asset derivado falhou');
        if (definitive) return { ok: false, code };
      } else await setRow(r.id, `status='queued'`, []);
      throw err;
    }
  },
  async dto(r: AssetRow) {
    const live = r.status === 'done' && !!r.file_url;
    return { assetId: r.id, projectId: r.source_project_id, type: r.type, profile: r.device_profile, format: r.output_config.format, status: r.status, errorCode: r.error_code,
      fileName: r.file_name, mime: r.mime, sizeBytes: r.size_bytes === null ? null : Number(r.size_bytes), cacheHit: r.cache_hit, info: r.info, howTo: howTo(r), createdAt: r.created_at, expiresAt: r.expires_at,
      url: live ? await storage.signedGetUrl('videos', r.file_url!, env.ASSETS_URL_TTL_SEC, { downloadName: r.file_name ?? undefined }) : null, urlExpiresInSec: live ? env.ASSETS_URL_TTL_SEC : null };
  },
  async status(userId: string, assetId: string) {
    await requireAssets(userId);
    const r = await asUser(userId, async (db) => (await db.query<AssetRow>('SELECT * FROM derived_assets WHERE id=$1', [assetId])).rows[0]);
    if (!r) throw assetError(404, 'asset_not_found', undefined, 'not_found');
    return this.dto(r);
  },
  async list(userId: string, projectId?: string) {
    await requireAssets(userId);
    const rows = await asUser(userId, async (db) => (await db.query<AssetRow>(`SELECT * FROM derived_assets WHERE user_id=$1 AND ($2::uuid IS NULL OR source_project_id=$2) ORDER BY created_at DESC LIMIT 100`, [userId, projectId ?? null])).rows);
    return { items: await Promise.all(rows.map((r) => this.dto(r))) };
  },
  async profiles(userId: string) {
    await requireAssets(userId);
    return { types: TYPES, device: DEVICE_PROFILES, car: CAR_PROFILES, limits: { gifMaxSec: GIF_MAX_SEC, gifMaxBytes: GIF_MAX_BYTES, stickerMaxSec: STICKER_MAX_SEC, stickerTargetBytes: STICKER_TARGET_BYTES, ttlDays: env.ASSETS_TTL_DAYS }, messages: ASSET_MESSAGES };
  },
  /** Job diário `assets-retention`: apaga arquivos vencidos que nenhum outro asset válido do mesmo usuário usa. */
  async purgeExpired(): Promise<{ expired: number; filesDeleted: number }> {
    const rows = await asSystem(async (db) => (await db.query<{ id: string; user_id: string; file_url: string }>(`SELECT id, user_id, file_url FROM derived_assets WHERE status='done' AND expires_at < now() ORDER BY expires_at LIMIT 1000`)).rows);
    let files = 0;
    for (const r of rows) {
      await setRow(r.id, `status='expired'`, []);
      const inUse = await asSystem(async (db) => (await db.query<{ "?column?": number | null }>(`SELECT 1 FROM derived_assets WHERE user_id=$1 AND file_url=$2 AND status='done' AND expires_at > now() LIMIT 1`, [r.user_id, r.file_url])).rows.length > 0);
      if (!inUse && r.file_url) { await storage.delete('videos', r.file_url); files++; }
      await setRow(r.id, `file_url=NULL`, []);
    }
    if (rows.length) logger.info({ expired: rows.length, filesDeleted: files }, 'assets derivados vencidos');
    return { expired: rows.length, filesDeleted: files };
  },
};
