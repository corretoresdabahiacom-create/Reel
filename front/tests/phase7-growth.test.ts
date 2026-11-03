import test from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsClient, sanitizeProps, ExperimentClient, createHooks, paywall, referral, share, utmFromUrl, waitlist, type Http } from '../src/services/growth';

const rec = (resp: (m: string, p: string, b?: any) => any = () => ({ status: 202, body: {} })) => { const calls: any[] = []; const http: Http = async (m, p, b) => { calls.push({ m, p, b }); return resp(m, p, b); }; return { http, calls }; };

test('analytics: sem consentimento nada é enfileirado nem enviado', async () => { const { http, calls } = rec(); const a = new AnalyticsClient(http, { anonId: 'anon-12345', sessionId: 's1' }); a.track('project_created'); await a.flush(); assert.equal(a.pending, 0); assert.equal(calls.length, 0); });
test('analytics: lote por tamanho, PII removida, eventId único', async () => {
  const { http, calls } = rec(); const a = new AnalyticsClient(http, { anonId: 'anon-12345', sessionId: 's1', batchSize: 3 }); a.setConsent(true);
  a.track('a', { email: 'x@y.com', ok: 1 }); a.track('b', { note: 'fale com joao@x.com', k: 2 }); a.track('c'); await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls.length, 1); const ev = calls[0].b.events; assert.equal(ev.length, 3); assert.deepEqual(ev[0].props, { ok: 1 }); assert.deepEqual(ev[1].props, { k: 2 }); assert.equal(new Set(ev.map((e: any) => e.eventId)).size, 3);
});
test('analytics: falha de rede/5xx recoloca na fila; 4xx descarta; revogar consentimento limpa a fila', async () => {
  let status = 503; const { http } = rec(() => ({ status, body: {} })); const a = new AnalyticsClient(http, { anonId: 'anon-12345', sessionId: 's2', batchSize: 99 }); a.setConsent(true); a.track('x'); await a.flush(); assert.equal(a.pending, 1);
  status = 400; await a.flush(); assert.equal(a.pending, 0); a.track('y'); a.setConsent(false); assert.equal(a.pending, 0);
  const down: Http = async () => null; const b = new AnalyticsClient(down, { anonId: 'anon-12345', sessionId: 's3' }); b.setConsent(true); b.track('z'); await b.flush(); assert.equal(b.pending, 1);
});
test('analytics: fila limitada (maxQueue) descarta os mais antigos', () => { const { http } = rec(); const a = new AnalyticsClient(http, { anonId: 'anon-12345', sessionId: 's4', batchSize: 1000, maxQueue: 5 }); a.setConsent(true); for (let i = 0; i < 9; i++) a.track('e' + i); assert.equal(a.pending, 5); a.setConsent(false); });
test('sanitizeProps remove chaves de PII', () => assert.deepEqual(sanitizeProps({ cpf: '1', Email: 'a', nome: 'x', plan: 'pro' }), { plan: 'pro' }));

test('experimentos: sem cache => controle (sem flicker); preload preenche; exposição uma vez por sessão', async () => {
  const { http, calls } = rec((m, p) => p.endsWith('/active') ? { status: 200, body: { experiments: [{ key: 'paywall_copy', variant: 'b', payload: { copy: 'x' } }] } } : { status: 200, body: { variant: 'b', payload: { copy: 'x' } } });
  const c = new ExperimentClient(http); assert.equal(c.variant('paywall_copy'), 'control'); let notified = 0; c.subscribe(() => notified++); await c.preload(); assert.equal(c.variant('paywall_copy'), 'b'); assert.ok(notified >= 1);
  await c.expose('paywall_copy'); await c.expose('paywall_copy'); assert.equal(calls.filter((x) => x.p.endsWith('/assign')).length, 1); assert.deepEqual(c.debug(), [{ key: 'paywall_copy', variant: 'b', exposed: true }]);
});
test('experimentos: servidor fora do ar => controle/fallback configurado, sem exceção', async () => { const c = new ExperimentClient(async () => null, { k: 'safe' }); assert.equal(c.variant('k'), 'safe'); assert.equal(await c.expose('outro'), 'control'); await c.convert('outro', 'x'); });
test('hooks: useVariant lê do cliente via useSyncExternalStore', () => { const c = new ExperimentClient(async () => null, { k: 'v1' }); const R = { useSyncExternalStore: (_s: any, get: () => string) => get(), useEffect: (f: () => void) => f() }; const h = createHooks(R, c); assert.equal(h.useVariant('k'), 'v1'); assert.equal(h.useExperiment('k').variant, 'v1'); });

test('paywall: falha => não mostra; resposta => repassa oferta/priceKey', async () => {
  assert.deepEqual(await paywall.evaluate(async () => null, 'generation_3'), { show: false, reason: 'unavailable' });
  const { http, calls } = rec(() => ({ status: 200, body: { show: true, reason: 'trigger', priceKey: 'pro_low', offer: { plan: 'pro' } } })); const d = await paywall.evaluate(http, 'generation_3', true); assert.equal(d.show, true); assert.equal(d.priceKey, 'pro_low'); assert.deepEqual(calls[0].b, { trigger: 'generation_3', peek: true });
});
test('referral/share/utm/waitlist helpers', async () => {
  assert.equal(referral.link('https://nexusreel.app/', 'AB12CD', 'whatsapp'), 'https://nexusreel.app/ref/AB12CD?utm_source=referral&utm_medium=whatsapp');
  assert.ok(share.text('https://nexusreel.app/v/1', 'Olha!', 'tiktok').includes('utm_medium=tiktok')); assert.deepEqual(utmFromUrl('?utm_source=meta&utm_campaign=c1&x=1'), { utm_source: 'meta', utm_campaign: 'c1' });
  const { http, calls } = rec(); await waitlist.join(http, 'a@b.com', 'REF1', { utm_source: 'pr' }); assert.deepEqual(calls[0].b, { email: 'a@b.com', ref: 'REF1', utm: { utm_source: 'pr' } });
});
