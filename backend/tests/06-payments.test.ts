import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, pool, waitFor, uniq, type Session } from './helpers.js';
import { signStripe } from '../src/modules/payments/payments.service.js';
import { hmacHex } from '../src/utils/crypto.js';

let s: Session; let admin: Session;
beforeAll(async () => { await boot(); s = await signup(); admin = await signup({ admin: true }); });
afterAll(() => shutdown());
const k = () => uniq('idem-key');
const stripeEvent = (id: string, type: string, object: object, sig?: string) => { const raw = JSON.stringify({ id, type, data: { object } }); return http.post('/api/v1/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', sig ?? signStripe(raw)).send(raw); };
const userRow = async (id: string) => (await pool.query('SELECT plan, credits, subscription_status, affiliate_balance_cents a, marketplace_balance_cents m FROM users WHERE id=$1', [id])).rows[0];

describe('6. Pagamentos: assinatura, créditos, Pix, saques, transações', () => {
  it('catálogo público de planos/pacotes', async () => { const c = (await http.get('/api/v1/billing/catalog')).body; expect(c.plans.map((p: { id: string }) => p.id)).toEqual(['pro', 'business']); expect(c).toMatchObject({ minPayoutCents: 5000, autoApproveBelowCents: 50000, creditValueCents: 38 }); });
  it('checkout exige Idempotency-Key; assinatura Pro ativada só por webhook assinado (idempotente)', async () => {
    expect((await http.post('/api/v1/billing/checkout/subscription').set(auth(s)).send({ plan: 'pro' })).status).toBe(400);
    const c = await http.post('/api/v1/billing/checkout/subscription').set(auth(s)).set('idempotency-key', k()).send({ plan: 'pro' }); expect(c.status).toBe(201); expect(c.body.mode).toBe('mock'); expect((await userRow(s.id)).plan).toBe('free'); // criar sessão não ativa nada
    const obj = { id: c.body.sessionId, metadata: { kind: 'subscription', plan: 'pro', userId: s.id }, amount_total: 4900, customer: 'cus_1' };
    expect((await stripeEvent('evt_bad', 'checkout.session.completed', obj, 't=1,v1=abc')).status).toBe(401); expect((await userRow(s.id)).plan).toBe('free');
    expect((await stripeEvent('evt_sub1', 'checkout.session.completed', obj)).body.duplicate).toBe(false); expect((await stripeEvent('evt_sub1', 'checkout.session.completed', obj)).body.duplicate).toBe(true);
    await waitFor(async () => (await userRow(s.id)).plan === 'pro', 20_000); expect((await userRow(s.id)).subscription_status).toBe('active');
    expect((await pool.query(`SELECT count(*)::int n FROM transactions WHERE user_id=$1 AND type='subscription'`, [s.id])).rows[0].n).toBe(1);
    // mesmo checkout reenviado com outro event id → ainda 1 transação (UNIQUE source+external_ref)
    await stripeEvent('evt_sub1b', 'checkout.session.completed', obj); await new Promise((r) => setTimeout(r, 500)); expect((await pool.query(`SELECT count(*)::int n FROM transactions WHERE user_id=$1 AND type='subscription'`, [s.id])).rows[0].n).toBe(1);
  });
  it('timestamp antigo do Stripe é rejeitado (replay)', async () => { const raw = JSON.stringify({ id: 'evt_old', type: 'x', data: { object: {} } }); const r = await http.post('/api/v1/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', signStripe(raw, 'whsec_test', Math.floor(Date.now() / 1000) - 3600)).send(raw); expect(r.status).toBe(401); });
  it('compra de créditos: Stripe + Pix (mock) somam créditos uma vez e registram transações', async () => {
    const before = (await userRow(s.id)).credits;
    const c = await http.post('/api/v1/billing/checkout/credits').set(auth(s)).set('idempotency-key', k()).send({ packId: 'p50' }); await stripeEvent('evt_cr1', 'checkout.session.completed', { id: c.body.sessionId, metadata: { kind: 'credits', packId: 'p50', userId: s.id }, amount_total: 1900 });
    await waitFor(async () => (await userRow(s.id)).credits === before + 50, 20_000);
    const px = await http.post('/api/v1/billing/pix').set(auth(s)).set('idempotency-key', k()).send({ packId: 'p120' }); expect(px.status).toBe(201); expect(px.body.copyPaste).toContain('MOCKPIX');
    const raw = JSON.stringify({ id: 'pix-evt-1', type: 'pix.paid', data: { chargeId: px.body.chargeId } }); const send = (sig: string) => http.post('/api/v1/webhooks/pix').set('content-type', 'application/json').set('x-signature', sig).send(raw);
    expect((await send('bad')).status).toBe(401); expect((await send(hmacHex('pix-secret', raw))).status).toBe(200); await send(hmacHex('pix-secret', raw));
    await waitFor(async () => (await userRow(s.id)).credits === before + 170, 20_000); await new Promise((r) => setTimeout(r, 400)); expect((await userRow(s.id)).credits).toBe(before + 170);
    const tx = (await http.get('/api/v1/billing/transactions').set(auth(s))).body.items; expect(tx.map((t: { type: string }) => t.type)).toEqual(expect.arrayContaining(['subscription', 'credit_purchase'])); expect(tx.filter((t: { type: string; source: string }) => t.type === 'credit_purchase' && t.source === 'pix')).toHaveLength(1);
  });
  it('cancelamento da assinatura volta ao Free', async () => { await stripeEvent('evt_cancel', 'customer.subscription.deleted', { metadata: { userId: s.id } }); await waitFor(async () => (await userRow(s.id)).plan === 'free', 20_000); });
  it('saque: mínimo R$50, saldo insuficiente, < R$500 auto-aprovado e pago, ≥ R$500 pendente → admin aprova/rejeita (estorno)', async () => {
    await pool.query('UPDATE users SET affiliate_balance_cents=200000 WHERE id=$1', [s.id]); const P = (amountCents: number, source = 'affiliate') => http.post('/api/v1/payouts').set(auth(s)).set('idempotency-key', k()).send({ source, amountCents });
    expect((await P(4999)).status).toBe(422); expect((await P(999999)).status).toBe(402);
    const auto = await P(30000); expect(auto.status).toBe(201); expect(auto.body.status).toBe('paid'); expect(auto.body.gatewayRef).toMatch(/^tr_mock_/); expect((await userRow(s.id)).a).toBe(170000);
    const big = await P(60000); expect(big.body.status).toBe('pending'); expect((await userRow(s.id)).a).toBe(110000); // saldo reservado
    expect((await http.post(`/api/v1/admin/payouts/${big.body.id}/decision`).set(auth(s)).send({ approve: true })).status).toBe(403);
    const ap = await http.post(`/api/v1/admin/payouts/${big.body.id}/decision`).set(auth(admin)).send({ approve: true }); expect(ap.body.status).toBe('paid'); expect((await http.post(`/api/v1/admin/payouts/${big.body.id}/decision`).set(auth(admin)).send({ approve: true })).status).toBe(409);
    const big2 = await P(70000); const rj = await http.post(`/api/v1/admin/payouts/${big2.body.id}/decision`).set(auth(admin)).send({ approve: false, reason: 'dados inválidos' }); expect(rj.body.status).toBe('rejected'); expect((await userRow(s.id)).a).toBe(40000 + 70000); // estornado
    expect((await pool.query(`SELECT action FROM audit_logs WHERE target_id=$1 ORDER BY created_at`, [big.body.id])).rows.map((r) => r.action)).toEqual(expect.arrayContaining(['payout.request', 'payout.approved']));
    expect((await http.get('/api/v1/payouts').set(auth(s))).body.items.length).toBe(3);
  });
  it('saques concorrentes não gastam o mesmo saldo duas vezes', async () => {
    const u = await signup(); await pool.query('UPDATE users SET marketplace_balance_cents=10000 WHERE id=$1', [u.id]);
    const rs = await Promise.all(Array.from({ length: 4 }, () => http.post('/api/v1/payouts').set(auth(u)).set('idempotency-key', k()).send({ source: 'marketplace', amountCents: 6000 }))); expect(rs.filter((r) => r.status === 201).length).toBe(1); expect((await userRow(u.id)).m).toBe(4000);
  });
  it('admin: métricas de negócio (MRR, receita, filas) e ajuste de créditos auditado', async () => {
    const m = (await http.get('/api/v1/admin/metrics').set(auth(admin))).body; expect(m).toHaveProperty('mrrCents'); expect(m.revenue.creditsSales).toBeGreaterThanOrEqual(1900 + 4500); expect(m.queues).toBeTruthy(); expect((await http.get('/api/v1/admin/metrics').set(auth(s))).status).toBe(403);
    const u = await signup(); const c0 = (await userRow(u.id)).credits; const p = await http.patch(`/api/v1/admin/users/${u.id}`).set(auth(admin)).send({ creditsDelta: 25, plan: 'pro' }); expect(p.body).toMatchObject({ credits: c0 + 25, plan: 'pro' }); expect((await http.patch(`/api/v1/admin/users/${u.id}`).set(auth(admin)).send({ banned: true })).body.banned).toBe(true);
    expect((await http.get('/api/v1/users/me').set(auth(u))).status).toBe(403); // banido perde acesso imediatamente
    expect((await http.get('/api/v1/admin/audit-logs').query({ action: 'admin.user_patch' }).set(auth(admin))).body.items.length).toBeGreaterThanOrEqual(2);
  });
});
