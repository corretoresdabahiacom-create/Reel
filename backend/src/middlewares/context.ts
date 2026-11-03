import { sloRecord } from '../modules/sre/record.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { logger } from '../observability/logger.js';
import { m } from '../observability/metrics.js';
import { AppError } from '../utils/errors.js';
import { captureError } from '../observability/sentry.js';

declare module 'fastify' {
  interface FastifyRequest { traceId: string; startAt: bigint; auth?: AuthCtx; idem?: { key: string; redisKey: string } }
}
export interface AuthCtx { userId: string; isAdmin: boolean; via: 'jwt' | 'apikey'; scopes: string[]; tfa?: boolean }

const routeOf = (r: FastifyRequest) => r.routeOptions?.url ?? 'unknown';

/** SLIs de API/auth no próprio app (ver sre/record.ts). Leitura = GET; 4xx não conta como erro de disponibilidade. */
function recordHttpSlo(method: string, route: string, status: number, sec: number): void {
  const ok = status < 500; sloRecord('api-availability', ok);
  if (method === 'GET') sloRecord('api-latency-read', sec <= 0.3); else sloRecord('api-latency-write', sec <= 1);
  if (/\/auth\//.test(route)) { sloRecord('auth-availability', ok); sloRecord('auth-latency', sec <= 0.5); }
}
export function registerContext(app: FastifyInstance): void {
  app.addHook('onRequest', async (req, reply) => {
    req.traceId = (req.headers['x-trace-id'] as string | undefined)?.slice(0, 64) || (req.headers['traceparent'] as string | undefined)?.split('-')[1] || randomUUID().replace(/-/g, '');
    req.startAt = process.hrtime.bigint();
    reply.header('x-trace-id', req.traceId);
  });
  app.addHook('onResponse', async (req, reply) => {
    const route = routeOf(req); const sec = Number(process.hrtime.bigint() - req.startAt) / 1e9;
    m.httpRequests.inc({ method: req.method, route, status: reply.statusCode }); m.httpDuration.observe({ method: req.method, route }, sec);
    if (reply.statusCode >= 500) m.httpErrors.inc({ route });
    if (route !== '/healthz' && route !== '/readyz' && route !== '/metrics') recordHttpSlo(req.method, route, reply.statusCode, sec);
    if (route !== '/healthz' && route !== '/readyz' && route !== '/metrics')
      logger.info({ traceId: req.traceId, userId: req.auth?.userId, route, method: req.method, status: reply.statusCode, latencyMs: Math.round(sec * 1000) }, 'http');
  });
  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { statusCode?: number; validation?: unknown; code?: string };
    if (e instanceof AppError) {
      if (e.status === 429 && (e.details as { retryAfterSec?: number } | undefined)?.retryAfterSec) reply.header('retry-after', String((e.details as { retryAfterSec: number }).retryAfterSec));
      return reply.status(e.status).send({ code: e.code, message: e.message, details: e.details, traceId: req.traceId });
    }
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ code: e.code ?? 'bad_request', message: e.message, traceId: req.traceId });
    logger.error({ err: { message: e.message, stack: e.stack }, traceId: req.traceId, route: routeOf(req) }, 'unhandled');
    captureError(e, { userId: req.auth?.userId, route: routeOf(req), traceId: req.traceId });
    return reply.status(500).send({ code: 'internal_error', message: 'Erro interno', traceId: req.traceId });
  });
  app.setNotFoundHandler((req, reply) => reply.status(404).send({ code: 'not_found', message: 'Rota não encontrada', traceId: req.traceId }));
}
