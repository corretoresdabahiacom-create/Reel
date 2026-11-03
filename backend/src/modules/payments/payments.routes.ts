import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { LIMITS, rateLimit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse } from '../../utils/validate.js';
import { unauthorized } from '../../utils/errors.js';
import { paymentsService, verifyStripeSignature, verifyPixSignature } from './payments.service.js';
import { requirePayments } from './messages.js';

export async function paymentsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate(), requireJwt] };
  const pay = { preHandler: [requirePayments, authenticate(), requireJwt, rateLimit(LIMITS.write), idempotent({ required: true })] };
  app.get('/billing/catalog', async () => paymentsService.catalog());
  app.post('/billing/checkout/subscription', pay, async (req, reply) => { const b = parse(z.object({ plan: z.enum(['pro', 'business']), priceKey: z.enum(['pro', 'pro_low', 'pro_high']).optional() }), req.body); return reply.status(201).send(await paymentsService.checkoutSubscription(uid(req), b.plan, b.priceKey)); });
  app.post('/billing/checkout/credits', pay, async (req, reply) => reply.status(201).send(await paymentsService.checkoutCredits(uid(req), parse(z.object({ packId: z.string() }), req.body).packId)));
  app.post('/billing/pix', pay, async (req, reply) => reply.status(201).send(await paymentsService.createPix(uid(req), parse(z.object({ packId: z.string() }), req.body).packId)));
  app.get('/billing/transactions', auth, async (req) => paymentsService.transactions(uid(req)));
  app.post('/payouts', pay, async (req, reply) => { const b = parse(z.object({ source: z.enum(['affiliate', 'marketplace']), amountCents: z.number().int().min(1).max(100_000_000) }), req.body); return reply.status(201).send(await paymentsService.requestPayout(uid(req), b.source, b.amountCents)); });
  app.get('/payouts', auth, async (req) => paymentsService.payouts(uid(req)));
  const raw = (req: unknown) => (req as { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);
  app.post('/webhooks/stripe', { config: { rawBody: true }, preHandler: [requirePayments, rateLimit({ scope: 'wh_stripe', limit: 600, windowSec: 60, by: 'ip' })] }, async (req) => { if (!verifyStripeSignature(raw(req), String(req.headers['stripe-signature'] ?? ''))) throw unauthorized('Assinatura inválida'); return paymentsService.ingestWebhook('stripe', raw(req), req.body); });
  app.post('/webhooks/pix', { config: { rawBody: true }, preHandler: [requirePayments, rateLimit({ scope: 'wh_pix', limit: 600, windowSec: 60, by: 'ip' })] }, async (req) => { if (!verifyPixSignature(raw(req), String(req.headers['x-signature'] ?? ''))) throw unauthorized('Assinatura inválida'); return paymentsService.ingestWebhook('pix', raw(req), req.body); });
}
