import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { enqueue, Q } from '../../queues/index.js';
import { storage, refLocation, safeFileName } from '../../providers/storage.js';
import { recordUsage } from '../../providers/ai/router.js';
import { audioService } from '../audio/audio.service.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { CLOUD_PROVIDERS, CloudError, MAX_UPLOAD_BYTES, type CloudProviderId } from './cloudProviders.js';
import { cloudOAuth, cloudToApp } from './cloudOAuth.js';
import { saveError, SAVE_MESSAGES } from './messages.js';
import { loadUser, requireSave } from './flag.js';
import { zipStore } from './zip.js';

/**
 * Módulo 5 — Salvamento (`ff_save`). Só LÊ o vídeo final do projeto (o original nunca é alterado) e grava uma linha em
 * `destination_exports` por salvamento.
 * - `saveToDevice`: o servidor só emite um link assinado (24 h) com nome de arquivo; o aparelho grava na galeria
 *   (Capacitor Filesystem + Share: iOS Fotos / Android MediaStore) ou na pasta escolhida (File System Access API no
 *   navegador). iCloud Drive segue esse mesmo caminho (Compartilhar → Salvar em Arquivos).
 * - `saveToCloud`: fila `save-export` → upload com o token do usuário (Google Drive, Dropbox, OneDrive).
 * - `saveToNexusCloud`: cópia no bucket `archive` (separado do storage operacional, que expira cenas em 90 dias),
 *   retenção Free 90 dias / Pro 365 dias. Subir de plano estende; descer nunca encurta o que já foi salvo.
 * - `batchExport`: B2B — um ZIP por produto do catálogo (vídeo + ficha.json + legenda.txt).
 */
export const DESTINATIONS = ['device', 'local_folder', 'icloud', 'nexus_cloud', ...CLOUD_PROVIDERS] as const;
export type Destination = (typeof DESTINATIONS)[number];
export const BATCH_DESTINATIONS = ['device', 'nexus_cloud', ...CLOUD_PROVIDERS] as const;
export const saveBodySchema = z.object({ destination: z.enum(DESTINATIONS) }).strict();
export const batchBodySchema = z.object({ destination: z.enum(BATCH_DESTINATIONS), itemIds: z.array(z.string().uuid()).min(1).max(500).optional() }).strict();
const DEVICE_FLOW: Record<'device' | 'local_folder' | 'icloud', 'gallery' | 'folder' | 'ios_files'> = { device: 'gallery', local_folder: 'folder', icloud: 'ios_files' };
const isCloud = (d: string): d is CloudProviderId => (CLOUD_PROVIDERS as readonly string[]).includes(d);

interface ExportRow { id: string; user_id: string; project_id: string | null; destination: Destination; status: string; external_url: string | null; error: string | null; created_at: string; kind: 'video' | 'zip';
  batch_id: string | null; catalog_id: string | null; catalog_item_id: string | null; file_name: string | null; storage_key: string | null; bytes: string | null; sha256: string | null; expires_at: string | null; updated_at: string }
interface ProjectRow { id: string; user_id: string; title: string; status: string; final_video_url: string | null; active_audio_version_id: string | null; deleted_at: string | null }

export const retentionDays = (plan: string) => (plan === 'free' ? env.NEXUS_CLOUD_RETENTION_FREE_DAYS : env.NEXUS_CLOUD_RETENTION_PRO_DAYS);
export const quotaBytes = (plan: string) => (plan === 'free' ? env.NEXUS_CLOUD_QUOTA_FREE_MB : env.NEXUS_CLOUD_QUOTA_PRO_MB) * 1024 * 1024;
/** Validade efetiva na Nuvem NexusReel: o maior entre o prazo gravado e o prazo do plano atual. */
const effectiveExpiry = (r: ExportRow, plan: string): string | null => {
  if (!r.expires_at) return null;
  if (r.destination !== 'nexus_cloud') return r.expires_at;
  const byPlan = new Date(new Date(r.created_at).getTime() + retentionDays(plan) * 86400_000);
  return new Date(Math.max(new Date(r.expires_at).getTime(), byPlan.getTime())).toISOString();
};
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const videoName = (title: string) => `${safeFileName(title).replace(/\.mp4$/i, '')}.mp4`;

async function ownedProject(userId: string, projectId: string): Promise<ProjectRow> {
  const p = await asUser(userId, async (db) => (await db.query<ProjectRow>('SELECT id, user_id, title, status, final_video_url, active_audio_version_id, deleted_at FROM projects WHERE id=$1', [projectId])).rows[0]);
  if (!p || p.deleted_at) throw saveError(404, 'project_not_found', undefined, 'not_found');
  if (p.status !== 'ready' || !p.final_video_url) throw saveError(409, 'video_not_assembled');
  return p;
}
async function usedBytes(userId: string, exceptId?: string): Promise<number> {
  return asUser(userId, async (db) => Number((await db.query<{ s: number }>(`SELECT COALESCE(SUM(bytes),0) AS s FROM destination_exports WHERE user_id=$1 AND destination='nexus_cloud' AND status IN ('done','processing') AND storage_key IS NOT NULL AND id <> COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000')`, [userId, exceptId ?? null])).rows[0].s));
}
async function dto(r: ExportRow, plan: string) {
  const live = r.status === 'done' && !!r.storage_key;
  return { exportId: r.id, projectId: r.project_id, destination: r.destination, kind: r.kind, status: r.status, fileName: r.file_name, bytes: r.bytes === null ? null : Number(r.bytes),
    externalUrl: r.external_url, errorCode: r.error, createdAt: r.created_at, expiresAt: effectiveExpiry(r, plan), batchId: r.batch_id, catalogItemId: r.catalog_item_id,
    url: live ? await storage.signedGetUrl('archive', r.storage_key!, env.SAVE_URL_TTL_SEC, { downloadName: r.file_name ?? undefined }) : null, urlExpiresInSec: live ? env.SAVE_URL_TTL_SEC : null };
}
const insertRow = (userId: string, v: { projectId: string | null; destination: Destination; status: string; kind?: 'video' | 'zip'; fileName: string; batchId?: string; catalogId?: string; catalogItemId?: string }) =>
  tx({ userId }, async (db) => {
    const r = await db.query<ExportRow>(`INSERT INTO destination_exports (user_id, project_id, destination, status, kind, file_name, batch_id, catalog_id, catalog_item_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [userId, v.projectId, v.destination, v.status, v.kind ?? 'video', v.fileName, v.batchId ?? null, v.catalogId ?? null, v.catalogItemId ?? null]);
    await audit(db, userId, 'save.request', v.kind === 'zip' ? 'catalog_item' : 'project', (v.catalogItemId ?? v.projectId)!, { exportId: r.rows[0]!.id, destination: v.destination });
    return r.rows[0]!;
  });
const setRow = (id: string, sql: string, vals: unknown[]) => asSystem((db) => db.query(`UPDATE destination_exports SET ${sql}, updated_at=now() WHERE id=$1`, [id, ...vals]));

export const storageExportService = {
  /** POST /projects/:projectId/save — escolhe o caminho pelo destino. */
  async save(userId: string, projectId: string, b: z.infer<typeof saveBodySchema>) {
    if (b.destination === 'nexus_cloud') return this.saveToNexusCloud(userId, projectId);
    if (isCloud(b.destination)) return this.saveToCloud(userId, projectId, b.destination);
    return this.saveToDevice(userId, projectId, b.destination);
  },
  /** Aparelho / pasta local / iCloud (pelo app Arquivos): link assinado de 24 h + nome do arquivo; o cliente grava. */
  async saveToDevice(userId: string, projectId: string, target: 'device' | 'local_folder' | 'icloud') {
    const u = await requireSave(userId); const p = await ownedProject(userId, projectId);
    const ref = (await audioService.effectiveVideoRef(p, u)) ?? p.final_video_url!; const l = refLocation(ref); const fileName = videoName(p.title);
    const row = await insertRow(userId, { projectId, destination: target, status: 'done', fileName });
    return { exportId: row.id, destination: target, status: 'done', flow: DEVICE_FLOW[target], fileName, mime: 'video/mp4',
      url: await storage.signedGetUrl(l.bucket, l.key, env.SAVE_URL_TTL_SEC, { downloadName: fileName }), urlExpiresInSec: env.SAVE_URL_TTL_SEC };
  },
  /** Nuvem do usuário (precisa de conexão): enfileira o upload. */
  async saveToCloud(userId: string, projectId: string, provider: CloudProviderId) {
    const u = await requireSave(userId); const p = await ownedProject(userId, projectId);
    const c = await asUser(userId, async (db) => (await db.query<{ status: string }>('SELECT status FROM cloud_connections WHERE user_id=$1 AND provider=$2', [userId, provider])).rows[0]);
    if (!c) throw saveError(409, 'cloud_not_connected', { provider });
    const row = await insertRow(userId, { projectId, destination: provider, status: 'queued', fileName: videoName(p.title) });
    await enqueue(Q.saveExport, 'save', { exportId: row.id, userId }, { plan: u.plan, userId, jobId: `save-${row.id}` });
    return { exportId: row.id, destination: provider, status: 'queued' };
  },
  /** Nuvem NexusReel: cópia de longo prazo no bucket `archive`. */
  async saveToNexusCloud(userId: string, projectId: string) {
    const u = await requireSave(userId); const p = await ownedProject(userId, projectId);
    if ((await usedBytes(userId)) >= quotaBytes(u.plan)) throw saveError(409, 'nexus_quota_exceeded', { quotaBytes: quotaBytes(u.plan) });
    const row = await insertRow(userId, { projectId, destination: 'nexus_cloud', status: 'queued', fileName: videoName(p.title) });
    await enqueue(Q.saveExport, 'save', { exportId: row.id, userId }, { plan: u.plan, userId, jobId: `save-${row.id}` });
    return { exportId: row.id, destination: 'nexus_cloud', status: 'queued', retentionDays: retentionDays(u.plan) };
  },
  /** B2B: um ZIP por produto do catálogo (só itens com vídeo pronto). */
  async batchExport(userId: string, catalogId: string, b: z.infer<typeof batchBodySchema>) {
    const u = await requireSave(userId);
    const cat = await asUser(userId, async (db) => (await db.query<{ id: string; name: string }>('SELECT id, name FROM catalogs WHERE id=$1', [catalogId])).rows[0]);
    if (!cat) throw saveError(404, 'catalog_not_found', undefined, 'not_found');
    const items = await asUser(userId, async (db) => (await db.query<{ id: string; sku: string; project_id: string | null; pstatus: string | null; final_video_url: string | null; deleted_at: string | null }>(
      `SELECT ci.id, ci.sku, ci.project_id, p.status AS pstatus, p.final_video_url, p.deleted_at FROM catalog_items ci LEFT JOIN projects p ON p.id = ci.project_id
       WHERE ci.catalog_id=$1 AND ($2::uuid[] IS NULL OR ci.id = ANY($2)) ORDER BY ci.sku LIMIT $3`, [catalogId, b.itemIds ?? null, env.SAVE_BATCH_MAX_ITEMS])).rows);
    const ready = items.filter((i) => i.project_id && i.pstatus === 'ready' && i.final_video_url && !i.deleted_at);
    const skipped = items.filter((i) => !ready.includes(i)).map((i) => ({ itemId: i.id, sku: i.sku, reason: 'video_not_ready' }));
    if (!ready.length) throw saveError(409, 'batch_empty');
    if (isCloud(b.destination)) {
      const c = await asUser(userId, async (db) => (await db.query<{ "?column?": number | null }>('SELECT 1 FROM cloud_connections WHERE user_id=$1 AND provider=$2', [userId, b.destination])).rows[0]);
      if (!c) throw saveError(409, 'cloud_not_connected', { provider: b.destination });
    }
    if (b.destination === 'nexus_cloud' && (await usedBytes(userId)) >= quotaBytes(u.plan)) throw saveError(409, 'nexus_quota_exceeded', { quotaBytes: quotaBytes(u.plan) });
    const batchId = randomUUID(); const out: { exportId: string; itemId: string; sku: string; status: string }[] = [];
    for (const i of ready) {
      const row = await insertRow(userId, { projectId: i.project_id, destination: b.destination, status: 'queued', kind: 'zip', fileName: `${safeFileName(cat.name)}-${safeFileName(i.sku)}.zip`, batchId, catalogId, catalogItemId: i.id });
      await enqueue(Q.saveExport, 'save', { exportId: row.id, userId }, { plan: u.plan, userId, jobId: `save-${row.id}` });
      out.push({ exportId: row.id, itemId: i.id, sku: i.sku, status: 'queued' });
    }
    return { batchId, catalogId, destination: b.destination, items: out, skipped };
  },
  /** ZIP de um produto: vídeo + ficha.json + legenda.txt (dados do produto, sem dados pessoais). */
  async buildProductZip(r: ExportRow, u: { id: string; region: string; plan: string }): Promise<Buffer> {
    const it = await asSystem(async (db) => (await db.query<{ sku: string; name: string; description: string; price: string; category: string; catalog_name: string; owner_id: string; project_id: string | null }>(
      `SELECT ci.sku, ci.name, ci.description, ci.price, ci.category, c.name AS catalog_name, c.owner_id, ci.project_id FROM catalog_items ci JOIN catalogs c ON c.id = ci.catalog_id WHERE ci.id=$1`, [r.catalog_item_id])).rows[0]);
    if (!it || it.owner_id !== r.user_id || !it.project_id) throw saveError(404, 'catalog_not_found', undefined, 'not_found'); // dono conferido de novo no worker
    const p = await asSystem(async (db) => (await db.query<ProjectRow>('SELECT id, user_id, title, status, final_video_url, active_audio_version_id, deleted_at FROM projects WHERE id=$1 AND user_id=$2', [it.project_id, r.user_id])).rows[0]);
    if (!p || p.deleted_at || p.status !== 'ready' || !p.final_video_url) throw saveError(409, 'video_not_assembled');
    const l = refLocation((await audioService.effectiveVideoRef(p, u)) ?? p.final_video_url); const video = await storage.get(l.bucket, l.key);
    const base = safeFileName(it.sku); const now = new Date();
    const ficha = { sku: it.sku, nome: it.name, descricao: it.description, preco: Number(it.price), categoria: it.category, catalogo: it.catalog_name, video: `${base}.mp4`, exportadoEm: now.toISOString() };
    const legenda = [it.name, it.description, Number(it.price) ? `R$ ${Number(it.price).toFixed(2).replace('.', ',')}` : ''].filter(Boolean).join('\n\n');
    return zipStore([{ name: `${base}.mp4`, data: video, date: now }, { name: 'ficha.json', data: Buffer.from(JSON.stringify(ficha, null, 2)), date: now }, { name: 'legenda.txt', data: Buffer.from(legenda + '\n'), date: now }]);
  },
  /** Worker `save-export`: Nuvem NexusReel, nuvem do usuário ou ZIP. Idempotente (linha já concluída = ignora). */
  async process(d: { exportId: string; userId: string }, isFinal: boolean) {
    const r = await asSystem(async (db) => (await db.query<ExportRow>('SELECT * FROM destination_exports WHERE id=$1', [d.exportId])).rows[0]);
    if (!r || ['done', 'deleted', 'expired'].includes(r.status)) return { skipped: true };
    const t0 = Date.now();
    try {
      await setRow(r.id, `status='processing'`, []);
      const u = await loadUser(r.user_id);
      let body: Buffer; let mime: string;
      if (r.kind === 'zip') { body = await this.buildProductZip(r, u); mime = 'application/zip'; }
      else {
        const p = await asSystem(async (db) => (await db.query<ProjectRow>('SELECT id, user_id, title, status, final_video_url, active_audio_version_id, deleted_at FROM projects WHERE id=$1 AND user_id=$2', [r.project_id, r.user_id])).rows[0]);
        if (!p || p.deleted_at || !p.final_video_url) throw saveError(404, 'project_not_found', undefined, 'not_found');
        const l = refLocation((await audioService.effectiveVideoRef(p, u)) ?? p.final_video_url); body = await storage.get(l.bucket, l.key); mime = 'video/mp4'; // só leitura
      }
      const hash = sha(body); const name = r.file_name ?? (r.kind === 'zip' ? 'produto.zip' : 'video.mp4');
      if (r.destination === 'nexus_cloud' || r.destination === 'device') {
        if (r.destination === 'nexus_cloud' && (await usedBytes(r.user_id, r.id)) + body.length > quotaBytes(u.plan)) throw saveError(409, 'nexus_quota_exceeded', { quotaBytes: quotaBytes(u.plan) });
        const key = `${r.user_id}/${r.id}/${name}`; await storage.put('archive', key, body, mime);
        const days = r.destination === 'nexus_cloud' ? retentionDays(u.plan) : env.SAVE_DEVICE_ZIP_DAYS;
        await setRow(r.id, `status='done', storage_key=$2, bytes=$3, sha256=$4, expires_at=now() + make_interval(days => $5::int), error=NULL`, [key, body.length, hash, days]);
        await recordUsage({ provider: 'nexus_cloud', operation: r.kind === 'zip' ? 'save_zip' : 'save_nexus_cloud', costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: r.project_id ?? undefined, status: 'ok' });
      } else if (isCloud(r.destination)) {
        if (body.length > MAX_UPLOAD_BYTES[r.destination]) throw saveError(413, 'file_too_large', { provider: r.destination });
        const up = await cloudOAuth.upload(r.user_id, r.destination, { name, mime, body }, r.project_id ?? undefined);
        await setRow(r.id, `status='done', external_url=$2, bytes=$3, sha256=$4, error=NULL`, [up.externalUrl, body.length, hash]);
      }
      await asSystem((db) => audit(db, r.user_id, 'save.done', r.kind === 'zip' ? 'catalog_item' : 'project', (r.catalog_item_id ?? r.project_id)!, { exportId: r.id, destination: r.destination }));
      logger.info({ exportId: r.id, destination: r.destination, kind: r.kind, bytes: body.length, ms: Date.now() - t0 }, 'salvamento concluído'); // R7: sem PII
      return { ok: true };
    } catch (err) {
      const app = isCloud(r.destination) ? cloudToApp(err, r.destination) : err instanceof AppError ? err : saveError(503, 'save_failed');
      const definitive = (err instanceof AppError && err.status < 500) || (err instanceof CloudError && !err.retryable);
      if (isFinal || definitive) {
        await setRow(r.id, `status='failed', error=$2`, [app.code]);
        logger.warn({ exportId: r.id, destination: r.destination, code: app.code }, 'salvamento falhou');
        if (definitive) return { ok: false, code: app.code };
      } else await setRow(r.id, `status='queued'`, []);
      throw err;
    }
  },
  async status(userId: string, exportId: string) {
    const u = await requireSave(userId);
    const r = await asUser(userId, async (db) => (await db.query<ExportRow>('SELECT * FROM destination_exports WHERE id=$1', [exportId])).rows[0]);
    if (!r) throw saveError(404, 'export_not_found', undefined, 'not_found');
    return dto(r, u.plan);
  },
  async list(userId: string, destination?: string) {
    const u = await requireSave(userId);
    const rows = await asUser(userId, async (db) => (await db.query<ExportRow>(`SELECT * FROM destination_exports WHERE user_id=$1 AND ($2::text IS NULL OR destination=$2) AND status <> 'deleted' ORDER BY created_at DESC LIMIT 100`, [userId, destination ?? null])).rows);
    return { items: await Promise.all(rows.map((r) => dto(r, u.plan))), nexusCloud: { usedBytes: await usedBytes(userId), quotaBytes: quotaBytes(u.plan), retentionDays: retentionDays(u.plan) } };
  },
  async batch(userId: string, batchId: string) {
    const u = await requireSave(userId);
    const rows = await asUser(userId, async (db) => (await db.query<ExportRow>('SELECT * FROM destination_exports WHERE batch_id=$1 ORDER BY file_name', [batchId])).rows);
    if (!rows.length) throw saveError(404, 'export_not_found', undefined, 'not_found');
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    return { batchId, destination: rows[0]!.destination, total: rows.length, done: count('done'), failed: count('failed'), pending: count('queued') + count('processing'), items: await Promise.all(rows.map((r) => dto(r, u.plan))) };
  },
  /** Apaga um item da Nuvem NexusReel (ou um ZIP para baixar) antes do prazo. */
  async remove(userId: string, exportId: string) {
    await requireSave(userId);
    const r = await asUser(userId, async (db) => (await db.query<ExportRow>('SELECT * FROM destination_exports WHERE id=$1', [exportId])).rows[0]);
    if (!r || !r.storage_key) throw saveError(404, 'export_not_found', undefined, 'not_found');
    await storage.delete('archive', r.storage_key);
    await tx({ userId }, async (db) => { await db.query(`UPDATE destination_exports SET status='deleted', storage_key=NULL, updated_at=now() WHERE id=$1`, [r.id]); await audit(db, userId, 'save.delete', 'destination_export', r.id); });
  },
  /** Job diário `save-retention`: apaga da Nuvem NexusReel o que passou da validade efetiva. */
  async purgeExpired(): Promise<{ purged: number }> {
    const rows = await asSystem(async (db) => (await db.query<{ id: string; storage_key: string }>(`
      SELECT e.id, e.storage_key FROM destination_exports e JOIN users u ON u.id = e.user_id
      WHERE e.status='done' AND e.storage_key IS NOT NULL AND e.expires_at IS NOT NULL
        AND (CASE WHEN e.destination='nexus_cloud' THEN GREATEST(e.expires_at, e.created_at + make_interval(days => CASE WHEN u.plan='free' THEN $1::int ELSE $2::int END)) ELSE e.expires_at END) < now()
      ORDER BY e.expires_at LIMIT 1000`, [env.NEXUS_CLOUD_RETENTION_FREE_DAYS, env.NEXUS_CLOUD_RETENTION_PRO_DAYS])).rows);
    for (const r of rows) { await storage.delete('archive', r.storage_key); await setRow(r.id, `status='expired', storage_key=NULL`, []); }
    if (rows.length) logger.info({ purged: rows.length }, 'Nuvem NexusReel: itens vencidos apagados');
    return { purged: rows.length };
  },
  async config(userId: string) {
    const u = await requireSave(userId);
    return { destinations: DESTINATIONS, batchDestinations: BATCH_DESTINATIONS, connections: (await cloudOAuth.list(userId)).items,
      nexusCloud: { retentionDays: retentionDays(u.plan), retentionByPlan: { free: env.NEXUS_CLOUD_RETENTION_FREE_DAYS, pro: env.NEXUS_CLOUD_RETENTION_PRO_DAYS }, quotaBytes: quotaBytes(u.plan), usedBytes: await usedBytes(userId) },
      deviceLinkTtlSec: env.SAVE_URL_TTL_SEC, batchMaxItems: env.SAVE_BATCH_MAX_ITEMS, messages: SAVE_MESSAGES };
  },
};
