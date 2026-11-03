import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin, requireJwt, uid, optionalAuth } from '../../middlewares/auth.js';
import { rateLimit, clientIp } from '../../middlewares/rateLimit.js';
import { parse, uuid } from '../../utils/validate.js';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { growthService } from './growth.service.js';
import { growthSettings, updateGrowthSettings } from './settings.js';
import { referralsService } from '../referrals/referrals.service.js';
import { attributionService } from '../attribution/attribution.service.js';
import { MODELS, type Model } from '../attribution/models.js';
import { partnersService, partnerInput } from '../partners/partners.service.js';
import { ingestClient } from '../analytics/analytics.service.js';
import { EVENTS, TAXONOMY_VERSION } from '../analytics/taxonomy.js';
import { datascienceService } from '../datascience/datascience.service.js';
import { warehouseService } from '../datascience/warehouse.service.js';

const utm = z.object({ utm_source: z.string().max(80).optional(), utm_medium: z.string().max(80).optional(), utm_campaign: z.string().max(120).optional(), utm_content: z.string().max(120).optional(), utm_term: z.string().max(120).optional(), landing: z.string().max(300).optional(), referrer: z.string().max(300).optional() });
const date = z.coerce.date();
const HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; frame-ancestors 'none'";

const optionalUser = (req: { headers: Record<string, unknown> }): Promise<string | null> => optionalAuth(req); // RLS: JWT válido → consulta como o usuário

export async function growthRoutes(app: FastifyInstance): Promise<void> {
  const user = { preHandler: [authenticate(), requireJwt, rateLimit({ scope: 'growth', limit: 120, windowSec: 60, by: 'user' })] }; const adm = { preHandler: [requireAdmin] };
  const pub = (scope: string, limit = 30) => ({ preHandler: [rateLimit({ scope, limit, windowSec: 60, by: 'ip' })] });

  // ── analytics (taxonomia versionada; substitui a ingestão antiga) ──
  const evBody = z.object({ anonId: z.string().max(64).optional(), sessionId: z.string().max(64).optional(), events: z.array(z.object({ name: z.string().regex(/^[a-z0-9_.:-]{1,60}$/i), eventId: z.string().uuid().optional(), props: z.record(z.unknown()).default({}) })).min(1).max(50) });
  app.post('/analytics/events', pub('analytics', 60), async (req, reply) => {
    const b = parse(evBody, req.body); const userId = await optionalUser(req as never);
    const r = await ingestClient(userId, b.events.map((e) => ({ name: e.name, props: e.props, eventId: e.eventId })), { anonId: b.anonId, sessionId: b.sessionId });
    return reply.status(202).send(r);
  });
  app.get('/admin/analytics/taxonomy', adm, async () => ({ version: TAXONOMY_VERSION, events: Object.entries(EVENTS).map(([name, d]) => ({ name, ...d })) }));
  app.get('/admin/analytics/freshness', adm, async () => warehouseService.freshness());
  app.post('/admin/analytics/export', adm, async () => warehouseService.run({ force: true }));

  // ── atribuição ──
  app.post('/attribution/touch', pub('touch', 60), async (req) => { const b = parse(utm.extend({ anonId: z.string().min(8).max(64).optional() }), req.body); const userId = await optionalUser(req as never); if (!userId && !b.anonId) return { recorded: false, source: 'direct' }; return attributionService.touch(userId ? { userId } : { anonId: b.anonId! }, b); });
  app.get('/admin/attribution/report', adm, async (req) => { const q = parse(z.object({ from: date.optional(), to: date.optional(), model: z.enum(MODELS as [Model, ...Model[]]).default('last_non_direct'), lookbackDays: z.coerce.number().int().min(1).max(180).default(30) }), req.query); const to = q.to ?? new Date(); return attributionService.report({ from: q.from ?? new Date(to.getTime() - 30 * 86_400_000), to, model: q.model, lookbackDays: q.lookbackDays }); });

  // ── indicação ──
  app.get('/referrals/me', user, async (req) => referralsService.me(uid(req)));
  app.get('/ref/:code', pub('refclick', 60), async (req, reply) => {
    const code = (req.params as { code: string }).code; const q = parse(utm.extend({ device: z.string().max(80).optional() }), req.query);
    const { clickId } = await referralsService.click({ code, ip: clientIp(req), deviceId: q.device, utm: q as Record<string, string> });
    return reply.redirect(`${env.PUBLIC_APP_URL}/r/${encodeURIComponent(code)}${clickId ? `?cid=${clickId}` : ''}`, 302);
  });
  app.post('/referrals/click', pub('refclick', 60), async (req) => { const b = parse(z.object({ code: z.string().min(4).max(20), deviceId: z.string().max(80).optional() }), req.body); return referralsService.click({ code: b.code, ip: clientIp(req), deviceId: b.deviceId }); });
  app.post('/referrals/convert', user, async (req) => { const b = parse(z.object({ code: z.string().min(4).max(20), clickId: z.string().max(60).optional(), deviceId: z.string().max(80).optional() }), req.body); return referralsService.convert(uid(req), { ...b, ip: clientIp(req) }); });
  app.get('/admin/referrals', adm, async (req) => ({ items: await referralsService.adminList(parse(z.object({ status: z.string().max(20).optional() }), req.query).status) }));

  // ── onboarding / compartilhamento / watermark ──
  app.get('/growth/watermark', user, async (req) => growthService.watermark(uid(req)));
  app.get('/growth/share/:projectId', user, async (req) => growthService.shareInfo(uid(req), parse(uuid, (req.params as { projectId: string }).projectId), parse(z.object({ channel: z.string().max(30).optional() }), req.query).channel));
  app.get('/growth/share/:projectId/card.svg', user, async (req, reply) => reply.header('content-type', 'image/svg+xml; charset=utf-8').header('cache-control', 'private, max-age=300').send(await growthService.shareCardSvg(uid(req), parse(uuid, (req.params as { projectId: string }).projectId))));

  // ── waitlist (pública) ──
  app.post('/waitlist', pub('waitlist', 10), async (req, reply) => { const b = parse(z.object({ email: z.string().email().max(200), locale: z.enum(['pt-BR', 'en', 'es', 'es-MX']).default('pt-BR'), country: z.string().length(2).optional(), ref: z.string().max(20).optional(), anonId: z.string().max(64).optional(), utm: utm.optional() }), req.body); return reply.status(201).send(await growthService.joinWaitlist(b)); });
  app.get('/waitlist/:code', pub('waitlist', 30), async (req) => growthService.waitlistStatus((req.params as { code: string }).code.toUpperCase()));

  // ── SEO: páginas de template e sitemap (HTML público, CSP restrita) ──
  app.get('/public/templates/:id', pub('seo', 120), async (req, reply) => reply.header('content-type', 'text/html; charset=utf-8').header('content-security-policy', HTML_CSP).header('cache-control', 'public, max-age=600').send(await growthService.templatePageHtml(parse(uuid, (req.params as { id: string }).id))));
  app.get('/public/sitemap.xml', pub('seo', 60), async (_req, reply) => reply.header('content-type', 'application/xml; charset=utf-8').header('cache-control', 'public, max-age=3600').send(await growthService.sitemapXml()));

  // ── parceiros (admin) ──
  app.get('/admin/partners', adm, async () => ({ items: await partnersService.list() }));
  app.post('/admin/partners', adm, async (req, reply) => reply.status(201).send(await partnersService.create(uid(req), parse(partnerInput, req.body))));
  app.patch('/admin/partners/:id', adm, async (req) => partnersService.update(uid(req), parse(uuid, (req.params as { id: string }).id), parse(partnerInput.partial(), req.body)));
  app.get('/admin/partners/:id/sales', adm, async (req) => partnersService.sales(parse(uuid, (req.params as { id: string }).id)));
  app.post('/admin/partners/:id/mark-paid', adm, async (req) => partnersService.markPaid(uid(req), parse(uuid, (req.params as { id: string }).id)));

  // ── configurações de growth e ciência de dados (admin) ──
  app.get('/admin/growth/settings', adm, async () => growthSettings());
  app.patch('/admin/growth/settings', adm, async (req) => updateGrowthSettings(parse(z.record(z.unknown()), req.body)));
  app.get('/admin/datascience/forecast/revenue', adm, async (req) => { const q = parse(z.object({ history: z.coerce.number().int().min(14).max(365).default(90), horizon: z.coerce.number().int().min(1).max(90).default(30) }), req.query); return datascienceService.forecastRevenue(q); });
  app.get('/admin/datascience/forecast/ai-cost', adm, async (req) => datascienceService.forecastAiCost({ alert: parse(z.object({ alert: z.enum(['true', 'false']).default('true') }), req.query).alert === 'true' }));
  app.get('/admin/datascience/funnel', adm, async (req) => { const q = parse(z.object({ from: date.optional(), to: date.optional() }), req.query); const to = q.to ?? new Date(); return datascienceService.funnel({ from: q.from ?? new Date(to.getTime() - 30 * 86_400_000), to }); });
  app.get('/admin/datascience/cohort-ltv', adm, async (req) => datascienceService.cohortLtv(parse(z.object({ months: z.coerce.number().int().min(1).max(24).default(6) }), req.query).months));
  app.get('/admin/datascience/propensity', adm, async (req) => { const q = parse(z.object({ target: z.enum(['upgrade', 'credits']).default('upgrade'), limit: z.coerce.number().int().min(1).max(500).default(100) }), req.query); return datascienceService.propensityTop(q.target, q.limit); });
  app.get('/admin/growth/overview', adm, async () => ({ waitlist: (await pool.query<{ status: string; n: number }>(`SELECT status, count(*)::int n FROM waitlist_entries GROUP BY status`)).rows, openAlerts: (await pool.query<{ n: number }>(`SELECT count(*)::int n FROM growth_alerts WHERE resolved_at IS NULL`)).rows[0].n }));
}
