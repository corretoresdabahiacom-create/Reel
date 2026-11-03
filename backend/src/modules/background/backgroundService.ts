import { join, extname } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo, type UserRow } from '../users/users.repository.js';
import { projectsRepo, type SceneRow } from '../projects/projects.repository.js';
import { enqueue, Q } from '../../queues/index.js';
import { storage, refLocation, signRef, sniffMime } from '../../providers/storage.js';
import { withTmp } from '../../utils/ffmpeg.js';
import { AppError, notFound } from '../../utils/errors.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { ASPECTS, lastFrame, probe, type Aspect } from './engine.js';
import { bgProviders, bgProviderExternal, bgProviderName } from './providers.js';
import { bgError, BG_MESSAGES } from './messages.js';

export const FLAG = 'ff_background';
export const editBodySchema = z.object({
  operation: z.enum(['remove', 'replace', 'outpaint']),
  target: z.enum(['video', 'photo']).default('video'),
  photoIndex: z.number().int().min(0).max(9).default(0),
  prompt: z.string().trim().min(3).max(200).optional(),
  backgroundRef: z.string().max(300).optional(),
  aspect: z.enum(ASPECTS as [Aspect, ...Aspect[]]).default('16:9'),
  fill: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional(),
}).strict();
export type EditBody = z.infer<typeof editBodySchema>;
interface EditRow { id: string; project_id: string; scene_id: string | null; operation: 'remove' | 'replace' | 'outpaint'; target: 'video' | 'photo'; params: EditBody & { userId?: string }; source_media_url: string;
  result_media_url: string | null; result_alpha_url: string | null; derived_scene_id: string | null; provider: string | null; status: string; error_code: string | null; created_at: string }

const user = async (userId: string): Promise<UserRow> => { const u = await asSystem((db) => usersRepo.byId(db, userId)); if (!u) throw notFound(); return u; };
/** R1: sem `ff_background` a funcionalidade não existe para o usuário (404). */
export async function requireBackground(userId: string): Promise<UserRow> {
  const u = await user(userId); if (!(await isEnabled(FLAG, { userId, region: u.region, plan: u.plan }))) throw notFound(); return u;
}
/** Versões da cena e seletor: usados pelo Módulo 2 (fundo) e pelo Módulo 3 (elementos) — basta uma das flags. */
export async function requireSceneVersions(userId: string): Promise<UserRow> {
  const u = await user(userId);
  for (const f of [FLAG, 'ff_elements']) if (await isEnabled(f, { userId, region: u.region, plan: u.plan })) return u;
  throw notFound();
}
/** R6: mídia só vai a provedor EXTERNO com consentimento `external_provider` ativo (o mock roda no nosso servidor). */
async function assertExternalConsent(userId: string): Promise<void> {
  if (!bgProviderExternal()) return;
  const ok = await asUser(userId, async (db) => (await db.query<{ "?column?": number | null }>(`SELECT 1 FROM consents WHERE user_id=$1 AND type='external_provider' AND revoked_at IS NULL AND verified_at IS NOT NULL LIMIT 1`, [userId])).rowCount);
  if (!ok) throw bgError(403, 'external_provider_consent_required');
}
async function sceneOf(userId: string, projectId: string, sceneId: string): Promise<SceneRow> {
  const p = await asUser(userId, (db) => projectsRepo.byId(db, projectId)); if (!p) throw bgError(404, 'project_not_found', undefined, 'not_found');
  const s = await asUser(userId, (db) => projectsRepo.scene(db, projectId, sceneId)); if (!s) throw bgError(404, 'scene_not_found', undefined, 'not_found');
  return s;
}
const ttl = () => env.BACKGROUND_URL_TTL_SEC; // R5: 24 h
const signed = (ref: string | null | undefined) => (ref ? signRef(ref, ttl()) : Promise.resolve(null));
const extOf = (ref: string, fallback: string) => { const e = extname(ref.split('?')[0]!).toLowerCase(); return e && e.length <= 5 ? e : fallback; };

/** Fila `background-edit` + o que cada operação pede. */
async function request(userId: string, projectId: string, sceneId: string, b: EditBody) {
  const u = await requireBackground(userId); const s = await sceneOf(userId, projectId, sceneId);
  const source = b.target === 'video' ? s.video_url : s.reference_images[b.photoIndex];
  if (!source) throw bgError(409, b.target === 'video' ? 'scene_media_missing' : 'photo_missing');
  if (b.operation === 'replace') {
    if (!b.prompt && !b.backgroundRef) throw bgError(400, 'background_source_required', undefined, 'bad_request');
    if (b.backgroundRef) { // a imagem de fundo enviada precisa ser do próprio usuário e ser imagem de verdade (magic bytes)
      const l = refLocation(b.backgroundRef);
      const ok = b.backgroundRef.startsWith(`uploads/${userId}/`) && (await storage.exists(l.bucket, l.key)) && !!sniffMime((await storage.get(l.bucket, l.key)).subarray(0, 64))?.startsWith('image/');
      if (!ok) throw bgError(422, 'background_upload_invalid');
    }
  }
  await assertExternalConsent(userId);
  const e = await tx({ userId }, async (db) => {
    const r = await db.query<{ id: string }>(`INSERT INTO background_edits (project_id, scene_id, operation, target, params, source_media_url, provider) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [projectId, s.id, b.operation, b.target, b, source, bgProviderName()]);
    await audit(db, userId, 'background.edit.request', 'scene', s.id, { editId: r.rows[0]!.id, operation: b.operation, target: b.target }); return r.rows[0]!;
  });
  await enqueue(Q.backgroundEdit, 'edit', { editId: e.id, userId }, { plan: u.plan, userId, jobId: `bg-${e.id}` });
  return { editId: e.id, status: 'queued', operation: b.operation, target: b.target };
}

export const backgroundService = {
  /** Remove o fundo (alfa com borda suave). Vídeo: WebM com alfa + MP4 sobre cor sólida para a montagem. */
  removeBackground: (userId: string, projectId: string, sceneId: string, b: Omit<EditBody, 'operation'>) => request(userId, projectId, sceneId, { ...b, operation: 'remove' }),
  /** Troca o fundo por um gerado a partir de texto ("cozinha moderna") ou por uma imagem enviada. */
  replaceBackground: (userId: string, projectId: string, sceneId: string, b: Omit<EditBody, 'operation'>) => request(userId, projectId, sceneId, { ...b, operation: 'replace' }),
  /** Expande o quadro (ex.: 9:16 → 16:9) sem cortar o produto/pessoa: o quadro original inteiro fica no centro. */
  outpaintBackground: (userId: string, projectId: string, sceneId: string, b: Omit<EditBody, 'operation'>) => request(userId, projectId, sceneId, { ...b, operation: 'outpaint' }),
  edit: (userId: string, projectId: string, sceneId: string, b: EditBody) => request(userId, projectId, sceneId, b),

  /** Worker `background-edit`. Idempotente: edição concluída não é refeita; a cena derivada é criada uma vez só. */
  async process(d: { editId: string; userId: string }, isFinal: boolean) {
    const e = await asSystem(async (db) => (await db.query<EditRow>('SELECT * FROM background_edits WHERE id=$1', [d.editId])).rows[0]);
    if (!e || e.status === 'done') return { skipped: true };
    const src = await asSystem(async (db) => (await db.query<SceneRow>('SELECT * FROM scenes WHERE id=$1', [e.scene_id])).rows[0]);
    if (!src) { await asSystem((db) => db.query(`UPDATE background_edits SET status='failed', error_code='scene_not_found', updated_at=now() WHERE id=$1`, [e.id])); return { ok: false }; }
    await asSystem((db) => db.query(`UPDATE background_edits SET status='processing', updated_at=now() WHERE id=$1`, [e.id]));
    const ctx = { userId: d.userId, projectId: e.project_id }; const t0 = Date.now(); const p = e.params;
    try {
      const prefix = `projects/${e.project_id}/background/${e.id}`;
      const r = await withTmp(async (dir) => {
        const isVideo = e.target === 'video';
        const inFile = join(dir, 'source' + (isVideo ? '.mp4' : extOf(e.source_media_url, '.png').replace('.jpeg', '.jpg')));
        const l = refLocation(e.source_media_url); await writeFile(inFile, await storage.get(l.bucket, l.key)); // só leitura do original
        let out: string; let alpha: string | null = null;
        if (e.operation === 'remove') { const x = await bgProviders.remove(inFile, dir, { fill: p.fill ? '0x' + p.fill.replace('#', '') : undefined }, ctx); out = x.flat; alpha = x.alpha; }
        else if (e.operation === 'replace') {
          let bg: string;
          if (p.backgroundRef) { const b = refLocation(p.backgroundRef); bg = join(dir, 'bg-upload' + extOf(p.backgroundRef, '.png')); await writeFile(bg, await storage.get(b.bucket, b.key)); }
          else { const info = await probe(inFile); bg = await bgProviders.generate(p.prompt!, info.width, info.height, dir, ctx); }
          out = (await bgProviders.replace(inFile, bg, dir, ctx)).out;
        } else out = (await bgProviders.outpaint(inFile, p.aspect ?? '16:9', dir, ctx)).out;
        const put = async (file: string, name: string) => { const key = `${prefix}/${name}${extname(file)}`; const ct = file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.webm') ? 'video/webm' : 'image/png';
          await storage.put('videos', key, await readFile(file), ct); return key; };
        const result = await put(out, 'result'); const alphaKey = alpha ? await put(alpha, 'alpha') : null;
        const frame = isVideo ? await put(await lastFrame(out, dir), 'last') : null;
        return { result, alphaKey, frame };
      });
      // nova linha em scenes (R2): versão = maior da posição + 1; a original e as outras versões ficam intactas
      const derived = await asSystem(async (db) => {
        await db.query<{ pg_advisory_xact_lock: unknown }>('SELECT pg_advisory_xact_lock(hashtext($1))', [`scene:${src.project_id}:${src.index}`]);
        const cur = (await db.query<{ derived_scene_id: string | null }>('SELECT derived_scene_id FROM background_edits WHERE id=$1 FOR UPDATE', [e.id])).rows[0];
        if (cur?.derived_scene_id) return cur.derived_scene_id; // retry depois de já ter criado
        const refs = [...src.reference_images]; if (e.target === 'photo') refs[p.photoIndex ?? 0] = r.result;
        const ins = await db.query<{ id: string }>(`INSERT INTO scenes (project_id, index, text, duration_sec, prompt, reference_mode, reference_images, video_url, last_frame_url, chained_from_scene_id, status, error_message, retried, consistency, version, derived_from_scene_id)
          SELECT project_id, index, text, duration_sec, prompt, reference_mode, $2, $3, $4, chained_from_scene_id, status, error_message, retried, consistency,
                 (SELECT COALESCE(MAX(version), 0) + 1 FROM scenes WHERE project_id=$5 AND index=$6), id
          FROM scenes WHERE id=$1 RETURNING id`, [src.id, refs, e.target === 'video' ? r.result : src.video_url, e.target === 'video' ? r.frame : src.last_frame_url ?? null, src.project_id, src.index]);
        await db.query('UPDATE scenes SET selected=false WHERE project_id=$1 AND index=$2 AND selected', [src.project_id, src.index]); // a versão nova passa a ser a atual
        await db.query(`UPDATE background_edits SET status='done', error_code=NULL, result_media_url=$2, result_alpha_url=$3, derived_scene_id=$4, updated_at=now() WHERE id=$1`, [e.id, r.result, r.alphaKey, ins.rows[0]!.id]);
        await audit(db, d.userId, 'background.edit.done', 'scene', src.id, { editId: e.id, derivedSceneId: ins.rows[0]!.id }); return ins.rows[0]!.id;
      });
      logger.info({ editId: e.id, projectId: e.project_id, operation: e.operation, target: e.target, ms: Date.now() - t0, provider: e.provider }, 'edição de fundo concluída'); // R7: só IDs e números
      return { ok: true, derivedSceneId: derived };
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'background_failed';
      if (isFinal || (err instanceof AppError && err.status < 500)) {
        await asSystem((db) => db.query(`UPDATE background_edits SET status='failed', error_code=$2, updated_at=now() WHERE id=$1`, [e.id, code]));
        logger.warn({ editId: e.id, code }, 'edição de fundo falhou');
        if (err instanceof AppError && err.status < 500) return { ok: false, code };
      }
      throw err;
    }
  },

  /** Versões da cena (todas as linhas da mesma posição), com a atual marcada, a edição que gerou cada uma e as pendentes. */
  async versions(userId: string, projectId: string, sceneId: string) {
    await requireSceneVersions(userId); const s = await sceneOf(userId, projectId, sceneId);
    return asUser(userId, async (db) => {
      const rows = (await db.query<SceneRow>('SELECT * FROM scenes WHERE project_id=$1 AND index=$2 ORDER BY version DESC', [projectId, s.index])).rows;
      const current = [...rows].sort((a, b) => Number(!!b.selected) - Number(!!a.selected) || (b.version ?? 1) - (a.version ?? 1))[0]!; // mesma regra de projectsRepo.scenes
      const edits = (await db.query<EditRow>(`SELECT * FROM background_edits WHERE scene_id = ANY($1) OR derived_scene_id = ANY($1) ORDER BY created_at DESC LIMIT 50`, [rows.map((r) => r.id)])).rows;
      return {
        index: s.index, currentSceneId: current.id, urlsExpireInSec: ttl(),
        versions: await Promise.all(rows.map(async (r) => { const ed = edits.find((x) => x.derived_scene_id === r.id);
          return { sceneId: r.id, version: r.version ?? 1, derivedFromSceneId: r.derived_from_scene_id ?? null, current: r.id === current.id, original: !r.derived_from_scene_id,
            videoUrl: await signed(r.video_url), photoUrls: await Promise.all(r.reference_images.map((x) => signed(x))),
            elements: await Promise.all((r.inserted_elements ?? []).map(async (x) => ({ ...x, referenceImageUrl: await signed((x as { referenceImageUrl?: string | null }).referenceImageUrl), resultUrl: await signed((x as { resultUrl?: string }).resultUrl) }))),
            edit: ed ? { id: ed.id, operation: ed.operation, target: ed.target, prompt: ed.params.prompt ?? null, aspect: ed.operation === 'outpaint' ? ed.params.aspect : null, alphaUrl: await signed(ed.result_alpha_url), createdAt: ed.created_at } : null }; })),
        pending: edits.filter((x) => x.status !== 'done').map((x) => ({ id: x.id, status: x.status, operation: x.operation, target: x.target, errorCode: x.error_code, createdAt: x.created_at })),
      };
    });
  },
  /** Seletor de versões / reverter: marca esta linha como a versão em uso da posição. Nenhuma mídia muda. */
  async select(userId: string, projectId: string, sceneId: string) {
    await requireSceneVersions(userId); const s = await sceneOf(userId, projectId, sceneId);
    await tx({ userId }, async (db) => {
      await db.query('UPDATE scenes SET selected = (id = $3) WHERE project_id=$1 AND index=$2', [projectId, s.index, s.id]);
      await audit(db, userId, 'background.version.select', 'scene', s.id, { index: s.index, version: s.version ?? 1 });
    });
    return this.versions(userId, projectId, sceneId);
  },
  config: async (userId: string) => {
    await requireBackground(userId);
    return { provider: bgProviderName(), externalProcessing: bgProviderExternal(), aspects: ASPECTS, operations: ['remove', 'replace', 'outpaint'], messages: BG_MESSAGES, urlTtlSec: ttl(),
      notice: bgProviderExternal() ? 'Sua mídia será processada por um provedor externo de IA.' : 'Sua mídia será processada nos servidores do NexusReel (provedor de demonstração).' };
  },
};
