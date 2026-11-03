import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { registerDbContext } from './db/context.js';
import helmet from '@fastify/helmet';
import { env } from './config/env.js';
import { logger } from './observability/logger.js';
import { registerContext } from './middlewares/context.js';
import { registerIdempotency } from './middlewares/idempotency.js';
import { rateLimit, LIMITS } from './middlewares/rateLimit.js';
import { requireAdmin } from './middlewares/auth.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';
import { uploadsRoutes } from './modules/uploads/uploads.routes.js';
import { projectsRoutes } from './modules/projects/projects.routes.js';
import { integrationsRoutes } from './modules/integrations/integrations.routes.js';
import { publicationRoutes } from './modules/publication/publication.routes.js';
import { marketplaceRoutes } from './modules/marketplace/marketplace.routes.js';
import { affiliatesRoutes, redirectRoutes } from './modules/affiliates/affiliates.routes.js';
import { paymentsRoutes } from './modules/payments/payments.routes.js';
import { b2bRoutes } from './modules/b2b/b2b.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { flagsRoutes } from './modules/flags/flags.routes.js';
import { experimentsRoutes } from './modules/experiments/experiments.routes.js';
import { recommendationsRoutes } from './modules/recommendations/recommendations.routes.js';
import { retentionRoutes } from './modules/retention/retention.routes.js';
import { monetizationRoutes } from './modules/monetization/monetization.routes.js';
import { growthRoutes } from './modules/growth/growth.routes.js';
import { opsRoutes } from './modules/ops/ops.routes.js';
import { audioRoutes } from './modules/audio/audio.routes.js';
import { voiceStudioRoutes } from './modules/audio/voiceStudio.routes.js';
import { backgroundRoutes } from './modules/background/background.routes.js';
import { elementsRoutes } from './modules/elements/elements.routes.js';
import { mergeRoutes } from './modules/merge/merge.routes.js';
import { exportRoutes } from './modules/export/export.routes.js';
import { assetsRoutes } from './modules/assets/assets.routes.js';
import { emailShareRoutes } from './modules/emailShare/emailShare.routes.js';
import { collaborationRoutes } from './modules/collaboration/collaboration.routes.js';
import { transcriptRoutes } from './modules/transcript/transcript.routes.js';
import { m10Routes } from './modules/m10/m10.routes.js';
import { accessibilityRoutes } from './modules/accessibility/accessibility.routes.js';
import websocket from '@fastify/websocket';
import { healthRoutes, recordRequest } from './modules/health/health.routes.js';
import './modules/b2b/b2b.service.js'; // registra os hooks de lote
import { recording, noteExchange } from './observability/contractRecorder.js';
import { enforcing, checkResponse } from './observability/contractEnforcer.js';

export async function buildApp(opts: { bullBoard?: boolean; onRoute?: (r: { method: string | string[]; url: string }) => void } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, trustProxy: env.TRUSTED_PROXY, bodyLimit: 1_000_000, genReqId: () => crypto.randomUUID(), ajv: { customOptions: { removeAdditional: false } } });
  if (opts.onRoute) app.addHook('onRoute', (r) => opts.onRoute!({ method: r.method, url: r.url })); // introspecção (gera/valida OpenAPI)
  await app.register(helmet, { contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } }, crossOriginResourcePolicy: { policy: 'cross-origin' }, hsts: env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true } : false });
  await app.register(cors, { origin: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : env.NODE_ENV === 'production' ? false : true, credentials: env.CORS_ORIGINS.length > 0 /* cookie de sessão só com lista explícita de origens (RFC 2026-10) */, methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] /* o padrão do @fastify/cors é só GET/HEAD/POST: PUT (upload) e PATCH falhavam no navegador real */, allowedHeaders: ['authorization', 'content-type', 'idempotency-key', 'x-trace-id', 'x-nexus-signature', 'x-session-mode', 'x-csrf-token'], exposedHeaders: ['x-trace-id', 'retry-after', 'idempotent-replay', 'ratelimit-remaining'], maxAge: 600 });
  // JSON com corpo cru preservado (assinaturas de webhook); CSV como texto.
  app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 2_000_000 }, (req, body: Buffer, done) => {
    (req as unknown as { rawBody: Buffer }).rawBody = body; if (!body.length) return done(null, undefined);
    try { done(null, JSON.parse(body.toString('utf8'))); } catch { const e = new Error('JSON inválido') as Error & { statusCode: number; code: string }; e.statusCode = 400; e.code = 'invalid_json'; done(e, undefined); }
  });
  app.addContentTypeParser('text/csv', { parseAs: 'string', bodyLimit: 2_000_000 }, (_r, body, done) => done(null, body));
  registerDbContext(app); registerContext(app); registerIdempotency(app);
  // Respostas da API carregam dados do usuário: nenhum cache (navegador, proxy, service worker). A mídia assinada define o próprio.
  app.addHook('onSend', async (req, reply) => { if (req.url.startsWith('/api/') && !req.url.startsWith('/api/v1/storage/') && !reply.hasHeader('cache-control')) reply.header('cache-control', 'no-store'); });
  app.addHook('onResponse', async (req, reply) => recordRequest({ at: new Date().toISOString(), method: req.method, route: req.routeOptions?.url ?? 'unknown', status: reply.statusCode, ms: Math.round(Number(process.hrtime.bigint() - req.startAt) / 1e6), traceId: req.traceId }));
  if (enforcing) app.addHook('onSend', async (req, reply, payload) => { await checkResponse(req.method, req.routeOptions?.url, reply.statusCode, String(reply.getHeader('content-type') ?? ''), payload); return payload; }); // P0-1 2: contrato validado nos testes
  if (recording) app.addHook('onSend', async (req, reply, payload) => { noteExchange(req.method, req.routeOptions?.url, req, reply.statusCode, String(reply.getHeader('content-type') ?? ''), payload); return payload; }); // P0-1 1b: só com OPENAPI_RECORD=1
  app.addHook('onRequest', rateLimit(LIMITS.global));
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } }); // Módulo 8: tempo real (rota em collaborationRoutes)
  await app.register(healthRoutes);
  await app.register(redirectRoutes);
  await app.register(async (api) => {
    // Módulos 4 a 11: merge/export/assets/email/colaboração ANTES de projectsRoutes (/projects/:projectId/merge|save|assets|email|transcript|agent|insights|seal|accessibility não podem ser lidos como /projects/:id)
    for (const r of [authRoutes, usersRoutes, uploadsRoutes, mergeRoutes, exportRoutes, assetsRoutes, emailShareRoutes, collaborationRoutes, transcriptRoutes, m10Routes, accessibilityRoutes, projectsRoutes, integrationsRoutes, publicationRoutes, marketplaceRoutes, affiliatesRoutes, paymentsRoutes, b2bRoutes, adminRoutes, flagsRoutes, experimentsRoutes, recommendationsRoutes, retentionRoutes, monetizationRoutes, growthRoutes, opsRoutes, audioRoutes, voiceStudioRoutes, backgroundRoutes, elementsRoutes]) await api.register(r);
  }, { prefix: '/api/v1' });
  if (opts.bullBoard ?? env.BULL_BOARD_ENABLED) await registerBullBoard(app);
  return app;
}
/** Bull Board em /admin/queues — protegido por JWT de admin (+TOTP quando exigido). */
async function registerBullBoard(app: FastifyInstance): Promise<void> {
  const [{ createBullBoard }, { BullMQAdapter }, { FastifyAdapter }, q] = await Promise.all([import('@bull-board/api'), import('@bull-board/api/bullMQAdapter'), import('@bull-board/fastify'), import('./queues/index.js')]);
  const adapter = new FastifyAdapter(); adapter.setBasePath('/admin/queues');
  createBullBoard({ queues: [...q.ALL_QUEUES.map((n) => new BullMQAdapter(q.getQueue(n))), ...q.ALL_QUEUES.map((n) => new BullMQAdapter(q.getQueue(q.dlqName(n))))] as never, serverAdapter: adapter });
  await app.register(async (scope) => { scope.addHook('onRequest', async (req, reply) => { try { await (requireAdmin as (r: unknown, p: unknown) => Promise<void>)(req, reply); } catch (e) { const a = e as { status?: number; code?: string; message: string }; return reply.status(a.status ?? 401).send({ code: a.code ?? 'unauthorized', message: a.message }); } }); await scope.register(adapter.registerPlugin() as never, { prefix: '/admin/queues' }); });
  logger.info('Bull Board em /admin/queues (somente admin)');
}
