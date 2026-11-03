import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin, uid } from '../../middlewares/auth.js';
import { rateLimit } from '../../middlewares/rateLimit.js';
import { parse, uuid, cursorQuery } from '../../utils/validate.js';
import { adminService } from './admin.service.js';
import { marketplaceService } from '../marketplace/marketplace.service.js';
import { paymentsService } from '../payments/payments.service.js';
import { allFlags, setFlag, invalidateFlags } from '../flags.service.js';
import { pool } from '../../db/pool.js';
import { notFound } from '../../utils/errors.js';
import { camel } from '../../utils/case.js';
import type { FastifyRequest as FReq, FastifyReply as FRep } from 'fastify';
/** P0-1 etapa 2: rotas que devolviam linhas cruas do Postgres saem em camelCase (contrato único da API). */
const cam = <R>(h: (req: FReq, reply: FRep) => Promise<R>) => async (req: FReq, reply: FRep) => camel(await h(req, reply));

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  const adm = { preHandler: [requireAdmin, rateLimit({ scope: 'admin', limit: 300, windowSec: 60, by: 'user' })] }; const id = (req: { params: unknown }) => parse(uuid, (req.params as { id: string }).id);
  app.get('/admin/metrics', adm, async () => adminService.metrics());
  app.get('/admin/users', adm, async (req) => { const q = parse(cursorQuery.extend({ search: z.string().max(100).optional() }), req.query); return adminService.users({ search: q.search, cursor: q.cursor, limit: q.limit }); });
  app.patch('/admin/users/:id', adm, async (req) => adminService.patchUser(uid(req), id(req), parse(z.object({ banned: z.boolean().optional(), plan: z.enum(['free', 'pro', 'business']).optional(), creditsDelta: z.number().int().min(-10000).max(10000).optional() }).strict(), req.body)));
  app.get('/admin/templates/pending', adm, async () => marketplaceService.pendingQueue());
  app.post('/admin/templates/:id/moderate', adm, async (req) => { const b = parse(z.object({ approve: z.boolean(), reason: z.string().max(300).optional() }), req.body); return marketplaceService.moderate(uid(req), id(req), b.approve, b.reason); });
  app.get('/admin/payouts', adm, async (req) => adminService.payouts((req.query as { status?: string }).status));
  app.post('/admin/payouts/:id/decision', adm, async (req) => { const b = parse(z.object({ approve: z.boolean(), reason: z.string().max(300).optional() }), req.body); return paymentsService.decide(id(req), uid(req), b.approve, b.reason); });
  app.get('/admin/audit-logs', adm, async (req) => { const q = parse(z.object({ actor: uuid.optional(), action: z.string().max(60).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }), req.query); return adminService.auditLogs(q); });
  app.get('/admin/flags', adm, cam(async () => ({ items: await allFlags() })));
  app.patch('/admin/flags/:key', adm, async (req) => { const key = (req.params as { key: string }).key; const b = parse(z.object({ enabled: z.boolean().optional(), rollout_percent: z.number().int().min(0).max(100).optional(), regions: z.array(z.string().max(10)).max(10).optional(), plans: z.array(z.enum(['free', 'pro', 'business'])).max(3).optional() }).strict(), req.body); if (!(await allFlags()).some((f) => f.key === key)) throw notFound('Flag inexistente'); await setFlag(uid(req), key, b); await invalidateFlags(); return { ok: true }; });
  app.get('/admin/reports', adm, async () => adminService.reports());
  app.get('/admin/dlq', adm, async () => adminService.dlq());
  app.post('/admin/reports/:id/resolve', adm, async (req) => { const r = await pool.query(`UPDATE reports SET status='resolved' WHERE id=$1`, [id(req)]); if (!r.rowCount) throw notFound(); return { resolved: true }; });
}
