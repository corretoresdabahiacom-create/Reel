import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit } from '../../middlewares/rateLimit.js';
import { parse, uuid } from '../../utils/validate.js';
import { pool } from '../../db/pool.js';
import { sreService } from '../sre/sre.service.js';
import { incidentsService, SEVERITIES, STATUSES } from '../incidents/incidents.service.js';
import { oncallService } from '../oncall/oncall.service.js';
import { finopsService, monthRange } from '../finops/finops.service.js';
import { sceneCache, costGuard } from '../cost-optimization/index.js';
import { ropaService } from '../compliance/ropa.js';
import { dpiaService } from '../compliance/dpia.js';
import { dsarService } from '../compliance/dsar.js';
import { aiActService } from '../compliance/aiact.js';
import { runPolicyRetention } from '../../workers/retention.js';
import { kycService } from '../governance/kyc.js';
import { residencyService, REGIONS } from '../residency/residency.js';
import { boardService } from '../board/board.service.js';
import { bcpService } from '../bcp/bcp.service.js';
import { profileQuery, resolveProfile } from '../i18n-deep/profile.js';
import { PLATFORMS } from '../../utils/validate.js';
import { camel } from '../../utils/case.js';
import type { FastifyRequest as FReq, FastifyReply as FRep } from 'fastify';
import type { Row } from '../../db/rows.generated.js';
/** P0-1 etapa 2: rotas que devolviam linhas cruas do Postgres saem em camelCase (contrato único da API). */
const cam = <R>(h: (req: FReq, reply: FRep) => Promise<R>) => async (req: FReq, reply: FRep) => camel(await h(req, reply));

const month = z.string().regex(/^\d{4}-\d{2}$/).optional();
const inputs = z.object({ marketingSpendCents: z.number().optional(), prevQuarterMarketingSpendCents: z.number().optional(), cashCents: z.number().optional(), netBurnMonthlyCents: z.number().optional(), operatingMarginPct: z.number().optional(), newCustomers: z.number().optional() });
const dpiaSubject = z.object({ kind: z.enum(['ai_provider', 'subprocessor', 'jurisdiction', 'data_type']), name: z.string().min(2).max(120), purpose: z.string().min(3).max(300), dataCategories: z.array(z.string().max(60)).min(1).max(20), countries: z.array(z.string().length(2)).optional(), transferOutsideRegion: z.boolean().optional(), processesMinors: z.boolean().optional(), automatedDecisions: z.boolean().optional(), special: z.array(z.string()).optional(), dpaSigned: z.boolean().optional(), region: z.string().optional() });

/** Rotas de operação contínua (Fase 8): SRE, incidentes + status page pública, FinOps, compliance, governança, residência, board, BCP, i18n. Tudo `/admin/ops/*` exige admin; públicas: /status*, /i18n/profile. */
export async function opsRoutes(app: FastifyInstance): Promise<void> {
  const adm = { preHandler: [requireAdmin] }; const user = { preHandler: [authenticate(), requireJwt, rateLimit({ scope: 'ops-user', limit: 60, windowSec: 60, by: 'user' })] };
  const pub = (scope: string, limit = 60) => ({ preHandler: [rateLimit({ scope, limit, windowSec: 60, by: 'ip' })] });

  // ── status page pública ──
  app.get('/status', pub('status'), cam(async () => incidentsService.statusPage()));
  app.get('/status.rss', pub('status'), async (_req, reply) => reply.header('content-type', 'application/rss+xml; charset=utf-8').send(await incidentsService.statusRss()));
  app.post('/status/subscribe', pub('status-sub', 10), async (req) => { const b = parse(z.object({ channel: z.enum(['email', 'sms']), target: z.string().min(5).max(200), components: z.array(z.string().max(40)).max(10).default([]) }), req.body); return incidentsService.subscribe(b.channel, b.target, b.components); });
  app.get('/status/confirm/:token', pub('status-sub', 10), async (req) => incidentsService.confirmSubscriber((req.params as { token: string }).token));
  app.get('/i18n/profile', pub('i18n'), async (req) => { const q = parse(profileQuery, req.query); return resolveProfile(q.locale, q.country); });
  app.get('/users/me/i18n-profile', user, async (req) => { const u = (await pool.query<Pick<Row<'users'>, 'locale' | 'country'>>('SELECT locale, country FROM users WHERE id=$1', [uid(req)])).rows[0]; return resolveProfile(u.locale, u.country ?? undefined); });
  app.get('/users/me/residency', user, async (req) => residencyService.forUser(uid(req)));
  app.post('/users/me/kyc', user, cam(async (req) => kycService.submit(uid(req), parse(z.object({ documentType: z.enum(['passport', 'national_id', 'driver_license', 'cnpj']), externalRef: z.string().min(3).max(120) }), req.body))));
  app.get('/users/me/kyc', user, cam(async (req) => kycService.status(uid(req))));

  // ── SRE ──
  app.get('/admin/ops/slo', adm, async () => sreService.status());
  app.post('/admin/ops/slo/evaluate', adm, async (req) => sreService.evaluate(Date.now(), parse(z.object({ openIncidents: z.boolean().default(true) }), req.body ?? {})));
  app.post('/admin/ops/slo/ingest', adm, async (req) => { const b = parse(z.object({ sloId: z.string().min(3).max(80), samples: z.array(z.object({ ts: z.union([z.number(), z.string()]), good: z.number().min(0), total: z.number().min(0) })).min(1).max(5000) }), req.body); return { ingested: await sreService.ingest(b.sloId, b.samples) }; });
  app.get('/admin/ops/slo/alerts', adm, cam(async () => ({ items: await sreService.alerts() })));
  app.get('/admin/ops/release-gate', adm, async (req) => sreService.releaseGate(parse(z.object({ type: z.enum(['feature', 'fix']).default('feature') }), req.query).type));
  app.post('/admin/ops/release-gate/unfreeze', adm, async (req) => sreService.unfreeze(uid(req), parse(z.object({ reason: z.string().min(10).max(500), sreApproval: z.boolean().optional() }), req.body)));

  // ── incidentes ──
  app.post('/admin/ops/incidents', adm, async (req) => { const b = parse(z.object({ severity: z.enum(SEVERITIES), title: z.string().min(5).max(200), components: z.array(z.string().max(40)).default([]), commanderId: uuid.optional(), impact: z.string().max(500).optional(), roles: z.record(z.string()).optional(), detectedAt: z.coerce.date().optional() }), req.body); return incidentsService.open({ ...b, actor: uid(req) }); });
  app.get('/admin/ops/incidents', adm, async (req) => incidentsService.list(parse(z.object({ status: z.enum(STATUSES).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query)));
  app.get('/admin/ops/incidents/stats', adm, async () => incidentsService.stats());
  app.get('/admin/ops/incidents/overdue', adm, async () => ({ updates: await incidentsService.overdueUpdates(), postmortems: await incidentsService.postmortemSla() }));
  app.get('/admin/ops/incidents/:id', adm, cam(async (req) => incidentsService.get(parse(uuid, (req.params as { id: string }).id))));
  app.post('/admin/ops/incidents/:id/updates', adm, cam(async (req) => incidentsService.update(parse(uuid, (req.params as { id: string }).id), parse(z.object({ message: z.string().min(3).max(2000), status: z.enum(STATUSES).optional(), public: z.boolean().default(true) }), req.body), uid(req))));
  app.post('/admin/ops/incidents/:id/postmortem', adm, cam(async (req) => incidentsService.createPostmortemDraft(parse(uuid, (req.params as { id: string }).id))));
  app.post('/admin/ops/incidents/:id/postmortem/review', adm, cam(async (req) => incidentsService.reviewPostmortem(parse(uuid, (req.params as { id: string }).id), uid(req), parse(z.object({ rootCause: z.string().min(10).max(2000), fiveWhys: z.array(z.object({ why: z.number().int().min(1).max(10), answer: z.string().min(3).max(500) })).min(3).max(10), actions: z.array(z.unknown()).optional(), publish: z.boolean().optional() }), req.body))));
  app.get('/admin/ops/oncall/load', adm, async (req) => oncallService.load(parse(z.object({ days: z.coerce.number().int().min(1).max(180).default(30) }), req.query).days));

  // ── FinOps ──
  app.get('/admin/ops/finops/unit-economics', adm, async (req) => finopsService.unitEconomics(monthRange(parse(z.object({ month }), req.query).month)));
  app.get('/admin/ops/finops/gross-margin', adm, async (req) => finopsService.grossMargin(monthRange(parse(z.object({ month }), req.query).month)));
  app.get('/admin/ops/finops/top-projects', adm, async (req) => { const q = parse(z.object({ month, limit: z.coerce.number().int().min(1).max(50).default(10) }), req.query); return { items: await finopsService.topProjects(monthRange(q.month), q.limit) }; });
  app.post('/admin/ops/finops/cost-import', adm, async (req) => finopsService.importCosts(parse(z.object({ rows: z.array(z.object({ date: z.string(), service: z.string().max(80), provider: z.string().max(40).optional(), costCents: z.number().min(0), tags: z.record(z.string()).optional() })).min(1).max(5000) }), req.body).rows));
  app.post('/admin/ops/finops/simulate', adm, async (req) => finopsService.simulate(parse(z.object({ priceCents: z.number().positive(), taxPct: z.number().min(0).max(60).optional(), paymentFeePct: z.number().min(0).max(30).optional(), profile: z.union([z.string().max(20), z.record(z.number())]).optional(), optimizations: z.object({ cacheHitRate: z.number().min(0).max(1).optional(), routingSavingsPct: z.number().min(0).max(1).optional(), distillShare: z.number().min(0).max(1).optional(), distillSavingsPct: z.number().min(0).max(1).optional() }).optional() }), req.body) as never));
  app.get('/admin/ops/finops/opportunities', adm, async (req) => finopsService.opportunities(monthRange(parse(z.object({ month }), req.query).month)));
  app.get('/admin/ops/finops/cache', adm, async () => sceneCache.stats());
  app.post('/admin/ops/finops/guard', adm, async () => finopsService.guard());
  app.post('/admin/ops/finops/guard/release', adm, async (req) => costGuard.reenable(uid(req), parse(z.object({ reason: z.string().min(10).max(500) }), req.body).reason));

  // ── compliance ──
  app.get('/admin/ops/compliance/matrix', adm, async () => ({ items: dpiaService.matrix() }));
  app.get('/admin/ops/compliance/gate/:country', adm, async (req) => dpiaService.jurisdictionGate((req.params as { country: string }).country));
  app.get('/admin/ops/compliance/ropa', adm, cam(async () => ({ items: await ropaService.list(), stale: await ropaService.stale() })));
  app.post('/admin/ops/compliance/ropa/refresh', adm, async () => ropaService.autoPopulate());
  app.get('/admin/ops/compliance/dpia', adm, cam(async () => ({ items: await dpiaService.list() })));
  app.post('/admin/ops/compliance/dpia', adm, cam(async (req) => dpiaService.create(uid(req), parse(dpiaSubject, req.body))));
  app.get('/admin/ops/compliance/dpia/:id', adm, cam(async (req) => dpiaService.get(parse(uuid, (req.params as { id: string }).id))));
  app.post('/admin/ops/compliance/dpia/:id/review', adm, cam(async (req) => dpiaService.review(parse(uuid, (req.params as { id: string }).id), uid(req), parse(z.object({ decision: z.enum(['approve', 'reject']), notes: z.string().max(2000).optional() }), req.body))));
  app.get('/admin/ops/compliance/ai-act', adm, cam(async () => ({ items: await aiActService.list(), gaps: await aiActService.gaps() })));
  app.post('/admin/ops/compliance/ai-act/sync', adm, async () => aiActService.sync());
  app.get('/admin/ops/compliance/dsar', adm, async (req) => dsarService.report(parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(90) }), req.query).days));
  app.post('/admin/ops/compliance/retention/run', adm, async (req) => runPolicyRetention(parse(z.object({ dryRun: z.boolean().default(true) }), req.body ?? {})));
  app.get('/admin/ops/compliance/retention/report', adm, cam(async (req) => { const d = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query).days; return { items: (await pool.query<{ id: number; ran_at: Date; dry_run: boolean; results: unknown }>(`SELECT id, ran_at, dry_run, results FROM retention_runs WHERE ran_at > now() - ($1 || ' days')::interval ORDER BY ran_at DESC`, [String(d)])).rows }; }));
  app.get('/admin/ops/compliance/subprocessors', adm, cam(async () => ({ items: (await pool.query<Row<'subprocessors'>>('SELECT * FROM subprocessors ORDER BY name')).rows })));
  app.put('/admin/ops/compliance/subprocessors', adm, cam(async (req) => { const b = parse(z.object({ name: z.string().min(2).max(80), purpose: z.string().min(3).max(300), location: z.string().max(80), dpaSignedAt: z.coerce.date().optional(), contact: z.string().max(200).optional(), status: z.enum(['active', 'pending_dpa', 'removed']).default('active') }), req.body); return (await pool.query<Row<'subprocessors'>>(`INSERT INTO subprocessors (name,purpose,location,dpa_signed_at,contact,status) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (name) DO UPDATE SET purpose=$2, location=$3, dpa_signed_at=$4, contact=$5, status=$6 RETURNING *`, [b.name, b.purpose, b.location, b.dpaSignedAt ?? null, b.contact ?? null, b.status])).rows[0]; }));

  // ── residência / board / continuidade ──
  app.get('/admin/ops/residency/distribution', adm, async () => ({ items: await residencyService.distribution() }));
  app.post('/admin/ops/residency/migrate', adm, async (req) => { const b = parse(z.object({ userId: uuid, to: z.enum(REGIONS as [string, ...string[]]), reason: z.string().min(10).max(500) }), req.body); return residencyService.migrate(uid(req), b.userId, b.to as never, b.reason); });
  app.get('/admin/ops/board', adm, cam(async () => ({ items: await boardService.list() })));
  app.post('/admin/ops/board/compute', adm, async (req) => boardService.compute(new Date(), parse(inputs, req.body ?? {})));
  app.post('/admin/ops/board/:period', adm, cam(async (req) => boardService.save(uid(req), (req.params as { period: string }).period, parse(inputs, req.body ?? {}))));
  app.post('/admin/ops/board/:period/publish', adm, cam(async (req) => boardService.publish(uid(req), (req.params as { period: string }).period)));
  app.get('/admin/ops/regional', adm, async () => boardService.regional());
  app.get('/admin/ops/vendors', adm, cam(async () => ({ items: (await pool.query<Row<'vendor_contracts'>>('SELECT * FROM vendor_contracts ORDER BY criticality, vendor')).rows })));
  app.put('/admin/ops/vendors', adm, cam(async (req) => { const b = parse(z.object({ vendor: z.string().min(2).max(80), service: z.string().min(2).max(80), sla: z.string().max(200).optional(), exitPlanUrl: z.string().max(300).optional(), renewalDate: z.string().optional(), owner: z.string().min(2).max(80), criticality: z.enum(['low', 'medium', 'high', 'critical']).default('medium') }), req.body); return (await pool.query<Row<'vendor_contracts'>>(`INSERT INTO vendor_contracts (vendor,service,sla,exit_plan_url,renewal_date,owner,criticality) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (vendor,service) DO UPDATE SET sla=$3, exit_plan_url=$4, renewal_date=$5, owner=$6, criticality=$7 RETURNING *`, [b.vendor, b.service, b.sla ?? null, b.exitPlanUrl ?? null, b.renewalDate ?? null, b.owner, b.criticality])).rows[0]; }));
  app.get('/admin/ops/bcp/scenarios', adm, cam(async () => ({ items: await bcpService.scenarios(), overdue: await bcpService.overdue(), integratedProviders: bcpService.integratedProviders() })));
  app.post('/admin/ops/bcp/drill/:name', adm, async (req) => bcpService.run((req.params as { name: string }).name, uid(req)));
  app.get('/admin/ops/exercises', adm, cam(async () => ({ items: await bcpService.exercises() })));
  app.post('/admin/ops/exercises', adm, cam(async (req) => bcpService.schedule(parse(z.object({ kind: z.enum(['chaos', 'dr', 'bcp', 'gameday', 'load', 'restore']), name: z.string().min(3).max(120), owner: z.string().min(2).max(80), scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }), req.body))));
  app.post('/admin/ops/exercises/:id/complete', adm, cam(async (req) => bcpService.complete(parse(uuid, (req.params as { id: string }).id), parse(z.object({ outcome: z.enum(['passed', 'gaps_found', 'failed']), measuredMinutes: z.number().int().min(0).optional(), evidenceUrl: z.string().max(300).optional(), postmortemIncidentId: uuid.optional() }), req.body))));
  void PLATFORMS;
}
