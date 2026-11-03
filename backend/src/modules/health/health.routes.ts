import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { registry } from '../../observability/metrics.js';
import { requireAdmin } from '../../middlewares/auth.js';
import { queueSnapshot } from '../../queues/index.js';
import { forbidden } from '../../utils/errors.js';
import { safeEqual } from '../../utils/crypto.js';
import { allFlags } from '../flags.service.js';

const ring: { at: string; method: string; route: string; status: number; ms: number; traceId: string }[] = [];
export const recordRequest = (r: (typeof ring)[number]) => { ring.push(r); if (ring.length > 200) ring.shift(); };
const ipToInt = (ip: string) => ip.split('.').reduce((a, o) => (a << 8) + Number(o), 0) >>> 0;
export function ipInCidr(ip: string, cidr: string): boolean { const clean = ip.replace(/^::ffff:/, ''); if (!/^\d+\.\d+\.\d+\.\d+$/.test(clean)) return clean === cidr || (cidr === '::1' && clean === '::1'); const [base, bits = '32'] = cidr.split('/'); const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0; return (ipToInt(clean) & mask) === (ipToInt(base!) & mask); }
/** /metrics: liberado por token (Bearer METRICS_TOKEN) ou por CIDR (rede interna do Prometheus). Em produção, sem nenhum dos dois configurado → fechado. */
export function metricsAllowed(req: FastifyRequest): boolean {
  const tok = String(req.headers.authorization ?? '').replace(/^Bearer /, ''); if (env.METRICS_TOKEN && tok && safeEqual(tok, env.METRICS_TOKEN)) return true;
  if (env.METRICS_ALLOW_CIDRS.some((c) => ipInCidr(req.ip, c))) return true; return env.NODE_ENV !== 'production' && !env.METRICS_TOKEN && !env.METRICS_ALLOW_CIDRS.length;
}
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/healthz', async () => ({ status: 'ok', uptimeSec: Math.round(process.uptime()) }));
  app.get('/readyz', async (_req, reply) => {
    const checks: Record<string, string> = {}; let ok = true;
    try { await pool.query<{ "?column?": number | null }>('SELECT 1'); checks.postgres = 'ok'; } catch { checks.postgres = 'fail'; ok = false; }
    try { await redis.ping(); checks.redis = 'ok'; } catch { checks.redis = 'fail'; ok = false; }
    return reply.status(ok ? 200 : 503).send({ status: ok ? 'ready' : 'not_ready', checks });
  });
  app.get('/metrics', async (req, reply) => { if (!metricsAllowed(req)) throw forbidden('Acesso negado'); return reply.header('content-type', registry.contentType).send(await registry.metrics()); });
  app.get('/__debug', { preHandler: [requireAdmin] }, async () => ({ env: { nodeEnv: env.NODE_ENV, region: env.REGION, platformMode: env.PLATFORM_MODE, paymentsMode: env.PAYMENTS_MODE, storage: env.STORAGE_DRIVER, aiVideo: env.AI_VIDEO_PROVIDER, aiTts: env.AI_TTS_PROVIDER }, version: process.env.APP_VERSION ?? 'dev', recentRequests: [...ring].reverse().slice(0, 50), queues: await queueSnapshot(), flags: (await allFlags()).map((f) => ({ key: f.key, enabled: f.enabled, rollout: f.rollout_percent })), memory: process.memoryUsage(), node: process.version }));
}
