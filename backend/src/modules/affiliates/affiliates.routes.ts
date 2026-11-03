import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { LIMITS, rateLimit } from '../../middlewares/rateLimit.js';
import { parse, uuid } from '../../utils/validate.js';
import { affiliatesService } from './affiliates.service.js';
import { hmacHex, safeEqual } from '../../utils/crypto.js';
import { unauthorized, notFound } from '../../utils/errors.js';
import { pool } from '../../db/pool.js';
import { enqueue, Q } from '../../queues/index.js';
import { camel } from '../../utils/case.js';
import type { FastifyRequest as FReq, FastifyReply as FRep } from 'fastify';
import type { Row } from '../../db/rows.generated.js';
/** P0-1 etapa 2: rotas que devolviam linhas cruas do Postgres saem em camelCase (contrato único da API). */
const cam = <R>(h: (req: FReq, reply: FRep) => Promise<R>) => async (req: FReq, reply: FRep) => camel(await h(req, reply));

export async function affiliatesRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate(), requireJwt] };
  app.get('/affiliates/accounts', auth, async (req) => affiliatesService.accounts(uid(req)));
  app.post('/affiliates/accounts', auth, async (req, reply) => { const b = parse(z.object({ platform: z.enum(['shopee', 'mercadolivre']), externalUserId: z.string().min(1).max(100), token: z.string().min(1).max(500) }), req.body); return reply.status(201).send(await affiliatesService.connectAccount(uid(req), b.platform, b.externalUserId, b.token)); });
  app.get('/affiliates/links', auth, async (req) => affiliatesService.links(uid(req)));
  app.post('/affiliates/links', auth, async (req, reply) => { const b = parse(z.object({ platform: z.enum(['shopee', 'mercadolivre']), originalUrl: z.string().url().max(2000), priceCents: z.number().int().min(0).max(100_000_000).optional(), publicationId: uuid.optional() }), req.body); return reply.status(201).send(await affiliatesService.createLink(uid(req), b)); });
  app.get('/affiliates/earnings', auth, cam(async (req) => affiliatesService.earnings(uid(req))));
  app.get('/affiliates/links/:id/stats', auth, cam(async (req) => { const id = parse(uuid, (req.params as { id: string }).id); const l = (await pool.query<Pick<Row<'affiliate_links'>, 'id' | 'clicks' | 'conversions' | 'commission_cents'>>('SELECT id, clicks, conversions, commission_cents FROM affiliate_links WHERE id=$1 AND user_id=$2', [id, uid(req)])).rows[0]; if (!l) throw notFound(); const daily = (await pool.query<{ d: Date | null; c: number }>(`SELECT date_trunc('day', created_at)::date d, count(*)::int c FROM affiliate_clicks WHERE link_id=$1 AND created_at > now()-interval '14 days' GROUP BY 1 ORDER BY 1`, [id])).rows; return { ...l, daily }; }));
  // Webhook de conversão (rede de afiliados → NexusReel). HMAC-SHA256 do corpo cru no header x-nexus-signature; idempotente por (linkId, orderId).
  app.post('/webhooks/affiliates/conversion', { config: { rawBody: true }, preHandler: [rateLimit({ scope: 'wh_conv', limit: 600, windowSec: 60, by: 'ip' })] }, async (req, reply) => {
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body)); const sig = String(req.headers['x-nexus-signature'] ?? '');
    if (!sig || !safeEqual(hmacHex(env.AFFILIATE_WEBHOOK_SECRET, raw), sig)) throw unauthorized('Assinatura inválida');
    const b = parse(z.object({ linkId: uuid, orderId: z.string().min(1).max(100), amountCents: z.number().int().min(1).max(1_000_000_000) }), req.body);
    await enqueue(Q.whAffiliates, 'conversion', b, { jobId: `conv-${b.linkId}-${b.orderId}`.replace(/:/g, '_') }); return reply.status(202).send({ accepted: true });
  });
}
/** Rota pública de redirecionamento (fora de /api/v1): `GET /r/:linkId` → 302. Zero escrita síncrona no banco. */
export async function redirectRoutes(app: FastifyInstance): Promise<void> {
  app.get('/r/:linkId', { preHandler: [rateLimit(LIMITS.redirect)] }, async (req, reply) => {
    const id = (req.params as { linkId: string }).linkId; if (!uuid.safeParse(id).success) return reply.status(404).send({ code: 'not_found', message: 'Link inválido' });
    const url = await affiliatesService.resolve(id); if (!url) return reply.status(404).send({ code: 'not_found', message: 'Link não encontrado' });
    void affiliatesService.recordClick(id, req.ip, req.headers['user-agent']).catch(() => undefined);
    return reply.header('cache-control', 'no-store').redirect(url, 302);
  });
}
