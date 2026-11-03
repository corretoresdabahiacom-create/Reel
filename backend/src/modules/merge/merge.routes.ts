import type { FastifyInstance } from 'fastify';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { mergeService, mergeBodySchema } from './mergeService.js';

const L: Limit = { scope: 'merge', limit: 10, windowSec: 3600, by: 'both' }; // R13: por usuário e por IP (render pesado)
const p = (r: { params: unknown }) => r.params as { projectId: string; mergeId: string };

/**
 * Módulo 4 — União de vídeos. Login + `ff_merge` (senão 404).
 * ORDEM DE REGISTRO: este plugin é registrado em app.ts ANTES de `projectsRoutes` (GET/PATCH/DELETE /projects/:id),
 * para que "merge" nunca seja lido como `:id`. O roteador (radix tree do find-my-way) já separa `/projects/:id` de
 * `/projects/:projectId/merge` pelo número de segmentos, e o teste 26 prova as duas coisas: a rota de união responde e
 * `GET /projects/merge` cai em `/projects/:id` com 400 (id inválido), sem nunca acionar a união.
 */
export async function mergeRoutes(app: FastifyInstance): Promise<void> {
  const r = (...extra: unknown[]) => ({ preHandler: [authenticate(), requireJwt, ...extra] as never });
  app.post('/projects/:projectId/merge', r(rateLimit(L), idempotent({ required: true })), async (req, reply) =>
    reply.status(202).send(await mergeService.request(uid(req), parse(uuid, p(req).projectId), parse(mergeBodySchema, req.body))));
  app.get('/projects/:projectId/merge/:mergeId', r(), async (req) => mergeService.status(uid(req), parse(uuid, p(req).projectId), parse(uuid, p(req).mergeId)));
  app.get('/merges', r(), async (req) => mergeService.list(uid(req)));
  app.get('/merges/config', r(), async (req) => mergeService.config(uid(req)));
}
