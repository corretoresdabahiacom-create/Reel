import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit } from '../../middlewares/rateLimit.js';
import { parse, uuid } from '../../utils/validate.js';
import { lifecycleService, notificationsService } from './lifecycle.service.js';
import { retentionService } from './retention.service.js';
import { growthService, onboardingBody } from '../growth/growth.service.js';

export async function retentionRoutes(app: FastifyInstance): Promise<void> {
  const user = { preHandler: [authenticate(), requireJwt] }; const adm = { preHandler: [requireAdmin, rateLimit({ scope: 'admin', limit: 300, windowSec: 60, by: 'user' })] };
  // Notificações e preferências (opt-out obrigatório)
  app.get('/notifications', user, async (req) => { const q = parse(z.object({ channel: z.enum(['push', 'email', 'in_app']).optional(), limit: z.coerce.number().int().min(1).max(100).default(30) }), req.query); return notificationsService.list(uid(req), q.channel, q.limit); });
  app.post('/notifications/:id/action', user, async (req) => notificationsService.action(uid(req), parse(uuid, (req.params as { id: string }).id), parse(z.object({ action: z.enum(['read', 'clicked', 'dismissed']) }), req.body).action));
  app.get('/notifications/preferences', user, async (req) => notificationsService.prefs(uid(req)));
  app.put('/notifications/preferences', user, async (req) => notificationsService.setPrefs(uid(req), parse(z.object({ push: z.boolean().optional(), email: z.boolean().optional(), inApp: z.boolean().optional(), quietStart: z.number().int().min(0).max(23).optional(), quietEnd: z.number().int().min(0).max(23).optional(), preferredHour: z.number().int().min(0).max(23).nullable().optional(), unsubscribedAll: z.boolean().optional() }).strict(), req.body)));
  const unsub = { preHandler: [rateLimit({ scope: 'unsub', limit: 30, windowSec: 60, by: 'ip' })] }; const tok = (req: { query: unknown }) => parse(z.object({ t: z.string().min(40).max(120) }), req.query).t;
  app.get('/notifications/unsubscribe', unsub, async (req) => notificationsService.unsubscribe(tok(req)));
  app.post('/notifications/unsubscribe', unsub, async (req) => notificationsService.unsubscribe(tok(req))); // RFC 8058 one-click
  // Onboarding adaptativo
  app.get('/onboarding/plan', user, async (req) => growthService.onboardingPlan(uid(req)));
  app.put('/users/me/onboarding', user, async (req) => growthService.saveOnboarding(uid(req), parse(onboardingBody, req.body)));
  // Admin
  app.get('/admin/lifecycle/campaigns', adm, async () => ({ items: await lifecycleService.campaigns() }));
  app.patch('/admin/lifecycle/campaigns/:key', adm, async (req) => lifecycleService.patchCampaign((req.params as { key: string }).key, parse(z.object({ active: z.boolean().optional(), cooldownDays: z.number().int().min(1).max(365).optional() }), req.body)));
  app.post('/admin/lifecycle/run', adm, async (req) => { const b = parse(z.object({ dryRun: z.boolean().default(false), only: z.array(z.string()).optional() }).default({}), req.body ?? {}); return { runs: await lifecycleService.run({ dryRun: b.dryRun, only: b.only }) }; });
  app.get('/admin/lifecycle/stats', adm, async () => ({ items: await lifecycleService.stats() }));
  app.post('/admin/retention/scores/refresh', adm, async (req) => { const r = await retentionService.refreshScores(); await retentionService.audit(uid(req), 'retention.scores_refresh', r); return r; });
  app.get('/admin/retention/churn', adm, async () => retentionService.distribution());
  app.post('/admin/retention/rfm/refresh', adm, async () => retentionService.refreshRfm());
  app.get('/admin/retention/segments', adm, async () => retentionService.segments());
}
