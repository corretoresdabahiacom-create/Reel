import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { elementInserter, elementBodySchema, requireElements } from './elementInserter.js';
import { personConsent } from './personConsent.js';

const L: Limit = { scope: 'el_insert', limit: 30, windowSec: 3600, by: 'both' };   // R13: por usuário e por IP
const LC: Limit = { scope: 'el_consent', limit: 10, windowSec: 3600, by: 'both' };
const p = (r: { params: unknown }) => r.params as { projectId: string; sceneId: string; consentId: string };

/**
 * Módulo 3 — Inserção de elementos. Login + `ff_elements` (senão 404). A inserção é assíncrona (fila `elements-insert`),
 * exige `Idempotency-Key` e cria uma NOVA versão da cena (versões e seletor: GET/PUT do Módulo 2).
 */
export async function elementsRoutes(app: FastifyInstance): Promise<void> {
  const r = (...extra: unknown[]) => ({ preHandler: [authenticate(), requireJwt, ...extra] as never });
  app.get('/elements/config', r(), async (req) => elementInserter.config(uid(req)));
  app.post('/projects/:projectId/scenes/:sceneId/elements', r(rateLimit(L), idempotent({ required: true })), async (req, reply) =>
    reply.status(202).send(await elementInserter.request(uid(req), parse(uuid, p(req).projectId), parse(uuid, p(req).sceneId), parse(elementBodySchema, req.body))));
  app.get('/projects/:projectId/scenes/:sceneId/elements', r(), async (req) => elementInserter.list(uid(req), parse(uuid, p(req).projectId), parse(uuid, p(req).sceneId)));
  // Consentimento person_image: frase única + upload opcional + timestamp
  app.get('/elements/person-consents', r(), async (req) => { await requireElements(uid(req)); return { items: await personConsent.list(uid(req)) }; });
  app.post('/elements/person-consents', r(rateLimit(LC), idempotent({ required: true })), async (req, reply) => { const u = await requireElements(uid(req));
    return reply.status(201).send(await personConsent.request(uid(req), { ip: req.ip, userAgent: String(req.headers['user-agent'] ?? ''), locale: u.locale })); });
  app.post('/elements/person-consents/:consentId/confirm', r(rateLimit(LC)), async (req) => { await requireElements(uid(req));
    return personConsent.confirm(uid(req), parse(uuid, p(req).consentId), parse(z.object({ phrase: z.string().min(10).max(400), evidenceRef: z.string().max(300).optional() }).strict(), req.body)); });
  app.delete('/elements/person-consents/:consentId', r(rateLimit(LC)), async (req) => { await requireElements(uid(req)); return personConsent.revoke(uid(req), parse(uuid, p(req).consentId)); });
}
