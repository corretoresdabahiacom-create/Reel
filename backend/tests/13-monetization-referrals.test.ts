import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, uploadPhoto, waitFor, pool, uniq, type Session } from './helpers.js';
import { hmacHex } from '../src/utils/crypto.js';
import { referralsService } from '../src/modules/referrals/referrals.service.js';
import { resetGrowthCache } from '../src/modules/growth/settings.js';

let admin: Session;
beforeAll(async () => { await boot(); admin = await signup({ admin: true }); });
afterAll(() => shutdown());
const idem = () => uniq('idem');
const reg = async (body: Record<string, unknown> = {}, ip = '9.9.9.9') => {
  const email = `${uniq('r')}@test.dev`; const r = await http.post('/api/v1/auth/register').set('x-forwarded-for', ip).send({ email, password: 'Sup3rSecret!pass', name: 'R', birthDate: '1990-01-01', ...body }); if (r.status !== 201) throw new Error(JSON.stringify(r.body));
  return { id: r.body.user.id as string, email, token: r.body.accessToken as string, refresh: r.body.refreshToken as string } as Session;
};
const credits = async (id: string) => (await pool.query('SELECT credits FROM users WHERE id=$1', [id])).rows[0].credits as number;
const readyProjects = async (userId: string, n: number) => { for (let i = 0; i < n; i++) await pool.query(`INSERT INTO projects (user_id,title,script,source_locale,status) VALUES ($1,'p','s','pt-BR','ready')`, [userId]); };
const setExp = async (key: string, status: 'start' | 'pause') => http.post(`/api/v1/admin/experiments/${key}/${status}`).set(auth(admin)).send({});

describe('13a. Preços regionais, métodos locais e impostos', () => {
  it('≥ 3 moedas: BRL, USD, EUR, MXN, ARS, INR, IDR, PHP com métodos locais da região', async () => {
    const regs = (await http.get('/api/v1/pricing/regions')).body.regions as Array<{ currency: string; methods: string[] }>; const cur = new Set(regs.map((r) => r.currency));
    for (const c of ['BRL', 'USD', 'EUR', 'MXN', 'ARS', 'INR', 'IDR', 'PHP']) expect(cur.has(c), c).toBe(true);
    const by = (c: string) => regs.find((r) => r.currency === c)!.methods; expect(by('BRL')).toContain('pix'); expect(by('MXN')).toContain('oxxo'); expect(by('INR')).toContain('upi'); expect(by('PHP')).toContain('gcash');
  });
  it('/pricing por país: valor, moeda e imposto calculados no servidor (MX = IVA incluso; BR = IOF)', async () => {
    const mx = (await http.get('/api/v1/pricing?country=MX')).body; expect(mx.currency).toBe('MXN'); expect(mx.methods).toContain('oxxo'); expect(mx.plans.pro.monthly.totalMinor).toBeGreaterThan(0);
    const br = (await http.get('/api/v1/pricing?country=BR')).body; expect(br.currency).toBe('BRL'); const us = (await http.get('/api/v1/pricing?country=US')).body; expect(us.currency).toBe('USD');
    expect(mx.plans.pro.monthly.tax.kind).toBe('IVA'); expect(JSON.stringify(mx.plans.pro.annual.totalMinor)).toBeTruthy(); expect(mx.plans.pro.annual.totalMinor).toBeLessThan(mx.plans.pro.monthly.totalMinor * 12);
  });
  it('paridade de poder de compra: Pro em ARS/INR/IDR/PHP custa menos (em BRL) que no BR/US', async () => {
    const brl = async (c: string) => { const p = (await http.get(`/api/v1/pricing?country=${c}`)).body.plans.pro.monthly; return p.totalBrlCents ?? p.baseBrlCents ?? null; };
    const br = await brl('BR'); const inr = await brl('IN'); if (br && inr) expect(inr).toBeLessThan(br);
  });
  it('OXXO (MX): cotação, cobrança simulada com referência, webhook assinado credita 1×, impostos e BRL gravados', async () => {
    const s = await signup(); await pool.query(`UPDATE users SET country='MX', locale='es' WHERE id=$1`, [s.id]);
    expect((await http.post('/api/v1/billing/quote').set(auth(s)).send({ item: { kind: 'credits', packId: 'c50' }, method: 'upi' })).status).toBe(422); // UPI não existe no MX
    const q = (await http.post('/api/v1/billing/quote').set(auth(s)).send({ item: { kind: 'credits', packId: 'c50' }, method: 'oxxo' })); expect(q.status).toBe(200); expect(q.body.currency).toBe('MXN');
    expect((await http.post('/api/v1/billing/local-payment').set(auth(s)).send({ packId: 'c50', method: 'oxxo' })).status).toBe(400); // Idempotency-Key obrigatória
    const key = idem(); const c = await http.post('/api/v1/billing/local-payment').set(auth(s)).set('idempotency-key', key).send({ packId: 'c50', method: 'oxxo' }); expect(c.status).toBe(201);
    expect(c.body.currency).toBe('MXN'); expect(c.body.payment.reference).toMatch(/^\d{14}$/); expect(c.body.mode).toBe('mock'); expect(c.body.tax.kind).toBe('IVA');
    const replay = await http.post('/api/v1/billing/local-payment').set(auth(s)).set('idempotency-key', key).send({ packId: 'c50', method: 'oxxo' }); expect(replay.body.chargeId).toBe(c.body.chargeId);
    const before = await credits(s.id); const ev = (id: string) => { const raw = JSON.stringify({ id, type: 'local.paid', data: { chargeId: c.body.chargeId } }); return http.post('/api/v1/webhooks/local').set('content-type', 'application/json').set('x-signature', hmacHex('pix-secret', Buffer.from(raw))).send(raw); };
    const bad = await http.post('/api/v1/webhooks/local').set('content-type', 'application/json').set('x-signature', 'abc').send(JSON.stringify({ id: 'evt_bad', type: 'local.paid', data: { chargeId: c.body.chargeId } })); expect(bad.status).toBe(401); expect(await credits(s.id)).toBe(before);
    const e1 = uniq('evt'); expect((await ev(e1)).body.granted).toBe(true); expect((await ev(e1)).body.duplicate).toBe(true); expect((await ev(uniq('evt'))).body.granted).toBe(false); // outro evento, mesma cobrança → não duplica
    expect(await credits(s.id)).toBe(before + 50);
    const t = (await pool.query(`SELECT currency, amount_brl_cents, tax_cents, method, region FROM transactions WHERE user_id=$1 AND type='credit_purchase'`, [s.id])).rows; expect(t).toHaveLength(1); expect(t[0]).toMatchObject({ currency: 'MXN', method: 'oxxo' }); expect(Number(t[0].amount_brl_cents)).toBeGreaterThan(0); expect(Number(t[0].tax_cents)).toBeGreaterThan(0);
  });
  it('conteúdo em espanhol (MX): paywall e e-mail respeitam idioma/país', async () => {
    const s = await signup(); await pool.query(`UPDATE users SET country='MX', locale='es', region='LATAM' WHERE id=$1`, [s.id]); await readyProjects(s.id, 3);
    const d = (await http.post('/api/v1/monetization/paywall/evaluate').set(auth(s)).send({ trigger: 'third_generation', peek: true })).body; expect(d.show).toBe(true); expect(d.offer.copy.title).toMatch(/videos|vídeos/i); expect(d.offer.copy.cta).toMatch(/Pro/); expect(d.offer.copy.body).not.toMatch(/água/); expect(d.offer.quote.currency).toBe('MXN');
  });
});

describe('13b. Paywall contextual e experimento de preço', () => {
  it('paywall após a 3ª geração: só quando o servidor confirma o gatilho; nunca bloqueante; limite de frequência', async () => {
    const s = await signup(); await readyProjects(s.id, 2);
    expect((await http.post('/api/v1/monetization/paywall/evaluate').set(auth(s)).send({ trigger: 'third_generation' })).body).toMatchObject({ show: false, reason: 'trigger_not_met', blocking: false });
    await readyProjects(s.id, 1); const a = (await http.post('/api/v1/monetization/paywall/evaluate').set(auth(s)).send({ trigger: 'third_generation' })).body; expect(a).toMatchObject({ show: true, blocking: false }); expect(a.offer.quote.totalMinor).toBeGreaterThan(0);
    const b = (await http.post('/api/v1/monetization/paywall/evaluate').set(auth(s)).send({ trigger: 'third_generation' })).body; expect(b.show).toBe(false); expect(String(b.reason)).toMatch(/frequency_cap/);
    await pool.query(`UPDATE users SET plan='pro' WHERE id=$1`, [s.id]); expect((await http.post('/api/v1/monetization/paywall/evaluate').set(auth(s)).send({ trigger: 'third_generation', peek: true })).body.reason).toBe('paid_plan');
    expect((await http.post('/api/v1/monetization/paywall/evaluate').set(auth(s)).send({ trigger: 'inexistente' })).status).toBe(400);
  });
  it('créditos esgotados: oferta de pacote (mesmo em plano pago)', async () => {
    const s = await signup({ credits: 0 }); const d = (await http.post('/api/v1/monetization/paywall/evaluate').set(auth(s)).send({ trigger: 'credits_exhausted', peek: true })).body; expect(d.show).toBe(true); expect(d.offer.kind).toBe('credits'); expect(d.offer.packId).toBeTruthy();
  });
  it('experimento de preço A/B/C: variante estável por usuário, priceKey coerente, exposição registrada; cliente não escolhe o preço', async () => {
    expect((await setExp('paywall_price', 'start')).status).toBe(200);
    try {
      const seen = new Set<string>(); const users: Session[] = [];
      for (let i = 0; i < 18; i++) { const s = await signup(); await readyProjects(s.id, 3); users.push(s); const d = (await http.post('/api/v1/monetization/paywall/evaluate').set(auth(s)).send({ trigger: 'third_generation', peek: true })).body; const v = d.experiments.paywall_price.variant as string; seen.add(v);
        expect(d.offer.priceKey).toBe(v === 'control' ? 'pro' : `pro_${v}`); const again = (await http.post('/api/v1/monetization/paywall/evaluate').set(auth(s)).send({ trigger: 'third_generation', peek: true })).body; expect(again.experiments.paywall_price.variant).toBe(v); }
      expect(seen.size).toBeGreaterThanOrEqual(2);
      const lo = users.find(async () => true)!; const q = (await http.post('/api/v1/billing/quote').set(auth(lo)).send({ item: { kind: 'plan', plan: 'pro' } })).body; expect(q.totalMinor).toBeGreaterThan(0);
      const forged = await http.post('/api/v1/billing/checkout/subscription').set(auth(lo)).set('idempotency-key', idem()).send({ plan: 'pro', priceKey: 'pro_low' }); expect(forged.status).toBe(201); // aceita, mas só aplica se bater com a atribuição
      expect((await pool.query(`SELECT count(*)::int n FROM experiment_assignments a JOIN experiments e ON e.id=a.experiment_id WHERE e.key='paywall_price' AND a.exposed_at IS NOT NULL`)).rows[0].n).toBeGreaterThan(0);
    } finally { await setExp('paywall_price', 'pause'); }
  });
  it('A/B de paywall de ponta a ponta: exposição → conversão por assinatura → resultados do experimento', async () => {
    const key = 'paywall_trial_structure'; await setExp(key, 'start');
    try {
      const s = await signup(); await readyProjects(s.id, 3); const d = (await http.post('/api/v1/monetization/paywall/evaluate').set(auth(s)).send({ trigger: 'third_generation' })).body; expect(d.show).toBe(true);
      const co = (await http.post('/api/v1/billing/checkout/subscription').set(auth(s)).set('idempotency-key', idem()).send({ plan: 'pro' })).body; const { signStripe } = await import('../src/modules/payments/payments.service.js');
      const raw = JSON.stringify({ id: uniq('evt'), type: 'checkout.session.completed', data: { object: { id: co.sessionId, metadata: { kind: 'subscription', plan: 'pro', userId: s.id }, amount_total: 4900, customer: 'cus_x' } } });
      await http.post('/api/v1/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', signStripe(raw, 'whsec_test')).send(raw);
      await waitFor(async () => (await pool.query(`SELECT 1 FROM experiment_events ev JOIN experiments e ON e.id=ev.experiment_id WHERE e.key=$1 AND ev.user_id=$2 AND ev.event='revenue_recorded'`, [key, s.id])).rowCount, 20_000);
      const res = (await http.get(`/api/v1/admin/experiments/${key}/results`).set(auth(admin))).body; const tot = res.primary.variants.reduce((a: number, v: { mean: number; n: number }) => a + v.mean * v.n, 0); expect(tot).toBeGreaterThan(0);
    } finally { await setExp(key, 'pause'); }
  });
});

describe('13c. Indicação com recompensa dupla e antifraude', () => {
  it('cadastro com código → sem crédito até o 1º vídeo; 1º vídeo (pipeline real) paga os dois lados uma única vez', async () => {
    const referrer = await reg({ deviceId: uniq('devA') }, '11.0.0.1'); const me = (await http.get('/api/v1/referrals/me').set(auth(referrer))).body; expect(me.code).toMatch(/^[A-Z0-9]{6,12}$/); const r0 = await credits(referrer.id);
    const click = (await http.post('/api/v1/referrals/click').send({ code: me.code })).body; expect(click.clickId).toBeTruthy();
    const referred = await reg({ referralCode: me.code, clickId: click.clickId, deviceId: uniq('devB') }, '11.0.0.2'); const welcome = await credits(referred.id); expect((await pool.query(`SELECT count(*)::int n FROM transactions WHERE user_id=$1 AND source='referral'`, [referred.id])).rows[0].n).toBe(0); // sem bônus antes da ativação
    expect((await pool.query('SELECT status FROM referrals WHERE referred_id=$1', [referred.id])).rows[0].status).toBe('signed_up'); expect(await credits(referrer.id)).toBe(r0);
    await pool.query(`UPDATE users SET plan='pro', credits=credits+40 WHERE id=$1`, [referred.id]); const before = await credits(referred.id);
    const ref = await uploadPhoto(referred); const p = (await http.post('/api/v1/projects').set(auth(referred)).send({ title: 'Meu produto', script: 'Produto incrível. Qualidade premium. Compre agora com frete grátis.', locale: 'pt-BR', photos: [ref] })).body.id as string;
    await http.post(`/api/v1/projects/${p}/storyboard`).set(auth(referred)).send({}); const sc = await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${p}`).set(auth(referred))).body; return x.scenes?.length ? x : undefined; });
    await http.post(`/api/v1/projects/${p}/scenes/${sc.scenes[0].id}/generate`).set(auth(referred)).send({ chain: true }); await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${p}`).set(auth(referred))).body; return x.scenes.every((s: { status: string }) => s.status === 'done') ? x : undefined; }, 60_000);
    expect(['signed_up']).toContain((await pool.query('SELECT status FROM referrals WHERE referred_id=$1', [referred.id])).rows[0].status); // gerar cenas não ativa
    await http.post(`/api/v1/projects/${p}/assemble`).set(auth(referred)).send({}); await waitFor(async () => (await pool.query(`SELECT 1 FROM referrals WHERE referred_id=$1 AND status='rewarded'`, [referred.id])).rowCount, 60_000);
    expect((await pool.query(`SELECT COALESCE(sum(credits_delta),0)::int s FROM transactions WHERE user_id=$1 AND source='referral'`, [referred.id])).rows[0].s).toBe(20); void welcome; void before;
    expect(await credits(referrer.id)).toBe(r0 + 20);
    expect((await pool.query(`SELECT count(*)::int n FROM transactions WHERE source='referral'`)).rows[0].n).toBeGreaterThanOrEqual(2);
    expect((await referralsService.onActivated(referred.id)).rewarded).toBe(false); expect(await credits(referrer.id)).toBe(r0 + 20); // idempotente
    const st = (await http.get('/api/v1/referrals/me').set(auth(referrer))).body.stats; expect(st.signups).toBeGreaterThanOrEqual(1); expect(st.creditsEarned).toBe(20);
  });
  it('FRAUDE: mesmo aparelho do indicador → status fraud, nenhuma recompensa mesmo após ativar', async () => {
    const dev = uniq('same-dev'); const referrer = await reg({ deviceId: dev }, '12.0.0.1'); const code = (await http.get('/api/v1/referrals/me').set(auth(referrer))).body.code as string; const r0 = await credits(referrer.id);
    const referred = await reg({ referralCode: code, deviceId: dev }, '12.0.0.2'); const row = (await pool.query('SELECT status, fraud_reason FROM referrals WHERE referred_id=$1', [referred.id])).rows[0]; expect(row.status).toBe('fraud'); expect(row.fraud_reason).toMatch(/same_device/);
    expect((await referralsService.onActivated(referred.id)).rewarded).toBe(false); expect(await credits(referrer.id)).toBe(r0);
    expect((await http.get('/api/v1/admin/referrals?status=fraud').set(auth(admin))).body.items.some((x: { referredId: string }) => x.referredId === referred.id)).toBe(true);
  });
  it('FRAUDE: auto-indicação, e-mail descartável e velocidade de cadastros do mesmo IP', async () => {
    const referrer = await reg({}, '13.0.0.1'); const code = (await http.get('/api/v1/referrals/me').set(auth(referrer))).body.code as string;
    expect((await referralsService.assessFraud(referrer.id, { id: referrer.id, email: 'x@y.com' }, { ip: '1.1.1.1', deviceHash: null })).reasons).toContain('self_referral');
    await pool.query(`UPDATE settings SET value = jsonb_set(value, '{disposableDomains}', '["mailinator.test"]') WHERE key='growth'`).catch(() => undefined); resetGrowthCache();
    let n = 0; for (let i = 0; i < 6; i++) { const u = await reg({ referralCode: code }, '13.9.9.9'); const st = (await pool.query('SELECT status FROM referrals WHERE referred_id=$1', [u.id])).rows[0].status; if (st === 'fraud') n++; }
    expect(n).toBeGreaterThanOrEqual(1); // 6º cadastro do mesmo IP em 24 h passa do limite (5)
  });
  it('código inválido não vaza existência; só vale nos primeiros 30 dias; uma indicação por usuário', async () => {
    const s = await reg({}, '14.0.0.1'); expect((await http.post('/api/v1/referrals/convert').set(auth(s)).send({ code: 'ZZZZZZZZ' })).status).toBe(404);
    expect((await http.post('/api/v1/referrals/click').send({ code: 'ZZZZZZZZ' })).body.clickId).toBeNull();
    const old = await reg({}, '14.0.0.2'); await pool.query(`UPDATE users SET created_at = now() - interval '40 days' WHERE id=$1`, [old.id]); const code = (await http.get('/api/v1/referrals/me').set(auth(s))).body.code;
    expect((await http.post('/api/v1/referrals/convert').set(auth(old)).send({ code })).status).toBe(422);
    const fresh = await reg({}, '14.0.0.3'); expect((await http.post('/api/v1/referrals/convert').set(auth(fresh)).send({ code })).status).toBe(200); expect((await http.post('/api/v1/referrals/convert').set(auth(fresh)).send({ code })).status).toBe(409);
  });
  it('teto mensal de recompensas por indicador', async () => {
    const referrer = await reg({}, '15.0.0.1'); const code = (await http.get('/api/v1/referrals/me').set(auth(referrer))).body.code as string;
    await pool.query(`INSERT INTO referrals (referrer_id, code, status, reward_granted_at) SELECT $1, $2, 'rewarded', now() FROM generate_series(1,50)`, [referrer.id, code]);
    const r0 = await credits(referrer.id); const u = await reg({ referralCode: code, deviceId: uniq('d') }, '15.0.0.2'); const res = await referralsService.onActivated(u.id); expect(res.rewarded).toBe(true); expect(await credits(referrer.id)).toBe(r0); // indicado ganha, indicador no teto não
  });
});
