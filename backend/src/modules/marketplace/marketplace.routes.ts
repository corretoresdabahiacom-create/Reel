import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, optionalAuth, requireJwt, uid } from '../../middlewares/auth.js';
import { LIMITS, rateLimit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid, localeSchema } from '../../utils/validate.js';
import { marketplaceService } from './marketplace.service.js';


const scene = z.object({ title: z.string().max(100).optional(), durationSec: z.number().min(1).max(60), kind: z.string().max(40).optional(), hint: z.string().max(300).optional() }).passthrough();
const body = z.object({ name: z.string().trim().min(3).max(80), description: z.string().max(1000).optional(), category: z.string().max(40).optional(), tags: z.array(z.string().max(30)).max(10).optional(), priceCredits: z.number().int().min(0).max(500),
  sceneStructure: z.array(scene).min(1).max(12), promptHints: z.array(z.string().max(200)).max(10).optional(), voiceId: z.string().max(60).optional(), trackId: z.string().max(60).optional(), captionStyle: z.string().max(40).optional(), locale: localeSchema.optional() });
const list = z.object({ search: z.string().max(80).optional(), category: z.string().max(40).optional(), sort: z.enum(['popular', 'new', 'rating', 'price']).optional(), cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(50).default(20) });
export async function marketplaceRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate(), requireJwt] };
  const optionalUser = async (req: { headers: Record<string, unknown> }) => (await optionalAuth(req)) ?? undefined; // RLS: JWT válido → consulta como o usuário
  app.get('/templates', async (req) => marketplaceService.list(parse(list, req.query), await optionalUser(req)));
  app.get('/templates/mine', auth, async (req) => marketplaceService.mine(uid(req)));
  app.get('/templates/revenue', auth, async (req) => marketplaceService.revenue(uid(req)));
  app.get('/templates/:id', async (req) => marketplaceService.get(parse(uuid, (req.params as { id: string }).id), await optionalUser(req)));
  app.post('/templates', { preHandler: [authenticate(), requireJwt, rateLimit(LIMITS.write)] }, async (req, reply) => reply.status(201).send(await marketplaceService.create(uid(req), parse(body, req.body))));
  app.patch('/templates/:id', auth, async (req) => marketplaceService.update(uid(req), parse(uuid, (req.params as { id: string }).id), parse(body.partial(), req.body)));
  app.delete('/templates/:id', auth, async (req) => marketplaceService.remove(uid(req), parse(uuid, (req.params as { id: string }).id)));
  app.post('/templates/:id/purchase', { preHandler: [authenticate(), requireJwt, rateLimit(LIMITS.write), idempotent({ required: true })] }, async (req, reply) => reply.status(201).send(await marketplaceService.purchase(uid(req), parse(uuid, (req.params as { id: string }).id))));
  app.post('/templates/:id/reviews', auth, async (req) => { const b = parse(z.object({ stars: z.number().int().min(1).max(5), comment: z.string().max(500).default('') }), req.body); return marketplaceService.review(uid(req), parse(uuid, (req.params as { id: string }).id), b.stars, b.comment); });
}
