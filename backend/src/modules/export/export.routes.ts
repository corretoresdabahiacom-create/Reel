import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { env } from '../../config/env.js';
import { storageExportService, saveBodySchema, batchBodySchema, DESTINATIONS } from './storageExportService.js';
import { cloudOAuth } from './cloudOAuth.js';
import { CLOUD_PROVIDERS, type CloudProviderId } from './cloudProviders.js';

const SAVE: Limit = { scope: 'save', limit: 60, windowSec: 3600, by: 'both' };        // R13: por usuário e por IP
const BATCH: Limit = { scope: 'save_batch', limit: 10, windowSec: 3600, by: 'both' };  // ZIP em lote é pesado
const CONNECT: Limit = { scope: 'cloud_connect', limit: 10, windowSec: 600, by: 'both' };
const CALLBACK: Limit = { scope: 'cloud_cb', limit: 20, windowSec: 600, by: 'ip' };
const providerSchema = z.enum(CLOUD_PROVIDERS);
const prm = (r: { params: unknown }) => r.params as Record<string, string>;

/**
 * Módulo 5 — Salvamento. Login + `ff_save` (senão 404), exceto:
 * - o callback OAuth (o navegador volta do provedor sem Authorization; a identidade vem do `state` no Redis);
 * - `DELETE /cloud/connections/:provider` (LGPD: revogar a qualquer momento, mesmo com a flag desligada).
 * Registrado antes de `projectsRoutes` (como o Módulo 4), para `/projects/:projectId/save` nunca virar `/projects/:id`.
 */
export async function exportRoutes(app: FastifyInstance): Promise<void> {
  const r = (...extra: unknown[]) => ({ preHandler: [authenticate(), requireJwt, ...extra] as never });
  app.get('/save/config', r(), async (req) => storageExportService.config(uid(req)));
  app.post('/projects/:projectId/save', r(rateLimit(SAVE), idempotent({ required: true })), async (req, reply) => {
    const out = await storageExportService.save(uid(req), parse(uuid, prm(req).projectId), parse(saveBodySchema, req.body));
    return reply.status(out.status === 'queued' ? 202 : 200).send(out);
  });
  app.get('/save/exports', r(), async (req) => storageExportService.list(uid(req), parse(z.object({ destination: z.enum(DESTINATIONS).optional() }), req.query).destination));
  app.get('/save/exports/:exportId', r(), async (req) => storageExportService.status(uid(req), parse(uuid, prm(req).exportId)));
  app.delete('/save/exports/:exportId', r(), async (req, reply) => { await storageExportService.remove(uid(req), parse(uuid, prm(req).exportId)); return reply.status(204).send(); });
  // B2B: aceita JWT ou API key com escopo catalogs:read (o dono do catálogo vem da chave)
  app.post('/catalogs/:catalogId/export', { preHandler: [authenticate('catalogs:read'), rateLimit(BATCH), idempotent({ required: true })] as never }, async (req, reply) =>
    reply.status(202).send(await storageExportService.batchExport(uid(req), parse(uuid, prm(req).catalogId), parse(batchBodySchema, req.body))));
  app.get('/save/batches/:batchId', { preHandler: [authenticate('catalogs:read')] as never }, async (req) => storageExportService.batch(uid(req), parse(uuid, prm(req).batchId)));

  app.get('/cloud/connections', r(), async (req) => cloudOAuth.list(uid(req)));
  app.post('/cloud/:provider/connect', r(rateLimit(CONNECT)), async (req) => cloudOAuth.connect(uid(req), parse(providerSchema, prm(req).provider) as CloudProviderId));
  app.get('/cloud/:provider/callback', { preHandler: [rateLimit(CALLBACK)] }, async (req, reply) => {
    const p = parse(providerSchema, prm(req).provider) as CloudProviderId; const res = await cloudOAuth.callback(p, req.query as Record<string, string>);
    if ((req.query as { format?: string }).format === 'json' || req.headers.accept?.includes('application/json')) return { connected: true, provider: res.provider };
    return reply.redirect(`${env.PUBLIC_APP_URL}/oauth/callback?cloud=${p}`, 302); // só o nome do provedor na URL
  });
  app.delete('/cloud/connections/:provider', r(), async (req) => cloudOAuth.revoke(uid(req), parse(providerSchema, prm(req).provider) as CloudProviderId));
}
