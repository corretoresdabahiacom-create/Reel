import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { LIMITS, rateLimit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid, platformSchema, localeSchema } from '../../utils/validate.js';
import { publicationService } from './publication.service.js';

const meta = z.object({ title: z.string().max(200).optional(), caption: z.string().max(2500).optional(), description: z.string().max(5000).optional(), hashtags: z.array(z.string().max(60)).max(30).optional(),
  privacy: z.enum(['public', 'friends', 'private']).optional(), visibility: z.enum(['public', 'unlisted', 'private']).optional(), category: z.string().max(60).optional(), listingId: z.string().max(60).optional(), price: z.number().min(0).max(1_000_000).optional(), collab: z.string().max(200).optional(), affiliate: z.boolean().optional() }).passthrough();
const body = z.object({ projectId: uuid, targets: z.array(z.object({ platform: platformSchema, locale: localeSchema.optional(), metadata: meta.default({}) })).min(1).max(7) });
export async function publicationRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate(), requireJwt] };
  app.post('/publications', { preHandler: [authenticate(), requireJwt, rateLimit(LIMITS.publish), idempotent()] }, async (req, reply) => { const b = parse(body, req.body); return reply.status(202).send(await publicationService.create(uid(req), b.projectId, b.targets)); });
  app.get('/publications', auth, async (req) => publicationService.list(uid(req), (req.query as { projectId?: string }).projectId));
  app.get('/publications/:id', auth, async (req) => publicationService.get(uid(req), parse(uuid, (req.params as { id: string }).id)));
  app.post('/publications/:id/retry', { preHandler: [authenticate(), requireJwt, rateLimit(LIMITS.publish)] }, async (req, reply) => reply.status(202).send(await publicationService.retry(uid(req), parse(uuid, (req.params as { id: string }).id))));
}
