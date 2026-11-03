import type { FastifyInstance } from 'fastify';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, LIMITS, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { backgroundService, editBodySchema } from './backgroundService.js';
import { externalConsent } from './externalConsent.js';

const L: Limit = { scope: 'bg_edit', limit: 30, windowSec: 3600, by: 'both' }; // R13: por usuário e por IP
const p = (r: { params: unknown }) => r.params as { projectId: string; sceneId: string };

/**
 * Módulo 2 — Edição de fundo. Login + `ff_background` ligada (senão 404). A edição é assíncrona (fila `background-edit`)
 * e exige `Idempotency-Key` (R12). Rotas no padrão `/projects/:projectId/scenes/:sceneId/...` pedido no Checkpoint 2.
 */
export async function backgroundRoutes(app: FastifyInstance): Promise<void> {
  const r = (...extra: unknown[]) => ({ preHandler: [authenticate(), requireJwt, ...extra] as never });
  app.get('/background/config', r(), async (req) => backgroundService.config(uid(req)));
  app.patch('/projects/:projectId/scenes/:sceneId/background', r(rateLimit(L), idempotent({ required: true })), async (req, reply) =>
    reply.status(202).send(await backgroundService.edit(uid(req), parse(uuid, p(req).projectId), parse(uuid, p(req).sceneId), parse(editBodySchema, req.body))));
  app.get('/projects/:projectId/scenes/:sceneId/versions', r(), async (req) => backgroundService.versions(uid(req), parse(uuid, p(req).projectId), parse(uuid, p(req).sceneId)));
  // PUT: escolher a versão em uso é idempotente por definição (repetir dá o mesmo estado)
  app.put('/projects/:projectId/scenes/:sceneId/current', r(rateLimit(LIMITS.write)), async (req) => backgroundService.select(uid(req), parse(uuid, p(req).projectId), parse(uuid, p(req).sceneId)));
  // Consentimento para enviar mídia a provedor externo (R6). Usado quando algum módulo pós-lançamento usar provedor real.
  app.get('/consents/external-provider', r(), async (req) => externalConsent.status(uid(req)));
  app.post('/consents/external-provider', r(rateLimit(LIMITS.write), idempotent({ required: true })), async (req, reply) => reply.status(201).send(await externalConsent.grant(uid(req), { ip: req.ip, userAgent: String(req.headers['user-agent'] ?? '') })));
  app.delete('/consents/external-provider', r(rateLimit(LIMITS.write)), async (req) => externalConsent.revoke(uid(req)));
}
