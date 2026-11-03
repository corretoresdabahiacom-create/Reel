import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit } from '../../middlewares/rateLimit.js';
import { parse, platformSchema } from '../../utils/validate.js';
import { recommendationsService, eventsBody } from './recommendations.service.js';

const goal = z.enum(['sell', 'audience', 'test_ai']);
export async function recommendationsRoutes(app: FastifyInstance): Promise<void> {
  const user = { preHandler: [authenticate(), requireJwt, rateLimit({ scope: 'rec', limit: 120, windowSec: 60, by: 'user' })] };
  app.get('/recommendations/templates', user, async (req) => { const q = parse(z.object({ limit: z.coerce.number().int().min(1).max(30).default(10), category: z.string().max(40).optional(), surface: z.string().max(40).default('templates') }), req.query); return recommendationsService.templates(uid(req), q); });
  app.get('/recommendations/prompts', user, async (req) => { const q = parse(z.object({ category: z.string().max(40).optional(), objective: goal.optional(), locale: z.enum(['pt-BR', 'en', 'es']).optional(), limit: z.coerce.number().int().min(1).max(10).optional() }), req.query); return recommendationsService.prompts(uid(req), q); });
  app.get('/recommendations/publish-time', user, async (req) => recommendationsService.publishTime(uid(req), parse(z.object({ platform: platformSchema }), req.query).platform));
  app.get('/recommendations/platforms', user, async (req) => { const q = parse(z.object({ category: z.string().max(40).optional(), goal: goal.optional() }), req.query); return recommendationsService.platforms(uid(req), q); });
  app.get('/recommendations/photo-ideas', user, async (req) => { const q = parse(z.object({ category: z.string().max(40).optional(), locale: z.enum(['pt-BR', 'en', 'es']).optional(), limit: z.coerce.number().int().min(1).max(10).optional() }), req.query); return recommendationsService.photoIdeas(uid(req), q); });
  /** Feedback loop: impression | click | use | purchase (lote; fire-and-forget no client). */
  app.post('/recommendations/events', user, async (req, reply) => reply.status(202).send(await recommendationsService.recordEvents(uid(req), parse(eventsBody, req.body).events)));
  app.get('/admin/recommendations/metrics', { preHandler: [requireAdmin] }, async (req) => recommendationsService.metrics(parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query).days));
}
