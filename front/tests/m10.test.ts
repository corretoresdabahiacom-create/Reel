import test from 'node:test';
import assert from 'node:assert/strict';
import { M10Client, RateLimited, ClientRuleError, isHttpsUrl, type Fetch } from '../src/services/m10/m10Client';

/** Módulo 10 — cliente com fetch falso (sem rede). */
const res = (status: number, body: unknown = {}, h: Record<string, string> = {}) => ({ status, headers: { get: (n: string) => h[n.toLowerCase()] ?? null }, json: async () => body });
const mk = (impl: Fetch) => { const calls: Array<{ url: string; init: any }> = []; let k = 0;
  const c = new M10Client({ baseUrl: 'https://api.example/api/v1', token: () => 'jwt', fetch: async (u, i) => { calls.push({ url: u, init: i }); return impl(u, i); }, newKey: () => `k${++k}`, sleep: async () => undefined });
  return { c, calls }; };
const live = { catalogId: 'c1', title: 'Vitrine', avatar: { source: 'preset' as const, preset: 'ana' as const }, aiLabelEnabled: true, merchantOptIn: true };

test('estimativa sem rótulo "estimativa" é recusada; com rótulo passa', async () => {
  await assert.rejects(mk(async () => res(201, { scores: { retention: 80 } })).c.score('p1'), ClientRuleError);
  const r = await mk(async () => res(201, { label: 'estimativa', scores: { retention: 80 } })).c.score('p1'); assert.equal(r.label, 'estimativa');
});
test('live: sem rótulo IA ou sem opt-in não sai do aparelho; com os dois vai com Idempotency-Key', async () => {
  const { c, calls } = mk(async () => res(201, { sessionId: 's1' }));
  await assert.rejects(c.createLive({ ...live, aiLabelEnabled: false }), /ai_label_required/); await assert.rejects(c.createLive({ ...live, merchantOptIn: false }), /merchant_opt_in_required/); assert.equal(calls.length, 0);
  await c.createLive(live); assert.equal(calls.length, 1); assert.equal(calls[0]!.init.headers['idempotency-key'], 'm10-k1'); assert.equal(JSON.parse(calls[0]!.init.body).aiLabelEnabled, true);
});
test('429 da criação de live vira RateLimited; falha de rede repete com a MESMA chave', async () => {
  await assert.rejects(mk(async () => res(429, {}, { 'retry-after': '3600' })).c.createLive(live), (e: any) => e instanceof RateLimited && e.retryAfterSec === 3600);
  let n = 0; const { c, calls } = mk(async () => { if (n++ === 0) throw new Error('net'); return res(202, { sealId: 's' }); });
  await c.applySeal('p1'); assert.equal(calls.length, 2); assert.equal(calls[0]!.init.headers['idempotency-key'], calls[1]!.init.headers['idempotency-key']);
});
test('verificar selo manda os BYTES do MP4 (sem login, sem URL) para /seal/verify', async () => {
  const { c, calls } = mk(async () => res(200, { valid: true, embedded: true }));
  const bytes = new Uint8Array(64); const r = await c.verifyFile(bytes); assert.equal(r.embedded, true);
  assert.equal(calls[0]!.url, 'https://api.example/api/v1/seal/verify'); assert.equal(calls[0]!.init.headers['content-type'], 'video/mp4'); assert.equal(calls[0]!.init.body, bytes); assert.equal(calls[0]!.init.headers.authorization, undefined);
  await assert.rejects(c.verifyFile('https://evil.example/x.mp4' as any), /not_a_video/);
});
test('CTA só https e ordem sem repetidos', async () => {
  assert.equal(isHttpsUrl('https://loja.example/x'), true); for (const u of ['http://x.com', 'javascript:alert(1)', 'https://u:p@x.com', 'nada']) assert.equal(isHttpsUrl(u), false);
  const { c, calls } = mk(async () => res(201, {}));
  await assert.rejects(c.addEpisode('s1', 'p1', { url: 'http://x.com' }), /invalid_cta_url/); await assert.rejects(c.linkEpisodes('s1', ['a', 'a']), /invalid_order/); assert.equal(calls.length, 0);
  await c.addEpisode('s1', 'p1', { url: 'https://loja.example/promo', label: 'Ver' }); assert.deepEqual(JSON.parse(calls[0]!.init.body), { projectId: 'p1', ctaUrl: 'https://loja.example/promo', ctaLabel: 'Ver' });
});
