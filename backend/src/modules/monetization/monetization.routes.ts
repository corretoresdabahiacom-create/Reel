import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin, requireJwt, uid, optionalAuth } from '../../middlewares/auth.js';
import { rateLimit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { unauthorized } from '../../utils/errors.js';
import { verifyPixSignature } from '../payments/payments.service.js';
import { monetizationService, quoteBody, localBody } from './monetization.service.js';
import { paywallService, TRIGGERS } from './paywall.service.js';
import { requirePayments } from '../payments/messages.js';

export async function monetizationRoutes(app: FastifyInstance): Promise<void> {
  const user = { preHandler: [authenticate(), requireJwt, rateLimit({ scope: 'mon', limit: 120, windowSec: 60, by: 'user' })] }; const adm = { preHandler: [requireAdmin] };
  app.get('/pricing/regions', async () => monetizationService.regions());
  /** Preço regional (público; se houver token, usa país/região do perfil). */
  app.get('/pricing', { preHandler: [rateLimit({ scope: 'pricing', limit: 60, windowSec: 60, by: 'ip' })] }, async (req) => { const q = parse(z.object({ country: z.string().length(2).optional() }), req.query); const id: string | null = await optionalAuth(req); return monetizationService.pricing(id, q.country); });
  app.post('/billing/quote', user, async (req) => monetizationService.quote(uid(req), parse(quoteBody, req.body)));
  app.post('/billing/local-payment', { preHandler: [requirePayments, authenticate(), requireJwt, rateLimit({ scope: 'pay', limit: 20, windowSec: 60, by: 'user' }), idempotent({ required: true })] }, async (req, reply) => reply.status(201).send(await monetizationService.startLocalPayment(uid(req), parse(localBody, req.body))));
  app.post('/webhooks/local', { config: { rawBody: true }, preHandler: [requirePayments, rateLimit({ scope: 'wh_local', limit: 600, windowSec: 60, by: 'ip' })] }, async (req) => { const raw = (req as unknown as { rawBody: Buffer }).rawBody; if (!verifyPixSignature(raw, String(req.headers['x-signature'] ?? ''))) throw unauthorized('Assinatura inválida'); return monetizationService.ingestLocalWebhook(req.body as never); });
  app.post('/monetization/paywall/evaluate', user, async (req) => { const b = parse(z.object({ trigger: z.enum(TRIGGERS), peek: z.boolean().default(false) }), req.body); return paywallService.evaluate(uid(req), b.trigger, { peek: b.peek }); });
  app.get('/admin/monetization/summary', adm, async (req) => monetizationService.summary(parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query).days));
  app.patch('/admin/pricing/:region', adm, async (req) => monetizationService.setRegionPrices(uid(req), (req.params as { region: string }).region.toUpperCase(), parse(z.object({ planProPriceCents: z.number().int().min(1).optional(), planBusinessPriceCents: z.number().int().min(1).optional(), taxPct: z.number().min(0).max(40).optional(), active: z.boolean().optional() }), req.body)));
  app.post('/admin/creators/:id/verify', adm, async (req) => monetizationService.setCreatorVerified(uid(req), parse(uuid, (req.params as { id: string }).id), parse(z.object({ verified: z.boolean() }), req.body).verified));
}
