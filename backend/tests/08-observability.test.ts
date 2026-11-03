import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, app, type Session } from './helpers.js';
import { getQueue, enqueue, Q, dlqName } from '../src/queues/index.js';
import { ipInCidr } from '../src/modules/health/health.routes.js';
import { newTraceId } from '../src/observability/tracing.js';
import { buildApp } from '../src/app.js';
import supertest from 'supertest';

let admin: Session; let user: Session;
beforeAll(async () => { await boot(); admin = await signup({ admin: true }); user = await signup(); });
afterAll(() => shutdown());

describe('8. Observabilidade', () => {
  it('/healthz e /readyz (Postgres + Redis)', async () => { expect((await http.get('/healthz')).body.status).toBe('ok'); const r = await http.get('/readyz'); expect(r.status).toBe(200); expect(r.body.checks).toEqual({ postgres: 'ok', redis: 'ok' }); });
  it('/metrics exige token (Bearer) ou CIDR; expõe métricas HTTP, filas e negócio', async () => {
    expect((await http.get('/metrics')).status).toBe(403); expect((await http.get('/metrics').set('authorization', 'Bearer errado')).status).toBe(403);
    await http.get('/api/v1/billing/catalog'); const m = await http.get('/metrics').set('authorization', 'Bearer metrics-token'); expect(m.status).toBe(200);
    for (const name of ['http_requests_total', 'http_request_duration_seconds', 'queue_depth', 'job_duration_ms', 'ai_generation_duration_ms', 'publication_success_total', 'http_errors_total', 'dlq_size']) expect(m.text).toContain(name);
    expect(m.text).toMatch(/http_requests_total\{[^}]*route="\/api\/v1\/billing\/catalog"[^}]*\} \d+/); // rota normalizada (sem ids → baixa cardinalidade)
    expect(ipInCidr('10.1.2.3', '10.0.0.0/8')).toBe(true); expect(ipInCidr('11.1.2.3', '10.0.0.0/8')).toBe(false); expect(ipInCidr('::ffff:192.168.1.5', '192.168.1.0/24')).toBe(true);
  });
  it('traceId: gerado, propagado do header e presente no envelope de erro', async () => {
    const t = newTraceId(); const r = await http.get('/api/v1/users/me').set('x-trace-id', t); expect(r.status).toBe(401); expect(r.headers['x-trace-id']).toBe(t); expect(r.body.traceId).toBe(t);
    expect((await http.get('/healthz')).headers['x-trace-id']).toMatch(/^[0-9a-f]{32}$/);
    const nf = await http.get('/api/v1/nao-existe'); expect(nf.status).toBe(404); expect(nf.body).toMatchObject({ code: 'not_found' }); expect(nf.body.traceId).toBeTruthy();
  });
  it('/__debug é só para admin e lista últimas requisições, filas e flags', async () => {
    expect((await http.get('/__debug')).status).toBe(401); expect((await http.get('/__debug').set(auth(user))).status).toBe(403);
    const d = await http.get('/__debug').set(auth(admin)); expect(d.status).toBe(200); expect(d.body.recentRequests.length).toBeGreaterThan(0); expect(Object.keys(d.body.queues)).toContain('publication-tiktok'); expect(d.body.flags.length).toBeGreaterThan(3); expect(JSON.stringify(d.body)).not.toContain('JWT_SECRET');
  });
  it('job que esgota os 3 retries vai para a DLQ e aparece no painel admin e no gauge', async () => {
    await enqueue(Q.emails, 'welcome', { to: 'x@y.z', template: 'template_inexistente' }, { jobId: 'dlq-test-1' });
    const q = getQueue(dlqName(Q.emails)); const t0 = Date.now(); let n = 0; while (Date.now() - t0 < 15_000) { n = (await q.getJobCounts('waiting')).waiting ?? 0; if (n >= 1) break; await new Promise((r) => setTimeout(r, 100)); }
    expect(n).toBeGreaterThanOrEqual(1); const jobs = await q.getJobs(['waiting']); expect(jobs[0]!.data).toMatchObject({ attempts: 3 }); expect(jobs[0]!.data.error).toContain('template');
    const dlq = await http.get('/api/v1/admin/dlq').set(auth(admin)); expect(dlq.body.queues.emails.dlq).toBeGreaterThanOrEqual(1);
  });
  it('Bull Board em /admin/queues exige admin', async () => {
    const a2 = await buildApp({ bullBoard: true }); await a2.ready(); const st = supertest(a2.server);
    expect((await st.get('/admin/queues')).status).toBe(401); expect((await st.get('/admin/queues').set(auth(user))).status).toBe(403);
    const ok = await st.get('/admin/queues/').set(auth(admin)); expect(ok.status).toBe(200); expect(ok.text).toContain('html'); await a2.close(); void app;
  });
  it('erro 500 não vaza stack (envelope genérico com traceId)', async () => {
    const r = await http.get('/api/v1/admin/users').set(auth(admin)).query({ cursor: '%%%' }); expect([400, 500]).toContain(r.status); expect(JSON.stringify(r.body)).not.toContain('at ');
  });
});
