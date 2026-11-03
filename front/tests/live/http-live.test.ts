import test from 'node:test';
import assert from 'node:assert/strict';
import { createHttp, memoryStore, ApiError } from '../../src/api/http';

/**
 * P0-1 etapa 3 — o cliente do front contra o BACKEND REAL (não mock). Roda com `NEXUS_API_URL=http://localhost:8787 npm run test:live`.
 * O Node não guarda cookies; este fetch imita o navegador: guarda os Set-Cookie e os reenvia para o mesmo caminho.
 */
const API = process.env.NEXUS_API_URL;
function browserLikeFetch() {
  const jar = new Map<string, { value: string; path: string }>();
  const f = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url); const headers = new Headers(init.headers as HeadersInit);
    if (init.credentials === 'include') { const c = [...jar].filter(([, v]) => u.pathname.startsWith(v.path)).map(([k, v]) => `${k}=${v.value}`).join('; '); if (c) headers.set('cookie', c); }
    const r = await fetch(url, { ...init, headers });
    for (const sc of r.headers.getSetCookie()) { const [kv, ...attrs] = sc.split(';'); const [k, v] = kv!.split('='); const path = attrs.map((a) => a.trim()).find((a) => a.startsWith('Path='))?.slice(5) ?? '/'; if (/Max-Age=0/.test(sc)) jar.delete(k!); else jar.set(k!, { value: v!, path }); }
    return r;
  }) as unknown as typeof fetch;
  return { f, jar };
}

test('ponta a ponta contra o backend real: registro → /users/me → refresh por cookie (F5) → logout', { skip: !API && 'defina NEXUS_API_URL' }, async () => {
  const { f, jar } = browserLikeFetch(); const store = memoryStore();
  const h = createHttp({ baseUrl: API!, fetch: f, tokenStore: store });
  const email = `live-${Date.now()}@test.dev`;
  const reg = await h.register({ email, password: 'Sup3rSecret!pass', name: 'Live', birthDate: '1990-01-01' });
  assert.equal(reg.refreshToken, undefined, 'refresh não pode vir no corpo no modo cookie'); assert.ok(jar.has('nx_rt'), 'cookie httpOnly gravado');
  const me = await h.request('get', '/users/me'); assert.equal(me.email, email);
  // F5: novo cliente (access em memória perdido), mesmo navegador (cookie) e mesmo csrf guardado
  const h2 = createHttp({ baseUrl: API!, fetch: f, tokenStore: store });
  assert.equal(h2.isAuthenticated(), false); assert.equal(await h2.restore(), true);
  assert.equal((await h2.request('get', '/users/me')).email, email);
  // escrita idempotente real: mesma Idempotency-Key = mesma resposta (o servidor não cria duas vezes)
  const k = `live-${Date.now()}`;
  const p1 = await h2.request('post', '/projects', { body: { title: 'Projeto ao vivo', script: 'Um. Dois. Três.' } as never, idempotencyKey: k });
  const p2 = await h2.request('post', '/projects', { body: { title: 'Projeto ao vivo', script: 'Um. Dois. Três.' } as never, idempotencyKey: k });
  assert.equal((p2 as { id: string }).id, (p1 as { id: string }).id);
  await h2.logout(); assert.equal(jar.has('nx_rt'), false, 'logout apaga o cookie');
  await assert.rejects(createHttp({ baseUrl: API!, fetch: f, tokenStore: store }).request('get', '/users/me'), (e: ApiError) => e.status === 401);
});
