import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireAdmin, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit } from '../../middlewares/rateLimit.js';
import { parse } from '../../utils/validate.js';
import { experimentsService, experimentInput } from './experiments.service.js';
import { pool } from '../../db/pool.js';

const key = (req: { params: unknown }) => parse(z.string().regex(/^[a-z0-9_]{3,60}$/), (req.params as { key: string }).key);
export async function experimentsRoutes(app: FastifyInstance): Promise<void> {
  const user = { preHandler: [authenticate(), requireJwt, rateLimit({ scope: 'exp', limit: 240, windowSec: 60, by: 'user' })] };
  const adm = { preHandler: [requireAdmin, rateLimit({ scope: 'admin', limit: 300, windowSec: 60, by: 'user' })] };
  /** Boot do front: variantes de todos os experimentos (sem registrar exposição). Falhas devolvem mapa vazio (front usa controle). */
  app.get('/experiments/active', user, async (req) => ({ experiments: await experimentsService.active(uid(req)) }));
  /** Atribui + registra exposição (chame quando a variante for realmente exibida). Sempre 200: fallback seguro = controle. */
  app.post('/experiments/:key/assign', user, async (req) => experimentsService.assign(uid(req), key(req), { expose: parse(z.object({ expose: z.boolean().default(true) }).default({}), req.body ?? {}).expose }));
  app.post('/experiments/:key/convert', user, async (req, reply) => { const b = parse(z.object({ event: z.string().regex(/^[a-z0-9_]{2,60}$/), value: z.number().min(0).max(1_000_000).default(0) }), req.body); return reply.status(202).send(await experimentsService.convert(uid(req), key(req), b.event, b.value)); });
  app.get('/experiments/debug', { preHandler: [requireAdmin] }, async (req) => { const active = await experimentsService.active(uid(req)); return { userId: uid(req), active, definitions: (await experimentsService.list()).map((e) => ({ key: e.key, status: e.status, variants: e.variants.map((v) => v.key), trafficPct: e.trafficPct })) }; });

  app.get('/admin/experiments', adm, async () => ({ items: await experimentsService.list() }));
  app.post('/admin/experiments', adm, async (req, reply) => reply.status(201).send(await experimentsService.create(uid(req), parse(experimentInput, req.body))));
  app.post('/admin/experiments/plan', adm, async (req) => experimentsService.plan(parse(z.object({ baseline: z.number().gt(0).lt(1).optional(), mdeRelative: z.number().gt(0).max(5).optional(), sd: z.number().gt(0).optional(), deltaAbs: z.number().gt(0).optional(), alpha: z.number().gt(0).lt(0.5).optional(), power: z.number().gt(0.5).lt(0.99).optional(), variants: z.number().int().min(2).max(6), eligiblePerDay: z.number().gt(0).optional(), trafficPct: z.number().min(1).max(100).optional(), nPerVariant: z.number().int().min(10).optional() }), req.body)));
  app.post('/admin/experiments/guardrails/check', adm, async () => ({ results: await experimentsService.checkGuardrails() }));
  app.get('/admin/experiments/:key', adm, async (req) => experimentsService.get(key(req)));
  app.patch('/admin/experiments/:key', adm, async (req) => experimentsService.update(uid(req), key(req), parse(experimentInput.partial().omit({ key: true }), req.body)));
  app.post('/admin/experiments/:key/start', adm, async (req) => experimentsService.start(uid(req), key(req)));
  app.post('/admin/experiments/:key/pause', adm, async (req) => experimentsService.pause(uid(req), key(req), parse(z.object({ reason: z.string().max(200).default('manual') }).default({}), req.body ?? {}).reason));
  app.post('/admin/experiments/:key/conclude', adm, async (req) => experimentsService.conclude(uid(req), key(req), parse(z.object({ decision: z.enum(['ship', 'keep_control', 'iterate', 'inconclusive']), winner: z.string().max(30).optional(), notes: z.string().max(2000).optional() }), req.body)));
  app.get('/admin/experiments/:key/results', adm, async (req) => { const q = parse(z.object({ correction: z.enum(['none', 'bonferroni', 'holm', 'fdr']).default('holm'), bayes: z.enum(['true', 'false']).default('false') }), req.query); return experimentsService.results(key(req), { correction: q.correction, bayes: q.bayes === 'true' }); });
  app.get('/admin/growth/alerts', adm, async () => ({ items: (await pool.query<{ id: number; kind: string; severity: string; message: string; data: unknown; createdAt: Date; resolvedAt: Date | null }>(`SELECT id, kind, severity, message, data, created_at AS "createdAt", resolved_at AS "resolvedAt" FROM growth_alerts ORDER BY created_at DESC LIMIT 100`)).rows }));
}
