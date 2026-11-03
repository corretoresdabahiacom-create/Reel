import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { LIMITS, rateLimit } from '../../middlewares/rateLimit.js';
import { parse, platformSchema } from '../../utils/validate.js';
import { integrationsService } from './integrations.service.js';
import { env } from '../../config/env.js';
import { INTEGRATIONS } from '../../integrations/index.js';
import { pool } from '../../db/pool.js';
import { badRequest, notFound, unauthorized } from '../../utils/errors.js';
import { safeEqual } from '../../utils/crypto.js';
import { enqueue, Q } from '../../queues/index.js';

export async function integrationsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate(), requireJwt] };
  app.get('/integrations', auth, async (req) => integrationsService.list(uid(req)));
  app.post('/integrations/:platform/connect', auth, async (req) => integrationsService.connect(uid(req), parse(platformSchema, (req.params as { platform: string }).platform), parse(z.object({ shopId: z.string().max(40).optional() }).default({}), req.body ?? {})));
  // Callback do provedor (navegador sem Authorization): identidade vem do `state` guardado no Redis. A troca code→token é 100% server-side.
  app.get('/integrations/:platform/callback', { preHandler: [rateLimit(LIMITS.auth)] }, async (req, reply) => {
    const platform = parse(platformSchema, (req.params as { platform: string }).platform); const r = await integrationsService.callback(platform, req.query as Record<string, string>);
    if ((req.query as { format?: string }).format === 'json' || req.headers.accept?.includes('application/json')) return { connected: true, platform: r.platform, handle: r.handle };
    return reply.redirect(`${env.PUBLIC_APP_URL}/oauth/callback?connected=${platform}`, 302);
  });
  app.delete('/integrations/:platform', auth, async (req, reply) => { await integrationsService.disconnect(uid(req), parse(platformSchema, (req.params as { platform: string }).platform)); return reply.status(204).send(); });

  // Webhooks de plataformas (quando suportado): assinatura validada sobre o corpo CRU; idempotência por event_id.
  app.get('/integrations/instagram/webhook', async (req, reply) => { const q = req.query as Record<string, string>; if (q['hub.mode'] === 'subscribe' && !!env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN && safeEqual(String(q['hub.verify_token'] ?? ''), env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN)) return reply.type('text/plain').send(q['hub.challenge']); throw unauthorized(); });
  app.post('/integrations/:platform/webhook', { config: { rawBody: true }, preHandler: [rateLimit({ scope: 'webhook', limit: 300, windowSec: 60, by: 'ip' })] }, async (req, reply) => {
    const platform = parse(platformSchema, (req.params as { platform: string }).platform); const w = INTEGRATIONS[platform].webhooks; if (!w) throw notFound('Esta plataforma não envia webhooks');
    const raw = (req as unknown as { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {})); if (!w.verify(req.headers, raw)) throw unauthorized('Assinatura inválida');
    const ev = w.parse(req.body); if (!ev) throw badRequest('Evento não reconhecido');
    const ins = await pool.query<{ id: string }>(`INSERT INTO webhook_events (provider, event_id, event_type, payload) VALUES ($1,$2,$3,$4) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`, [platform, ev.eventId, ev.type, JSON.stringify(req.body)]);
    if (ins.rowCount) await enqueue(Q.whAffiliates, 'platform-event', { webhookId: ins.rows[0].id, platform, ...ev }, { jobId: `whp-${platform}-${ev.eventId.replace(/[:]/g, '_')}` });
    return reply.status(200).send({ received: true, duplicate: !ins.rowCount });
  });
}
