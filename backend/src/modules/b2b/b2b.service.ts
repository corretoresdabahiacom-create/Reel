import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { AppError, notFound, unprocessable } from '../../utils/errors.js';
import { sha256, randomToken } from '../../utils/crypto.js';
import { usersRepo } from '../users/users.repository.js';
import { generationService } from '../generation/generation.service.js';
import { publicationService, type Target } from '../publication/publication.service.js';
import { registerBatchHooks } from './hooks.js';
import { parseCsv, sanitizeCell } from './csv.js';
import { enqueue, Q } from '../../queues/index.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import type { Row } from '../../db/rows.generated.js';

export const MAX_ITEMS = 500; export const API_SCOPES = ['catalogs:read', 'catalogs:generate', 'catalogs:publish'] as const;
const catDto = (r: Row<'catalogs'>, n?: number) => ({ id: r.id, name: r.name, description: r.description, niche: r.niche, defaultTemplateId: r.default_template_id, createdAt: r.created_at, ...(n === undefined ? {} : { items: n }) });
const itemDto = (r: Row<'catalog_items'>) => ({ id: r.id, sku: r.sku, name: r.name, description: r.description, price: Number(r.price), category: r.category, photoUrls: r.photo_urls, projectId: r.project_id, status: r.status, error: r.error });
const batchDto = (r: Row<'batch_jobs'>) => ({ id: r.id, type: r.type, catalogId: r.catalog_id, totalItems: r.total_items, completedItems: r.completed_items, failedItems: r.failed_items, status: r.status, createdAt: r.created_at, finishedAt: r.finished_at });
export interface RawItem { sku?: string; name?: string; description?: string; price?: number | string; category?: string; photoUrls?: string[] | string }

const parsePrice = (v: unknown): number | null => { if (typeof v === 'number') return Number.isFinite(v) && v >= 0 && v < 1e7 ? Math.round(v * 100) / 100 : null; const s = String(v ?? '').trim().replace(/^R\$\s*/i, ''); if (!s) return 0; const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) && n >= 0 && n < 1e7 ? Math.round(n * 100) / 100 : null; };
export function itemsFromCsv(text: string): RawItem[] {
  const rows = parseCsv(text); if (rows.length < 2) throw unprocessable('CSV vazio ou sem linhas de dados'); if (rows.length - 1 > MAX_ITEMS) throw unprocessable(`Máximo de ${MAX_ITEMS} produtos por importação`);
  const head = rows[0]!.map((h) => h.trim().toLowerCase().replace(/\s+/g, '_')); const idx = (...n: string[]) => head.findIndex((h) => n.includes(h));
  const iSku = idx('sku', 'codigo', 'código'), iName = idx('name', 'nome', 'produto'), iDesc = idx('description', 'descricao', 'descrição'), iPrice = idx('price', 'preco', 'preço'), iCat = idx('category', 'categoria'), iPh = idx('photo_urls', 'fotos', 'photos', 'photo');
  if (iName < 0) throw unprocessable('CSV precisa da coluna "name" (ou "nome")');
  return rows.slice(1).map((r) => ({ sku: iSku >= 0 ? r[iSku] : undefined, name: r[iName], description: iDesc >= 0 ? r[iDesc] : '', price: iPrice >= 0 ? r[iPrice] : 0, category: iCat >= 0 ? r[iCat] : '', photoUrls: iPh >= 0 ? r[iPh] : '' }));
}
const owns = async (userId: string, id: string) => { const c = (await pool.query<Row<'catalogs'>>('SELECT * FROM catalogs WHERE id=$1 AND owner_id=$2', [id, userId])).rows[0]; if (!c) throw notFound('Catálogo não encontrado'); return c; };
const requirePlan = async (userId: string) => { const u = (await usersRepo.byId(pool, userId))!; if (u.plan === 'free') throw new AppError(403, 'plan_required', 'Operações em lote exigem plano Pro ou Business'); return u; };

export const b2bService = {
  async createCatalog(userId: string, b: { name: string; description?: string; niche?: string; defaultTemplateId?: string }) { const r = await pool.query<Row<'catalogs'>>('INSERT INTO catalogs (owner_id,name,description,niche,default_template_id) VALUES ($1,$2,$3,$4,$5) RETURNING *', [userId, b.name, b.description ?? '', b.niche ?? '', b.defaultTemplateId ?? null]); return catDto(r.rows[0], 0); },
  async listCatalogs(userId: string) { const r = await pool.query<{ id: string; owner_id: string; name: string; description: string; niche: string; default_template_id: string | null; created_at: Date; n: number }>('SELECT c.*, (SELECT count(*) FROM catalog_items i WHERE i.catalog_id=c.id)::int n FROM catalogs c WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 100', [userId]); return { items: r.rows.map((x) => catDto(x, x.n)) }; },
  async getCatalog(userId: string, id: string) { const c = await owns(userId, id); const items = (await pool.query<Row<'catalog_items'>>('SELECT * FROM catalog_items WHERE catalog_id=$1 ORDER BY sku LIMIT 1000', [id])).rows.map(itemDto); return { ...catDto(c, items.length), itemsList: items, summary: items.reduce<Record<string, number>>((a, i) => { a[i.status] = (a[i.status] ?? 0) + 1; return a; }, {}) }; },
  async deleteCatalog(userId: string, id: string) { await owns(userId, id); await pool.query('DELETE FROM catalogs WHERE id=$1', [id]); return { deleted: true }; },
  async importItems(userId: string, id: string, raw: RawItem[]) {
    await owns(userId, id); if (raw.length > MAX_ITEMS) throw unprocessable(`Máximo de ${MAX_ITEMS} produtos por importação`);
    const errors: { row: number; error: string }[] = []; let imported = 0; const seen = new Set<string>();
    for (let i = 0; i < raw.length; i++) { const r = raw[i]!; const name = sanitizeCell(String(r.name ?? '').trim().slice(0, 200)); if (!name) { errors.push({ row: i + 2, error: 'nome obrigatório' }); continue; }
      const price = parsePrice(r.price); if (price === null) { errors.push({ row: i + 2, error: 'preço inválido' }); continue; }
      const sku = sanitizeCell(String(r.sku ?? '').trim().slice(0, 60)) || `SKU-${String(i + 1).padStart(4, '0')}`; if (seen.has(sku)) { errors.push({ row: i + 2, error: `SKU duplicado no arquivo: ${sku}` }); continue; } seen.add(sku);
      const photos = (Array.isArray(r.photoUrls) ? r.photoUrls : String(r.photoUrls ?? '').split('|')).map((s) => String(s).trim()).filter(Boolean).slice(0, 6);
      await pool.query(`INSERT INTO catalog_items (catalog_id,name,description,price,category,sku,photo_urls) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (catalog_id,sku) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, price=EXCLUDED.price, category=EXCLUDED.category, photo_urls=EXCLUDED.photo_urls`,
        [id, name, sanitizeCell(String(r.description ?? '').slice(0, 2000)), price, sanitizeCell(String(r.category ?? '').slice(0, 60)), sku, photos]); imported++; }
    await audit(pool, userId, 'catalog.import', 'catalog', id, { imported, errors: errors.length }); return { imported, skipped: errors.length, errors: errors.slice(0, 50) };
  },
  async batchGenerate(userId: string, catalogId: string, o: { itemIds?: string[]; templateId?: string; locale?: string }) {
    const u = await requirePlan(userId); await generationOk(u); const c = await owns(userId, catalogId);
    const items = (await pool.query(`SELECT id FROM catalog_items WHERE catalog_id=$1 AND status IN ('pending','error') ${o.itemIds ? 'AND id = ANY($2::uuid[])' : ''}`, o.itemIds ? [catalogId, o.itemIds] : [catalogId])).rows.map((r) => r.id as string);
    if (!items.length) throw unprocessable('Nenhum item pendente para gerar'); if (await running(catalogId, 'generation')) throw new AppError(409, 'batch_running', 'Já existe um lote de geração em andamento neste catálogo');
    const b = (await pool.query<Row<'batch_jobs'>>(`INSERT INTO batch_jobs (owner_id,type,catalog_id,total_items,status,params) VALUES ($1,'generation',$2,$3,'queued',$4) RETURNING *`, [userId, catalogId, items.length, JSON.stringify({ itemIds: items, templateId: o.templateId ?? c.default_template_id, locale: o.locale ?? 'pt-BR' })])).rows[0];
    await enqueue(Q.batchGenerate, 'batch-generate', { batchId: b.id, userId }, { plan: u.plan, userId, jobId: `bg-${b.id}` }); return batchDto(b);
  },
  async batchPublish(userId: string, catalogId: string, o: { platforms: string[]; itemIds?: string[]; metadata?: Record<string, unknown> }) {
    const u = await requirePlan(userId); await owns(userId, catalogId);
    const items = (await pool.query(`SELECT id FROM catalog_items WHERE catalog_id=$1 AND status='ready' AND project_id IS NOT NULL ${o.itemIds ? 'AND id = ANY($2::uuid[])' : ''}`, o.itemIds ? [catalogId, o.itemIds] : [catalogId])).rows.map((r) => r.id as string);
    if (!items.length) throw unprocessable('Nenhum item pronto para publicar'); if (await running(catalogId, 'publication')) throw new AppError(409, 'batch_running', 'Já existe um lote de publicação em andamento');
    const b = (await pool.query<Row<'batch_jobs'>>(`INSERT INTO batch_jobs (owner_id,type,catalog_id,total_items,status,params) VALUES ($1,'publication',$2,$3,'queued',$4) RETURNING *`, [userId, catalogId, items.length, JSON.stringify({ itemIds: items, platforms: o.platforms, metadata: o.metadata ?? {} })])).rows[0];
    await enqueue(Q.batchPublish, 'batch-publish', { batchId: b.id, userId }, { plan: u.plan, userId, jobId: `bp-${b.id}` }); return batchDto(b);
  },
  async getBatch(userId: string, id: string) { const b = (await pool.query<Row<'batch_jobs'>>('SELECT * FROM batch_jobs WHERE id=$1 AND owner_id=$2', [id, userId])).rows[0]; if (!b) throw notFound(); return batchDto(b); },
  async listBatches(userId: string) { return { items: (await pool.query<Row<'batch_jobs'>>('SELECT * FROM batch_jobs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 50', [userId])).rows.map(batchDto) }; },
  async cancelBatch(userId: string, id: string) { const r = await pool.query<Row<'batch_jobs'>>(`UPDATE batch_jobs SET status='cancelled', finished_at=now() WHERE id=$1 AND owner_id=$2 AND status IN ('queued','running') RETURNING *`, [id, userId]); if (!r.rowCount) throw notFound('Lote não encontrado ou já finalizado'); return batchDto(r.rows[0]); },

  /** Worker batch-generate: cria um projeto por item e dispara o pipeline (storyboard→cenas encadeadas→montagem). Conclusão chega via hooks. */
  async processBatchGenerate(d: { batchId: string; userId: string }) {
    const b = (await pool.query<Row<'batch_jobs'>>(`UPDATE batch_jobs SET status='running' WHERE id=$1 AND status='queued' RETURNING *`, [d.batchId])).rows[0]; if (!b) return;
    const p = b.params as { itemIds: string[]; templateId?: string; locale: string };
    for (const itemId of p.itemIds) {
      if ((await pool.query<Pick<Row<'batch_jobs'>, 'status'>>('SELECT status FROM batch_jobs WHERE id=$1', [d.batchId])).rows.at(0)?.status === 'cancelled') return;
      const it = (await pool.query<Row<'catalog_items'>>('SELECT * FROM catalog_items WHERE id=$1', [itemId])).rows[0]; if (!it) continue;
      try {
        const photos = (it.photo_urls as string[]).filter((x) => x.startsWith(`uploads/${d.userId}/`));
        const script = [it.name, it.description, it.price > 0 ? `Por apenas R$ ${Number(it.price).toFixed(2).replace('.', ',')}` : ''].filter(Boolean).join('. ');
        const proj = await generationService.createProject(d.userId, { title: it.name.slice(0, 120), script, locale: p.locale, category: it.category || undefined, templateId: p.templateId ?? undefined, photos });
        await pool.query(`UPDATE catalog_items SET project_id=$2, status='generating', error=NULL WHERE id=$1`, [itemId, proj.id]);
        await generationService.requestStoryboard(d.userId, proj.id, { pipeline: true });
      } catch (e) { await pool.query(`UPDATE catalog_items SET status='error', error=$2 WHERE id=$1`, [itemId, (e as Error).message.slice(0, 300)]); await refreshGeneration(d.batchId); }
    }
    await refreshGeneration(d.batchId);
  },
  /** Worker batch-publish: cria publicações por item/plataforma; o resultado de cada uma chega via hook onPublicationDone. */
  async processBatchPublish(d: { batchId: string; userId: string }) {
    const b = (await pool.query<Row<'batch_jobs'>>(`UPDATE batch_jobs SET status='running' WHERE id=$1 AND status='queued' RETURNING *`, [d.batchId])).rows[0]; if (!b) return;
    const p = b.params as { itemIds: string[]; platforms: string[]; metadata: Record<string, unknown> };
    for (const itemId of p.itemIds) {
      const it = (await pool.query<Row<'catalog_items'>>('SELECT * FROM catalog_items WHERE id=$1', [itemId])).rows[0]; if (!it?.project_id) continue;
      try {
        const targets: Target[] = p.platforms.map((pl) => ({ platform: pl as Target['platform'], metadata: { title: it.name, caption: it.description, price: Number(it.price), ...p.metadata } as Target['metadata'] }));
        const r = await publicationService.create(d.userId, it.project_id, targets);
        await redis.set(`batch:pending:${d.batchId}:${itemId}`, String(r.publications.length), 'EX', 7 * 86400);
        for (const pub of r.publications) await redis.set(`batch:pub:${pub.id}`, `${d.batchId}:${itemId}`, 'EX', 7 * 86400);
      } catch (e) { await redis.sadd(`batch:fail:${d.batchId}`, itemId); logger.warn({ itemId, err: (e as Error).message }, 'item do lote não publicado'); await refreshPublication(d.batchId); }
    }
    await refreshPublication(d.batchId);
  },
  async createApiKey(userId: string, name: string, scopes: string[]) { const key = `nxr_${randomToken(30)}`; const r = await pool.query<{ id: string; created_at: Date }>('INSERT INTO api_keys (user_id,name,prefix,key_hash,scopes) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at', [userId, name, key.slice(0, 10), sha256(key), scopes]); await audit(pool, userId, 'apikey.create', 'api_key', r.rows[0].id); return { id: r.rows[0].id, name, scopes, key, createdAt: r.rows[0].created_at, note: 'Guarde a chave: ela não será exibida novamente.' }; },
  async listApiKeys(userId: string) { return { items: (await pool.query<Pick<Row<'api_keys'>, 'id' | 'name' | 'prefix' | 'scopes' | 'last_used_at' | 'created_at' | 'revoked_at'>>('SELECT id,name,prefix,scopes,last_used_at,created_at,revoked_at FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC', [userId])).rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes, lastUsedAt: r.last_used_at, createdAt: r.created_at, revoked: !!r.revoked_at })) }; },
  async revokeApiKey(userId: string, id: string) { const r = await pool.query('UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL', [id, userId]); if (!r.rowCount) throw notFound(); await audit(pool, userId, 'apikey.revoke', 'api_key', id); return { revoked: true }; },
};
async function generationOk(u: { deletion_scheduled_for?: unknown }) { if (u.deletion_scheduled_for) throw new AppError(423, "account_pending_deletion", "Conta com exclusão agendada"); }
const running = async (catalogId: string, type: string) => !!(await pool.query<{ "?column?": number | null }>(`SELECT 1 FROM batch_jobs WHERE catalog_id=$1 AND type=$2 AND status IN ('queued','running')`, [catalogId, type])).rowCount;

async function finish(batchId: string, completed: number, failed: number, total: number) {
  const done = completed + failed >= total; const status = !done ? 'running' : failed === 0 ? 'completed' : completed === 0 ? 'failed' : 'partial';
  await pool.query(`UPDATE batch_jobs SET completed_items=$2, failed_items=$3, status=CASE WHEN status='cancelled' THEN status ELSE $4 END, finished_at=CASE WHEN $5 AND status<>'cancelled' THEN now() ELSE finished_at END WHERE id=$1`, [batchId, completed, failed, status, done]);
}
/** Recalcula contadores a partir dos itens (idempotente, imune a hooks duplicados). */
async function refreshGeneration(batchId: string) {
  const b = (await pool.query<Row<'batch_jobs'>>('SELECT * FROM batch_jobs WHERE id=$1', [batchId])).rows[0]; if (!b) return; const ids = (b.params as { itemIds: string[] }).itemIds;
  const c = (await pool.query<{ ok: number; bad: number }>(`SELECT count(*) FILTER (WHERE status='ready')::int ok, count(*) FILTER (WHERE status='error')::int bad FROM catalog_items WHERE id = ANY($1::uuid[])`, [ids])).rows[0]; await finish(batchId, c.ok, c.bad, b.total_items);
}
async function refreshPublication(batchId: string) {
  const b = (await pool.query<Row<'batch_jobs'>>('SELECT * FROM batch_jobs WHERE id=$1', [batchId])).rows[0]; if (!b) return; const ids = (b.params as { itemIds: string[] }).itemIds;
  const ok = await redis.scard(`batch:ok:${batchId}`); const bad = await redis.scard(`batch:fail:${batchId}`); await finish(batchId, ok, bad, ids.length);
}
registerBatchHooks({
  async onProjectDone(projectId, ok, error) {
    const r = await pool.query<{ catalog_id: string; id: string }>(`UPDATE catalog_items SET status=$2, error=$3 WHERE project_id=$1 AND status='generating' RETURNING catalog_id, id`, [projectId, ok ? 'ready' : 'error', ok ? null : (error ?? 'falha').slice(0, 300)]); const row = r.rows[0]; if (!row) return;
    const b = (await pool.query<{ id: string }>(`SELECT id FROM batch_jobs WHERE catalog_id=$1 AND type='generation' AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1`, [row.catalog_id])).rows[0]; if (b) await refreshGeneration(b.id);
  },
  async onPublicationDone(pubId, ok) {
    const ref = await redis.get(`batch:pub:${pubId}`); if (!ref) return; const [batchId, itemId] = ref.split(':') as [string, string];
    if (!ok) await redis.sadd(`batch:fail:${batchId}`, itemId);
    const left = await redis.decr(`batch:pending:${batchId}:${itemId}`); await redis.del(`batch:pub:${pubId}`);
    if (left <= 0 && !(await redis.sismember(`batch:fail:${batchId}`, itemId))) await redis.sadd(`batch:ok:${batchId}`, itemId);
    await refreshPublication(batchId);
  },
});
