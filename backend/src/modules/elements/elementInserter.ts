import { join, extname } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo, type UserRow } from '../users/users.repository.js';
import { projectsRepo, type SceneRow } from '../projects/projects.repository.js';
import { enqueue, Q } from '../../queues/index.js';
import { storage, refLocation, sniffMime } from '../../providers/storage.js';
import { withTmp } from '../../utils/ffmpeg.js';
import { AppError, notFound } from '../../utils/errors.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { lastFrame } from '../background/engine.js';
import { elProviders, elProviderExternal, elProviderName } from './providers.js';
import { personConsent } from './personConsent.js';
import { elError, EL_MESSAGES } from './messages.js';

export const FLAG = 'ff_elements';
const frac = z.number().min(0).max(1);
const box = z.object({ x: frac, y: frac, w: z.number().min(0.02).max(1), h: z.number().min(0.02).max(1) });
const base = { target: z.enum(['video', 'photo']).default('video'), photoIndex: z.number().int().min(0).max(9).default(0), description: z.string().trim().max(200).default('') };
export const insertSchema = z.object({ ...base, type: z.enum(['person', 'animal', 'object']), referenceRef: z.string().max(300).optional(), consentId: z.string().uuid().optional(),
  position: z.object({ x: frac, y: frac }).default({ x: 0.7, y: 0.75 }), scale: z.number().min(0.05).max(1).default(0.35) }).strict();
export const replaceSchema = z.object({ ...base, type: z.enum(['person', 'animal', 'object']).default('object'), mode: z.enum(['recolor', 'remove']), region: box.optional(),
  hue: z.number().min(-180).max(180).default(120) }).strict();
export const elementBodySchema = z.discriminatedUnion('action', [insertSchema.extend({ action: z.literal('insert') }), replaceSchema.extend({ action: z.literal('replace') })]);
export type ElementBody = z.infer<typeof elementBodySchema>;
export interface InsertedElement { type: 'person' | 'animal' | 'object'; action: 'insert' | 'replace'; mode?: string; referenceImageUrl: string | null; description: string; resultUrl: string; status: 'done'; insertionId: string }
interface Row { id: string; project_id: string; source_scene_id: string | null; derived_scene_id: string | null; action: 'insert' | 'replace'; type: string; mode: string | null; reference_url: string | null;
  description: string; params: ElementBody; consent_id: string | null; result_url: string | null; provider: string | null; status: string; error_code: string | null; created_at: string }

const user = async (userId: string): Promise<UserRow> => { const u = await asSystem((db) => usersRepo.byId(db, userId)); if (!u) throw notFound(); return u; };
/** R1: sem `ff_elements` a funcionalidade não existe para o usuário (404). */
export async function requireElements(userId: string): Promise<UserRow> {
  const u = await user(userId); if (!(await isEnabled(FLAG, { userId, region: u.region, plan: u.plan }))) throw notFound(); return u;
}
async function assertExternalConsent(userId: string) {
  if (!elProviderExternal()) return;
  const ok = await asUser(userId, async (db) => (await db.query<{ "?column?": number | null }>(`SELECT 1 FROM consents WHERE user_id=$1 AND type='external_provider' AND revoked_at IS NULL AND verified_at IS NOT NULL LIMIT 1`, [userId])).rowCount);
  if (!ok) throw elError(403, 'external_provider_consent_required');
}
async function sceneOf(userId: string, projectId: string, sceneId: string): Promise<SceneRow> {
  const p = await asUser(userId, (db) => projectsRepo.byId(db, projectId)); if (!p) throw elError(404, 'project_not_found', undefined, 'not_found');
  const s = await asUser(userId, (db) => projectsRepo.scene(db, projectId, sceneId)); if (!s) throw elError(404, 'scene_not_found', undefined, 'not_found');
  return s;
}
async function ownImage(userId: string, ref: string | undefined): Promise<boolean> {
  if (!ref || !ref.startsWith(`uploads/${userId}/`)) return false; const l = refLocation(ref);
  return (await storage.exists(l.bucket, l.key)) && !!sniffMime((await storage.get(l.bucket, l.key)).subarray(0, 64))?.startsWith('image/');
}

async function request(userId: string, projectId: string, sceneId: string, b: ElementBody) {
  const u = await requireElements(userId); const s = await sceneOf(userId, projectId, sceneId);
  // Pessoa real: o consentimento é conferido ANTES de olhar a referência, criar registro ou enfileirar (nada sai do servidor sem ele)
  let consentId: string | null = null;
  if (b.action === 'insert' && b.type === 'person') consentId = await personConsent.assertUsable(userId, b.consentId);
  const source = b.target === 'video' ? s.video_url : s.reference_images[b.photoIndex];
  if (!source) throw elError(409, 'scene_media_missing');
  if (b.action === 'insert') { if (!b.referenceRef) throw elError(400, 'reference_required', undefined, 'bad_request'); if (!(await ownImage(userId, b.referenceRef))) throw elError(422, 'reference_invalid'); }
  if (b.action === 'replace' && !b.region) throw elError(400, 'region_required', undefined, 'bad_request');
  await assertExternalConsent(userId);
  const row = await tx({ userId }, async (db) => {
    const r = await db.query<{ id: string }>(`INSERT INTO element_insertions (project_id, source_scene_id, action, type, mode, reference_url, description, params, consent_id, provider)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [projectId, s.id, b.action, b.type, b.action === 'replace' ? b.mode : null, b.action === 'insert' ? b.referenceRef : null, b.description, b, consentId, elProviderName()]);
    await audit(db, userId, `elements.${b.action}.request`, 'scene', s.id, { insertionId: r.rows[0]!.id, type: b.type, consent: !!consentId }); return r.rows[0]!;
  });
  await enqueue(Q.elementsInsert, b.action, { insertionId: row.id, userId }, { plan: u.plan, userId, jobId: `el-${row.id}` });
  return { insertionId: row.id, status: 'queued', action: b.action, type: b.type };
}

export const elementInserter = {
  /** Insere pessoa (com consentimento person_image), animal ou objeto na cena, a partir de uma foto de referência. */
  insertElement: (userId: string, projectId: string, sceneId: string, b: z.infer<typeof insertSchema>) => request(userId, projectId, sceneId, { ...b, action: 'insert' }),
  /** Substitui um elemento existente: recolorir uma região (ex.: roupa) ou remover um objeto do fundo. */
  replaceElement: (userId: string, projectId: string, sceneId: string, b: z.infer<typeof replaceSchema>) => request(userId, projectId, sceneId, { ...b, action: 'replace' }),
  request,

  /** Worker `elements-insert`. Idempotente; confere o consentimento de novo antes de chamar o provedor (pode ter sido revogado). */
  async process(d: { insertionId: string; userId: string }, isFinal: boolean) {
    const e = await asSystem(async (db) => (await db.query<Row>('SELECT * FROM element_insertions WHERE id=$1', [d.insertionId])).rows[0]);
    if (!e || e.status === 'done') return { skipped: true };
    const fail = async (code: string) => { await asSystem((db) => db.query(`UPDATE element_insertions SET status='failed', error_code=$2, updated_at=now() WHERE id=$1`, [e.id, code])); logger.warn({ insertionId: e.id, code }, 'inserção de elemento falhou'); };
    const src = await asSystem(async (db) => (await db.query<SceneRow>('SELECT * FROM scenes WHERE id=$1', [e.source_scene_id])).rows[0]);
    if (!src) { await fail('scene_not_found'); return { ok: false }; }
    const p = e.params;
    if (e.action === 'insert' && e.type === 'person') {
      try { await personConsent.assertUsable(d.userId, e.consent_id ?? undefined); } catch { await fail('person_consent_required'); return { ok: false, code: 'person_consent_required' }; }
    }
    await asSystem((db) => db.query(`UPDATE element_insertions SET status='processing', updated_at=now() WHERE id=$1`, [e.id]));
    const ctx = { userId: d.userId, projectId: e.project_id }; const t0 = Date.now();
    try {
      const prefix = `projects/${e.project_id}/elements/${e.id}`; const isVideo = p.target === 'video';
      const sourceRef = isVideo ? src.video_url! : src.reference_images[p.photoIndex ?? 0]!;
      const r = await withTmp(async (dir) => {
        const ext = isVideo ? '.mp4' : (extname(sourceRef).toLowerCase() || '.png').replace('.jpeg', '.jpg');
        const inFile = join(dir, 'source' + ext); const l = refLocation(sourceRef); await writeFile(inFile, await storage.get(l.bucket, l.key)); // só leitura do original
        let out: string;
        if (e.action === 'insert') {
          const ref = join(dir, 'reference' + (extname(e.reference_url!).toLowerCase() || '.png')); const rl = refLocation(e.reference_url!); await writeFile(ref, await storage.get(rl.bucket, rl.key));
          out = (await elProviders.insert(inFile, ref, { x: (p as z.infer<typeof insertSchema>).position.x, y: (p as z.infer<typeof insertSchema>).position.y, scale: (p as z.infer<typeof insertSchema>).scale }, dir, ctx)).out;
        } else {
          const rp = p as z.infer<typeof replaceSchema>;
          out = rp.mode === 'recolor' ? (await elProviders.recolor(inFile, rp.region!, rp.hue, dir, ctx)).out : (await elProviders.erase(inFile, rp.region!, dir, ctx)).out;
        }
        const put = async (file: string, name: string) => { const key = `${prefix}/${name}${extname(file)}`; await storage.put('videos', key, await readFile(file), file.endsWith('.mp4') ? 'video/mp4' : file.endsWith('.jpg') ? 'image/jpeg' : 'image/png'); return key; };
        return { result: await put(out, 'result'), frame: isVideo ? await put(await lastFrame(out, dir), 'last') : null };
      });
      const derived = await asSystem(async (db) => {
        await db.query<{ pg_advisory_xact_lock: unknown }>('SELECT pg_advisory_xact_lock(hashtext($1))', [`scene:${src.project_id}:${src.index}`]);
        const cur = (await db.query<{ derived_scene_id: string | null }>('SELECT derived_scene_id FROM element_insertions WHERE id=$1 FOR UPDATE', [e.id])).rows[0];
        if (cur?.derived_scene_id) return cur.derived_scene_id;
        const refs = [...src.reference_images]; if (!isVideo) refs[p.photoIndex ?? 0] = r.result;
        const el: InsertedElement = { type: e.type as InsertedElement['type'], action: e.action, ...(e.mode ? { mode: e.mode } : {}), referenceImageUrl: e.reference_url, description: e.description, resultUrl: r.result, status: 'done', insertionId: e.id };
        const ins = await db.query<{ id: string }>(`INSERT INTO scenes (project_id, index, text, duration_sec, prompt, reference_mode, reference_images, video_url, last_frame_url, chained_from_scene_id, status, error_message, retried, consistency, version, derived_from_scene_id, inserted_elements)
          SELECT project_id, index, text, duration_sec, prompt, reference_mode, $2, $3, $4, chained_from_scene_id, status, error_message, retried, consistency,
                 (SELECT COALESCE(MAX(version), 0) + 1 FROM scenes WHERE project_id=$5 AND index=$6), id, inserted_elements || $7::jsonb
          FROM scenes WHERE id=$1 RETURNING id`, [src.id, refs, isVideo ? r.result : src.video_url, isVideo ? r.frame : src.last_frame_url ?? null, src.project_id, src.index, JSON.stringify([el])]);
        await db.query('UPDATE scenes SET selected=false WHERE project_id=$1 AND index=$2 AND selected', [src.project_id, src.index]);
        await db.query(`UPDATE element_insertions SET status='done', error_code=NULL, result_url=$2, derived_scene_id=$3, updated_at=now() WHERE id=$1`, [e.id, r.result, ins.rows[0]!.id]);
        await audit(db, d.userId, `elements.${e.action}.done`, 'scene', src.id, { insertionId: e.id, derivedSceneId: ins.rows[0]!.id }); return ins.rows[0]!.id;
      });
      logger.info({ insertionId: e.id, projectId: e.project_id, action: e.action, type: e.type, ms: Date.now() - t0, provider: e.provider }, 'inserção de elemento concluída'); // R7
      return { ok: true, derivedSceneId: derived };
    } catch (err) {
      const code = err instanceof AppError ? err.code : 'elements_failed';
      if (isFinal || (err instanceof AppError && err.status < 500)) { await fail(code); if (err instanceof AppError && err.status < 500) return { ok: false, code }; }
      throw err;
    }
  },
  async list(userId: string, projectId: string, sceneId: string) {
    await requireElements(userId); const s = await sceneOf(userId, projectId, sceneId);
    const rows = await asUser(userId, async (db) => (await db.query<Row>(`SELECT e.* FROM element_insertions e JOIN scenes sc ON sc.id = e.source_scene_id WHERE e.project_id=$1 AND sc.index=$2 ORDER BY e.created_at DESC LIMIT 50`, [projectId, s.index])).rows);
    return { items: rows.map((x) => ({ id: x.id, action: x.action, type: x.type, mode: x.mode, description: x.description, status: x.status, errorCode: x.error_code, derivedSceneId: x.derived_scene_id, createdAt: x.created_at })) };
  },
  config: async (userId: string) => {
    await requireElements(userId);
    return { provider: elProviderName(), externalProcessing: elProviderExternal(), types: ['person', 'animal', 'object'], replaceModes: ['recolor', 'remove'], messages: EL_MESSAGES,
      notice: elProviderExternal() ? 'Sua mídia será processada por um provedor externo de IA.' : 'Sua mídia será processada nos servidores do NexusReel (provedor de demonstração).' };
  },
};
