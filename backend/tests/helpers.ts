import supertest from 'supertest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { startAllWorkers, scheduleRecurring } from '../src/workers.js';
import { closeQueues, stopQueueMetrics, getQueue, ALL_QUEUES } from '../src/queues/index.js';
import { closePools, pool } from '../src/db/pool.js';
import { redis, closeRedis } from '../src/db/redis.js';
import { randomUUID } from 'node:crypto';

export let app: FastifyInstance; let st: ReturnType<typeof supertest>;
const rip = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
type M = 'get' | 'post' | 'put' | 'patch' | 'delete';
/** Cada requisição sai de um IP simulado distinto (TRUSTED_PROXY=true) — os testes de rate limit fixam o IP explicitamente. */
export const http = Object.fromEntries((['get', 'post', 'put', 'patch', 'delete'] as M[]).map((m) => [m, (url: string) => st[m](url).set('x-forwarded-for', rip())])) as unknown as Record<M, (url: string) => supertest.Test>;
export async function boot(workers = true): Promise<void> {
  app = await buildApp({ bullBoard: false }); await app.ready(); st = supertest(app.server);
  if (workers) { startAllWorkers(); await scheduleRecurring(); }
}
export async function shutdown(): Promise<void> {
  stopQueueMetrics(); await app.close(); await closeQueues(); await closePools(); await closeRedis();
}
export async function cleanQueues(): Promise<void> { for (const q of ALL_QUEUES) await getQueue(q).obliterate({ force: true }).catch(() => undefined); }
export { pool, redis };

export const uniq = (p = 'u') => `${p}-${randomUUID().slice(0, 8)}`;
export interface Session { id: string; email: string; token: string; refresh: string }
export async function signup(opts: { plan?: 'free' | 'pro' | 'business'; credits?: number; admin?: boolean } = {}): Promise<Session> {
  const email = `${uniq('user')}@test.dev`; const r = await http.post('/api/v1/auth/register').send({ email, password: 'Sup3rSecret!pass', name: 'Tester', birthDate: '1990-01-01' }); if (r.status !== 201) throw new Error(`register falhou: ${r.status} ${JSON.stringify(r.body)}`);
  const id = r.body.user.id as string;
  if (opts.plan || opts.credits !== undefined || opts.admin) await pool.query('UPDATE users SET plan=COALESCE($2,plan), credits=COALESCE($3,credits), is_admin=COALESCE($4,is_admin) WHERE id=$1', [id, opts.plan ?? null, opts.credits ?? null, opts.admin ?? null]);
  let token = r.body.accessToken as string;
  if (opts.admin) { const l = await http.post('/api/v1/auth/login').send({ email, password: 'Sup3rSecret!pass' }); token = l.body.accessToken; }
  return { id, email, token, refresh: r.body.refreshToken };
}
export const auth = (s: Session) => ({ authorization: `Bearer ${s.token}` });
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
export async function uploadPhoto(s: Session): Promise<string> { const r = await http.put('/api/v1/uploads/photo').set(auth(s)).set('content-type', 'image/png').send(png); if (r.status !== 201) throw new Error(`upload falhou ${r.status} ${JSON.stringify(r.body)}`); return r.body.ref as string; }
export async function waitFor<T>(fn: () => Promise<T | undefined | false | null>, ms = 30_000, step = 100): Promise<T> {
  const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v as T; if (Date.now() - t0 > ms) throw new Error('waitFor: tempo esgotado'); await new Promise((r) => setTimeout(r, step)); }
}
export async function connectPlatform(s: Session, platform: string): Promise<void> {
  const c = await http.post(`/api/v1/integrations/${platform}/connect`).set(auth(s)).send({}); if (c.status >= 300) throw new Error(`connect ${platform}: ${c.status} ${JSON.stringify(c.body)}`);
  const state = (c.body.state ?? new URL(c.body.url).searchParams.get('state')) as string; const cb = await http.get(`/api/v1/integrations/${platform}/callback`).query({ code: 'mockcode', state, format: 'json' }).set(auth(s)); if (cb.status !== 200) throw new Error(`callback ${platform}: ${cb.status} ${JSON.stringify(cb.body)}`);
}
