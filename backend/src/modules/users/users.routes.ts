import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { LIMITS, rateLimit } from '../../middlewares/rateLimit.js';
import { parse, localeSchema, uuid } from '../../utils/validate.js';
import { pool } from '../../db/pool.js';
import { usersRepo, userDto } from './users.repository.js';
import { complianceService } from '../compliance/compliance.service.js';
import { notFound } from '../../utils/errors.js';

const patch = z.object({ name: z.string().trim().min(1).max(80).optional(), locale: localeSchema.optional(), region: z.enum(['LATAM', 'EU', 'US']).optional() }).strict();
const consentBody = z.object({ items: z.array(z.object({ type: z.enum(['cookies', 'ai', 'marketing', 'terms']), accepted: z.boolean(), version: z.string().max(20).optional() })).min(1).max(8) });
export async function usersRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate(), requireJwt] };
  app.get('/users/me', auth, async (req) => { const u = await usersRepo.byId(pool, uid(req)); if (!u) throw notFound(); return userDto(u); });
  app.patch('/users/me', auth, async (req) => userDto(await usersRepo.update(pool, uid(req), parse(patch, req.body))));
  app.post('/users/me/consents', auth, async (req, reply) => reply.status(201).send(await complianceService.recordConsents(uid(req), parse(consentBody, req.body).items, req.ip, String(req.headers['user-agent'] ?? ''))));
  app.get('/users/me/consents', auth, async (req) => complianceService.consents(uid(req)));
  app.post('/users/me/export', { preHandler: [authenticate(), requireJwt, rateLimit(LIMITS.export)] }, async (req, reply) => reply.status(202).send(await complianceService.requestExport(uid(req))));
  app.get('/users/me/export/:id', auth, async (req) => complianceService.getExport(uid(req), parse(uuid, (req.params as { id: string }).id)));
  app.post('/users/me/deletion', auth, async (req, reply) => reply.status(202).send(await complianceService.requestDeletion(uid(req))));
  app.delete('/users/me/deletion', auth, async (req) => complianceService.cancelDeletion(uid(req)));
}
