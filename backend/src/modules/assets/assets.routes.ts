import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { derivedAssetsService, assetBodySchema } from './derivedAssetsService.js';

const L: Limit = { scope: 'assets', limit: 30, windowSec: 3600, by: 'both' }; // R13: por usuário e por IP (conversões pesadas)
const prm = (r: { params: unknown }) => r.params as Record<string, string>;

/** Módulo 6 — Assets derivados. Login + `ff_assets` (senão 404). Registrado antes de `projectsRoutes` (como os Módulos 4 e 5). */
export async function assetsRoutes(app: FastifyInstance): Promise<void> {
  const r = (...extra: unknown[]) => ({ preHandler: [authenticate(), requireJwt, ...extra] as never });
  app.get('/assets/profiles', r(), async (req) => derivedAssetsService.profiles(uid(req)));
  app.post('/projects/:projectId/assets', r(rateLimit(L), idempotent({ required: true })), async (req, reply) =>
    reply.status(202).send(await derivedAssetsService.request(uid(req), parse(uuid, prm(req).projectId), parse(assetBodySchema, req.body))));
  app.get('/assets', r(), async (req) => derivedAssetsService.list(uid(req), parse(z.object({ projectId: z.string().uuid().optional() }), req.query).projectId));
  app.get('/assets/:assetId', r(), async (req) => derivedAssetsService.status(uid(req), parse(uuid, prm(req).assetId)));
}
