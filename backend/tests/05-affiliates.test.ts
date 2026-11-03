import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, pool, waitFor, uniq, type Session } from './helpers.js';
import { hmacHex } from '../src/utils/crypto.js';
import { commissionOf } from '../src/modules/affiliates/affiliates.service.js';

let s: Session; let linkId: string;
beforeAll(async () => { await boot(); s = await signup({ plan: 'pro' }); });
afterAll(() => shutdown());
const sign = (raw: string) => hmacHex('aff-secret', raw);
const conv = (body: object, sig?: string) => { const raw = JSON.stringify(body); return http.post('/api/v1/webhooks/affiliates/conversion').set('content-type', 'application/json').set('x-nexus-signature', sig ?? sign(raw)).send(raw); };

describe('5. Afiliados: link → clique → conversão → ganhos', () => {
  it('fórmula de comissão idêntica à do front (6%/5% menos 10% de taxa)', () => { expect(commissionOf('shopee', 10000)).toEqual({ gross: 600, fee: 60, net: 540 }); expect(commissionOf('mercadolivre', 20000)).toEqual({ gross: 1000, fee: 100, net: 900 }); });
  it('conecta conta de afiliado e cria link rastreável', async () => {
    expect((await http.post('/api/v1/affiliates/accounts').set(auth(s)).send({ platform: 'shopee', externalUserId: 'afl-1', token: 'segredo-do-token' })).status).toBe(201);
    expect((await pool.query('SELECT token_enc FROM affiliate_accounts WHERE user_id=$1', [s.id])).rows[0].token_enc).not.toContain('segredo'); // criptografado
    const l = await http.post('/api/v1/affiliates/links').set(auth(s)).send({ platform: 'shopee', originalUrl: 'https://shopee.com.br/produto-1', priceCents: 10000 }); expect(l.status).toBe(201); linkId = l.body.id; expect(l.body.trackingUrl).toContain(`/r/${linkId}`);
    expect((await http.post('/api/v1/affiliates/links').set(auth(s)).send({ platform: 'shopee', originalUrl: 'javascript:alert(1)' })).status).toBe(422);
  });
  it('GET /r/:linkId redireciona 302 sem tocar o banco; cliques são bufferizados e consolidados pelo worker', async () => {
    for (let i = 0; i < 20; i++) { const r = await http.get(`/r/${linkId}`).redirects(0); expect(r.status).toBe(302); expect(r.headers.location).toBe('https://shopee.com.br/produto-1'); }
    expect((await http.get(`/r/${uniq()}`).redirects(0)).status).toBe(404); expect((await http.get('/r/00000000-0000-4000-8000-000000000000').redirects(0)).status).toBe(404);
    await waitFor(async () => (await pool.query('SELECT clicks FROM affiliate_links WHERE id=$1', [linkId])).rows[0].clicks === 20, 20_000);
    expect((await pool.query('SELECT count(*)::int n FROM affiliate_clicks WHERE link_id=$1', [linkId])).rows[0].n).toBe(20); expect((await pool.query('SELECT ip_hash FROM affiliate_clicks WHERE link_id=$1 LIMIT 1', [linkId])).rows[0].ip_hash).toMatch(/^[0-9a-f]{32}$/); // IP só em hash
  });
  it('webhook de conversão: assinatura inválida 401; válido credita 540¢; duplicado não credita de novo', async () => {
    expect((await conv({ linkId, orderId: 'O-1', amountCents: 10000 }, 'deadbeef')).status).toBe(401);
    expect((await conv({ linkId, orderId: 'O-1', amountCents: 10000 })).status).toBe(202); expect((await conv({ linkId, orderId: 'O-1', amountCents: 10000 })).status).toBe(202);
    await waitFor(async () => (await pool.query('SELECT affiliate_balance_cents b FROM users WHERE id=$1', [s.id])).rows[0].b === 540, 20_000);
    await new Promise((r) => setTimeout(r, 400)); expect((await pool.query('SELECT affiliate_balance_cents b FROM users WHERE id=$1', [s.id])).rows[0].b).toBe(540);
    expect((await pool.query('SELECT count(*)::int n FROM affiliate_conversions WHERE link_id=$1', [linkId])).rows[0].n).toBe(1);
    await conv({ linkId, orderId: 'O-2', amountCents: 5000 }); await waitFor(async () => (await pool.query('SELECT affiliate_balance_cents b FROM users WHERE id=$1', [s.id])).rows[0].b === 540 + 270, 20_000);
  });
  it('ganhos: saldo, cliques, conversões e taxa da plataforma', async () => {
    const e = (await http.get('/api/v1/affiliates/earnings').set(auth(s))).body; expect(e).toMatchObject({ balanceCents: 810, clicks: 20, conversions: 2, totalCommissionCents: 810, platformFeePct: 10 });
    expect((await http.get(`/api/v1/affiliates/links/${linkId}/stats`).set(auth(s))).body.daily.length).toBeGreaterThan(0);
    const other = await signup(); expect((await http.get(`/api/v1/affiliates/links/${linkId}/stats`).set(auth(other))).status).toBe(404);
  });
  it('kill switch affiliates_enabled bloqueia criação de links (503)', async () => {
    const { setFlag, invalidateFlags } = await import('../src/modules/flags.service.js'); await setFlag(s.id, 'affiliates_enabled', { enabled: false }); await invalidateFlags();
    const r = await http.post('/api/v1/affiliates/links').set(auth(s)).send({ platform: 'shopee', originalUrl: 'https://shopee.com.br/x' }); expect(r.status).toBe(503);
    await setFlag(s.id, 'affiliates_enabled', { enabled: true }); await invalidateFlags();
  });
});
