import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { redis } from '../db/redis.js';
import { tooMany } from '../utils/errors.js';
import { m } from '../observability/metrics.js';
import { hashIp } from '../utils/crypto.js';

export interface Limit { scope: string; limit: number; windowSec: number; by?: 'ip' | 'user' | 'both' }
/** Janela fixa em Redis (INCR + EXPIRE atômico via Lua). Por IP, por usuário ou ambos. Falha aberta se o Redis cair (loga em métricas). */
const LUA = `local c = redis.call('INCR', KEYS[1]); if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end; return {c, redis.call('TTL', KEYS[1])}`;
export async function hit(key: string, limit: number, windowSec: number): Promise<{ ok: boolean; remaining: number; retryAfter: number }> {
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const [c, ttl] = (await redis.eval(LUA, 1, `rl:${key}:${bucket}`, String(windowSec))) as [number, number];
  return { ok: c <= limit, remaining: Math.max(0, limit - c), retryAfter: Math.max(1, ttl) };
}
export const clientIp = (req: FastifyRequest) => req.ip;
export function rateLimit(l: Limit): preHandlerAsyncHookHandler {
  return async (req, reply) => {
    const keys: string[] = [];
    if (l.by !== 'user') keys.push(`${l.scope}:ip:${hashIp(clientIp(req))}`);
    if (l.by === 'user' || l.by === 'both') { if (req.auth) keys.push(`${l.scope}:u:${req.auth.userId}`); }
    for (const k of keys) {
      let r; try { r = await hit(k, l.limit, l.windowSec); } catch { continue; }
      reply.header('x-ratelimit-limit', String(l.limit)); reply.header('x-ratelimit-remaining', String(r.remaining));
      if (!r.ok) { m.rateLimited.inc({ scope: l.scope }); throw tooMany('Muitas requisições. Tente novamente em instantes.', r.retryAfter); }
    }
  };
}
/** Perfis padrão. Auth é bem mais restrito. */
export const LIMITS = {
  global: { scope: 'global', limit: 600, windowSec: 60, by: 'ip' } as Limit,
  auth: { scope: 'auth', limit: 10, windowSec: 60, by: 'ip' } as Limit,
  authSensitive: { scope: 'auth_s', limit: 5, windowSec: 300, by: 'ip' } as Limit,
  write: { scope: 'write', limit: 120, windowSec: 60, by: 'user' } as Limit,
  generation: { scope: 'gen', limit: 30, windowSec: 60, by: 'user' } as Limit,
  publish: { scope: 'pub', limit: 20, windowSec: 60, by: 'user' } as Limit,
  redirect: { scope: 'redirect', limit: 120, windowSec: 60, by: 'ip' } as Limit,
  export: { scope: 'export', limit: 3, windowSec: 600, by: 'user' } as Limit,
};
