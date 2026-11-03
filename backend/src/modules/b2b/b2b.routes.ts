import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { LIMITS, rateLimit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid, platformSchema } from '../../utils/validate.js';
import { b2bService, itemsFromCsv, API_SCOPES, type RawItem } from './b2b.service.js';
import { unprocessable } from '../../utils/errors.js';

const item = z.object({ sku: z.string().max(60).optional(), name: z.string().max(200), description: z.string().max(2000).optional(), price: z.union([z.number(), z.string().max(20)]).optional(), category: z.string().max(60).optional(), photoUrls: z.union([z.array(z.string().max(500)).max(6), z.string().max(3000)]).optional() });
export async function b2bRoutes(app: FastifyInstance): Promise<void> {
  const read = { preHandler: [authenticate('catalogs:read')] }; const gen = { preHandler: [authenticate('catalogs:generate'), rateLimit(LIMITS.write), idempotent()] }; const pub = { preHandler: [authenticate('catalogs:publish'), rateLimit(LIMITS.write), idempotent()] };
  const jwt = { preHandler: [authenticate(), requireJwt] }; const id = (req: { params: unknown }) => parse(uuid, (req.params as { id: string }).id);
  app.get('/catalogs', read, async (req) => b2bService.listCatalogs(uid(req)));
  app.post('/catalogs', { preHandler: [authenticate('catalogs:generate'), rateLimit(LIMITS.write)] }, async (req, reply) => reply.status(201).send(await b2bService.createCatalog(uid(req), parse(z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(500).optional(), niche: z.string().max(60).optional(), defaultTemplateId: uuid.optional() }), req.body))));
  app.get('/catalogs/:id', read, async (req) => b2bService.getCatalog(uid(req), id(req)));
  app.delete('/catalogs/:id', jwt, async (req) => b2bService.deleteCatalog(uid(req), id(req)));
  /** Importação: JSON `{items:[…]}` ou CSV (`text/csv` ou `{csv:"…"}`). Colunas: sku,name,description,price,category,photo_urls (separadas por `|`). */
  app.post('/catalogs/:id/items', { preHandler: [authenticate('catalogs:generate'), rateLimit(LIMITS.write)], bodyLimit: 2_000_000 }, async (req, reply) => {
    let items: RawItem[]; const b = req.body;
    if (typeof b === 'string') items = itemsFromCsv(b); else { const p = parse(z.object({ items: z.array(item).max(500).optional(), csv: z.string().max(1_500_000).optional() }), b); if (p.csv) items = itemsFromCsv(p.csv); else if (p.items) items = p.items; else throw unprocessable('Envie "items" ou "csv"'); }
    return reply.status(201).send(await b2bService.importItems(uid(req), id(req), items));
  });
  app.post('/catalogs/:id/batch-generate', gen, async (req, reply) => reply.status(202).send(await b2bService.batchGenerate(uid(req), id(req), parse(z.object({ itemIds: z.array(uuid).max(500).optional(), templateId: uuid.optional(), locale: z.enum(['pt-BR', 'en', 'es']).optional() }), req.body ?? {}))));
  app.post('/catalogs/:id/batch-publish', pub, async (req, reply) => reply.status(202).send(await b2bService.batchPublish(uid(req), id(req), parse(z.object({ platforms: z.array(platformSchema).min(1).max(7), itemIds: z.array(uuid).max(500).optional(), metadata: z.record(z.unknown()).optional() }), req.body))));
  app.get('/batch-jobs', read, async (req) => b2bService.listBatches(uid(req)));
  app.get('/batch-jobs/:id', read, async (req) => b2bService.getBatch(uid(req), id(req)));
  app.post('/batch-jobs/:id/cancel', jwt, async (req) => b2bService.cancelBatch(uid(req), id(req)));
  app.get('/api-keys', jwt, async (req) => b2bService.listApiKeys(uid(req)));
  app.post('/api-keys', jwt, async (req, reply) => reply.status(201).send(await b2bService.createApiKey(uid(req), ...(([b]) => [b.name, b.scopes] as [string, string[]])([parse(z.object({ name: z.string().trim().min(1).max(60), scopes: z.array(z.enum(API_SCOPES)).min(1).default(['catalogs:read', 'catalogs:generate']) }), req.body)]))));
  app.delete('/api-keys/:id', jwt, async (req) => b2bService.revokeApiKey(uid(req), id(req)));
}
