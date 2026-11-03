import type { BatchJob, Catalog, CatalogItem, Settings } from '../../types/phase4';
import type { ParsedItem } from './csvParser';

/** Repositório plugável. Em produção: Postgres (+ fila BullMQ/Redis para os lotes). Aqui: memória. */
export interface B2BDb { catalogs: Catalog[]; items: CatalogItem[]; batches: BatchJob[]; generatedThisMonth: Record<string, number> }
export const memoryB2B = (): B2BDb => ({ catalogs: [], items: [], batches: [], generatedThisMonth: {} });
const id = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();

export function createCatalog(db: B2BDb, ownerId: string, p: { name: string; description: string; niche: string; defaultTemplateId?: string }): Catalog {
  const c: Catalog = { id: id(), ownerId, ...p, itemCount: 0, status: 'draft', createdAt: now(), updatedAt: now() };
  db.catalogs.push(c); return c;
}
export function uploadCatalogItems(db: B2BDb, catalogId: string, parsed: ParsedItem[]): CatalogItem[] {
  const c = db.catalogs.find((x) => x.id === catalogId); if (!c) throw new Error('Catálogo não encontrado.');
  const items = parsed.map<CatalogItem>((p) => ({ id: id(), catalogId, ...p, status: 'pending' }));
  db.items.push(...items); c.itemCount += items.length; c.updatedAt = now(); return items;
}
/** Cria o lote de geração respeitando o limite mensal do plano. O processamento real vai para a fila (BullMQ). */
export function generateBatch(db: B2BDb, ownerId: string, plan: 'free' | 'pro' | 'business', st: Settings, catalogId: string, itemIds?: string[]): BatchJob {
  const targets = db.items.filter((i) => i.catalogId === catalogId && i.status !== 'ready' && (!itemIds || itemIds.includes(i.id)));
  const used = db.generatedThisMonth[ownerId] ?? 0;
  if (used + targets.length > st.planLimits[plan]) throw new Error(`Limite do plano excedido (${used + targets.length}/${st.planLimits[plan]} vídeos no mês).`);
  const b: BatchJob = { id: id(), type: 'generation', catalogId, totalItems: targets.length, completedItems: 0, failedItems: 0, status: 'queued', createdAt: now() };
  db.batches.push(b); return b; // TODO: enfileirar no BullMQ (queue.add('generate', { batchId, itemIds }))
}
export function publishBatch(db: B2BDb, catalogId: string, itemIds: string[], platforms: string[]): BatchJob {
  const ready = db.items.filter((i) => itemIds.includes(i.id) && i.status === 'ready');
  const b: BatchJob = { id: id(), type: 'publication', catalogId, totalItems: ready.length * platforms.length, completedItems: 0, failedItems: 0, status: 'queued', createdAt: now() };
  db.batches.push(b); return b; // TODO: um job por item×plataforma reutilizando publish() da Fase 3 (falha isolada)
}
export function getBatchStatus(db: B2BDb, batchId: string): BatchJob & { percent: number } {
  const b = db.batches.find((x) => x.id === batchId); if (!b) throw new Error('Lote não encontrado.');
  return { ...b, percent: b.totalItems ? Math.round(((b.completedItems + b.failedItems) / b.totalItems) * 100) : 100 };
}
