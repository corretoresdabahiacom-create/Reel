import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, memoryStore, ApiError, type ResponseOf } from '../src/api/http';

/** P0-1 etapa 3 — cliente HTTP único: auth em memória, refresh por cookie, idempotência, novas tentativas, erros i18n. */
type Call = { url: string; method: string; headers: Record<string, string>; body?: string; credentials?: string };
function fake(script: Array<(c: Call) => Response | Promise<Response> | 'network'>) {
  const calls: Call[] = []; let i = 0;
  const f = (async (url: string, init: RequestInit) => {
    const c: Call = { url, method: String(init.method), headers: init.headers as Record<string, string>, body: init.body as string | undefined, credentials: init.credentials };
    calls.push(c); const step = script[Math.min(i++, script.length - 1)]!; const r = await step(c);
    if (r === 'network') throw new TypeError('fetch failed'); return r;
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const opts = (f: typeof fetch, extra = {}) => ({ baseUrl: 'https://api.test/', fetch: f, sleep: async () => {}, random: () => 0.5, uuid: () => 'key-1', tokenStore: memoryStore(), ...extra });

test('login em modo cookie: credentials include, X-Session-Mode, guarda só o csrf; access vai como Bearer', async () => {
  const store = memoryStore();
  const { f, calls } = fake([() => json(200, { accessToken: 'A1', csrfToken: 'C1', expiresIn: 900 }), () => json(200, { id: 'u1' })]);
  const h = createHttp(opts(f, { tokenStore: store }));
  await h.login('a@b.dev', 'x'); assert.equal(store.get('csrf'), 'C1'); assert.equal(store.get('refresh'), null);
  assert.equal(calls[0]!.credentials, 'include'); assert.equal(calls[0]!.headers['x-session-mode'], 'cookie'); assert.equal(calls[0]!.headers.authorization, undefined);
  await h.request('get', '/users/me'); assert.equal(calls[1]!.headers.authorization, 'Bearer A1'); assert.equal(calls[1]!.url, 'https://api.test/api/v1/users/me');
});

test('401 → um ÚNICO refresh (cookie + X-CSRF-Token) para todas as requisições em voo → repete cada uma uma vez', async () => {
  let refreshes = 0;
  const { f, calls } = fake([(c) => {
    if (c.url.endsWith('/auth/login')) return json(200, { accessToken: 'old', csrfToken: 'C1' });
    if (c.url.endsWith('/auth/refresh')) { refreshes++; assert.equal(c.headers['x-csrf-token'], 'C1'); assert.equal(c.credentials, 'include'); return json(200, { accessToken: 'new', csrfToken: 'C2' }); }
    return c.headers.authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, { code: 'unauthorized', message: 'x' });
  }]);
  const store = memoryStore(); const h = createHttp(opts(f, { tokenStore: store })); await h.login('a', 'b');
  const out = await Promise.all([h.request('get', '/users/me'), h.request('get', '/projects'), h.request('get', '/users/me/consents')]);
  assert.equal(refreshes, 1); assert.equal(out.length, 3); assert.equal(store.get('csrf'), 'C2');
  assert.equal(calls.filter((c) => c.headers.authorization === 'Bearer new').length, 3);
});

test('refresh falhou → avisa (onUnauthenticated), esquece a sessão e devolve ApiError 401 localizado', async () => {
  let fired = 0; const store = memoryStore();
  const { f } = fake([(c) => c.url.endsWith('/auth/login') ? json(200, { accessToken: 'A', csrfToken: 'C' }) : c.url.endsWith('/auth/refresh') ? json(401, { code: 'unauthorized' }) : json(401, { code: 'unauthorized', message: 'Não autenticado' })]);
  const h = createHttp(opts(f, { tokenStore: store, onUnauthenticated: () => fired++, locale: () => 'en' as const })); await h.login('a', 'b');
  await assert.rejects(h.request('get', '/users/me'), (e: ApiError) => e.status === 401 && e.code === 'unauthorized' && /session expired/.test(e.message));
  assert.equal(fired, 1); assert.equal(store.get('csrf'), null); assert.equal(h.isAuthenticated(), false);
});

test('escrita: Idempotency-Key automática e a MESMA em cada nova tentativa (503 → 503 → 201)', async () => {
  const { f, calls } = fake([() => json(503, { code: 'service_unavailable' }), () => json(503, {}), () => json(201, { id: 'p1' })]);
  const slept: number[] = []; const h = createHttp(opts(f, { sleep: async (ms: number) => { slept.push(ms); } }));
  const r = await h.request('post', '/projects', { body: { title: 'x' } as never }); assert.deepEqual(r, { id: 'p1' });
  assert.deepEqual(calls.map((c) => c.headers['idempotency-key']), ['key-1', 'key-1', 'key-1']); assert.deepEqual(slept, [300, 600]);
});

test('não repete em 4xx nem em 500; repete em falha de rede; respeita Retry-After', async () => {
  for (const st of [400, 409, 422, 500]) { const { f, calls } = fake([() => json(st, { code: 'x', message: 'm' })]); await assert.rejects(createHttp(opts(f)).request('get', '/users/me')); assert.equal(calls.length, 1, `status ${st}`); }
  const { f, calls } = fake(['network' as const, () => json(200, { ok: 1 })].map((x) => (typeof x === 'string' ? () => x : x)) as never); await createHttp(opts(f)).request('get', '/users/me'); assert.equal(calls.length, 2);
  const slept: number[] = []; const g = fake([() => json(503, {}, { 'retry-after': '3' }), () => json(200, {})]); await createHttp(opts(g.f, { sleep: async (ms: number) => { slept.push(ms); } })).request('get', '/users/me'); assert.deepEqual(slept, [3000]);
});

test('erro do servidor vira ApiError com code, details e traceId; mensagem de negócio do servidor é mantida', async () => {
  const { f } = fake([() => json(422, { code: 'timeline_too_long', message: 'A timeline passou de 120 s', details: { maxMs: 120000 }, traceId: 't-9' })]);
  await assert.rejects(createHttp(opts(f)).request('get', '/users/me'), (e: ApiError) => e.code === 'timeline_too_long' && e.message === 'A timeline passou de 120 s' && (e.details as { maxMs: number }).maxMs === 120000 && e.traceId === 't-9');
  const g = fake([() => json(429, { code: 'rate_limited', message: 'Muitas requisições' }, { 'retry-after': '30' })]);
  await assert.rejects(createHttp(opts(g.f, { locale: () => 'es' as const })).request('get', '/users/me'), (e: ApiError) => e.retryAfterSec === 30 && /Demasiados intentos/.test(e.message));
});

test('tempo esgotado e sem conexão viram ApiError claros (sem repetir infinitamente)', async () => {
  const slow = (async (_u: string, init: RequestInit) => new Promise<Response>((_r, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))))) as unknown as typeof fetch;
  await assert.rejects(createHttp(opts(slow, { timeoutMs: 20, maxRetries: 0 })).request('get', '/users/me'), (e: ApiError) => e.code === 'timeout' && e.status === 0);
  const { f, calls } = fake([() => 'network' as const]); await assert.rejects(createHttp(opts(f)).request('get', '/users/me'), (e: ApiError) => e.code === 'network_error'); assert.equal(calls.length, 3);
});

test('parâmetros de caminho e query: codificados; parâmetro ausente é erro antes da rede', async () => {
  const { f, calls } = fake([() => json(200, { items: [] })]); const h = createHttp(opts(f));
  await h.request('get', '/projects/{projectId}/comments', { params: { projectId: 'a/b c' } }); assert.equal(calls[0]!.url, 'https://api.test/api/v1/projects/a%2Fb%20c/comments');
  await h.request('get', '/projects', { query: { limit: 20, cursor: undefined } as never }); assert.equal(calls[1]!.url, 'https://api.test/api/v1/projects?limit=20');
  await assert.rejects(h.request('get', '/projects/{projectId}/comments', { params: {} as never }), (e: ApiError) => e.code === 'bad_request'); assert.equal(calls.length, 2);
});

test('modo body (app nativo): refresh pelo corpo, guardado no tokenStore; logout manda o refresh e limpa', async () => {
  const store = memoryStore();
  const { f, calls } = fake([(c) => c.url.endsWith('/auth/login') ? json(200, { accessToken: 'A', refreshToken: 'R1' }) : c.url.endsWith('/auth/refresh') ? json(200, { accessToken: 'B', refreshToken: 'R2' }) : c.url.endsWith('/auth/logout') ? new Response(null, { status: 204 }) : c.headers.authorization === 'Bearer B' ? json(200, {}) : json(401, {})]);
  const h = createHttp(opts(f, { mode: 'body', tokenStore: store })); await h.login('a', 'b'); assert.equal(store.get('refresh'), 'R1');
  await h.request('get', '/users/me'); const rf = calls.find((c) => c.url.endsWith('/auth/refresh'))!; assert.equal(JSON.parse(rf.body!).refreshToken, 'R1'); assert.equal(rf.credentials, 'omit'); assert.equal(store.get('refresh'), 'R2');
  await h.logout(); assert.equal(JSON.parse(calls.at(-1)!.body!).refreshToken, 'R2'); assert.equal(store.get('refresh'), null);
});

test('restore (F5): sem csrf guardado não chama a rede; com csrf faz o refresh e volta autenticado', async () => {
  const { f, calls } = fake([() => json(200, { accessToken: 'A', csrfToken: 'C2' })]); const store = memoryStore();
  const h = createHttp(opts(f, { tokenStore: store })); assert.equal(await h.restore(), false); assert.equal(calls.length, 0);
  store.set('csrf', 'C1'); assert.equal(await h.restore(), true); assert.equal(h.isAuthenticated(), true); assert.equal(calls[0]!.headers['x-csrf-token'], 'C1');
});

test('login com senha errada: mostra a mensagem do servidor (não "sessão expirou") e não tenta refresh', async () => {
  const { f, calls } = fake([() => json(401, { code: 'unauthorized', message: 'E-mail ou senha incorretos' })]);
  await assert.rejects(createHttp(opts(f)).login('a@b.dev', 'errada'), (e: ApiError) => e.status === 401 && e.message === 'E-mail ou senha incorretos');
  assert.equal(calls.length, 1);
});

test('upload binário: content-type da foto, corpo cru, Bearer e Idempotency-Key', async () => {
  const { f, calls } = fake([(c) => c.url.endsWith('/auth/login') ? json(200, { accessToken: 'A', csrfToken: 'C' }) : json(201, { ref: 'u/1.png', url: 'https://cdn/1.png' })]);
  const h = createHttp(opts(f)); await h.login('a', 'b');
  const r = await h.upload('put', '/uploads/photo', new Uint8Array([137, 80, 78, 71]), 'image/png') as { ref: string };
  assert.equal(r.ref, 'u/1.png'); const c = calls[1]!; assert.equal(c.method, 'PUT'); assert.equal(c.headers['content-type'], 'image/png'); assert.equal(c.headers.authorization, 'Bearer A'); assert.equal(c.headers['idempotency-key'], 'key-1'); assert.ok(c.body as unknown instanceof Uint8Array);
});

// tipo (checado pelo `npm run typecheck`): a resposta de /users/me vem do contrato do backend
type Me = ResponseOf<'/users/me', 'get'>; export const _typed: 'email' extends keyof Me ? true : never = true;
