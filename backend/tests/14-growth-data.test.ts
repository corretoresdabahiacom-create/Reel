import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { boot, shutdown, http, signup, auth, pool, uniq, waitFor, type Session } from './helpers.js';
import { env } from '../src/config/env.js';
import { signStripe } from '../src/modules/payments/payments.service.js';
import { pseudo, track } from '../src/modules/analytics/analytics.service.js';
import { validateEvent, EVENTS } from '../src/modules/analytics/taxonomy.js';
import { attribute, MODELS, type Touch } from '../src/modules/attribution/models.js';
import { classify } from '../src/modules/attribution/attribution.service.js';
import { forecastDaily, projectMonth } from '../src/modules/datascience/forecast.js';
import { datascienceService, fillDaily } from '../src/modules/datascience/datascience.service.js';
import { warehouseService } from '../src/modules/datascience/warehouse.service.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';
import { setFlag } from '../src/modules/flags.service.js';
import { redis } from '../src/db/redis.js';

let admin: Session; const t0 = new Date(Date.now() - 2000);
beforeAll(async () => { await boot(); admin = await signup({ admin: true }); });
afterAll(() => shutdown());
const reg = async (body: Record<string, unknown> = {}) => { const email = `${uniq('g')}@test.dev`; const r = await http.post('/api/v1/auth/register').send({ email, password: 'Sup3rSecret!pass', name: 'G', birthDate: '1990-01-01', ...body }); if (r.status !== 201) throw new Error(JSON.stringify(r.body)); return { id: r.body.user.id as string, email, token: r.body.accessToken as string, refresh: r.body.refreshToken as string } as Session; };
const consent = (s: Session, accepted: boolean, type = 'cookies') => http.post('/api/v1/users/me/consents').set(auth(s)).send({ items: [{ type, accepted }] });
const stripeEvt = (object: object, type = 'checkout.session.completed') => { const raw = JSON.stringify({ id: uniq('evt'), type, data: { object } }); return http.post('/api/v1/webhooks/stripe').set('content-type', 'application/json').set('stripe-signature', signStripe(raw)).send(raw); };
const buyCredits = async (s: Session, pack = 'p50', cents = 2500) => { const c = (await http.post('/api/v1/billing/checkout/credits').set(auth(s)).set('idempotency-key', uniq('i')).send({ packId: pack })).body; await stripeEvt({ id: c.sessionId, amount_total: cents, metadata: { kind: 'credits', packId: pack, userId: s.id } }); await waitFor(async () => (await pool.query(`SELECT 1 FROM transactions WHERE user_id=$1 AND type='credit_purchase'`, [s.id])).rowCount, 20_000); };

describe('14a. Analytics: taxonomia, consentimento, PII, pseudonimização', () => {
  it('taxonomia: evento só de servidor vindo do client é rejeitado; desconhecido vai para quarentena; PII é rejeitada', async () => {
    expect(validateEvent('subscription_started', { plan: 'pro' }, 'client').ok).toBe(false); expect(validateEvent('evento_novo_xyz', { a: 1 }, 'client')).toMatchObject({ ok: true, quarantine: true });
    expect(validateEvent('photo_idea_used', { idea_id: 'i1', category: 'moda' }, 'client')).toMatchObject({ ok: true, quarantine: false }); expect(validateEvent('photo_idea_used', { idea_id: 'x', email: 'a@b.com' }, 'client').ok).toBe(false);
    expect(validateEvent('photo_idea_used', { idea_id: 'contato joao@gmail.com' }, 'client').ok).toBe(false); expect(validateEvent('photo_idea_used', { idea_id: 'x', cpf: '1' }, 'client').ok).toBe(false);
    expect(Object.keys(EVENTS).length).toBeGreaterThan(30);
  });
  it('ingestão HTTP: lote misto, deduplicação por eventId, anônimo sem identificadores', async () => {
    const eid = crypto.randomUUID(); const body = { anonId: 'anon-12345678', events: [{ name: 'photo_idea_viewed', props: { idea_id: 'a', category: 'moda' } }, { name: 'subscription_started', props: { plan: 'pro' } }, { name: 'photo_idea_used', props: { idea_id: 'a', email: 'x@y.com' } }, { name: 'novo_evento_exp', props: { k: 'v' } }, { name: 'photo_idea_viewed', eventId: eid, props: { idea_id: 'dup' } }] };
    const r = await http.post('/api/v1/analytics/events').send(body); expect(r.status).toBe(202); expect(r.body.accepted).toBe(3); expect(r.body.quarantined).toBe(1); expect(r.body.rejected.map((x: { index: number }) => x.index).sort()).toEqual([1, 2]);
    await http.post('/api/v1/analytics/events').send({ events: [{ name: 'photo_idea_viewed', eventId: eid, props: { idea_id: 'dup' } }] }); expect((await pool.query(`SELECT count(*)::int n FROM analytics_events WHERE event_id=$1`, [eid])).rows[0].n).toBe(1);
    const row = (await pool.query(`SELECT user_id, pseudo_id, anon_id FROM analytics_events WHERE event_id=$1`, [eid])).rows[0]; expect(row.user_id).toBeNull(); expect(row.pseudo_id).toBeNull();
    expect((await http.post('/api/v1/analytics/events').send({ events: [] })).status).toBe(400);
  });
  it('autenticado SEM consentimento de cookies: sem user_id/pseudo_id; COM consentimento: pseudo_id = HMAC(sal, user_id)', async () => {
    const s = await reg(); const e1 = crypto.randomUUID(); await http.post('/api/v1/analytics/events').set(auth(s)).send({ events: [{ name: 'photo_idea_viewed', eventId: e1, props: { idea_id: 'a' } }] });
    expect((await pool.query('SELECT user_id, pseudo_id FROM analytics_events WHERE event_id=$1', [e1])).rows[0]).toMatchObject({ user_id: null, pseudo_id: null });
    await consent(s, true); const e2 = crypto.randomUUID(); await http.post('/api/v1/analytics/events').set(auth(s)).send({ events: [{ name: 'photo_idea_viewed', eventId: e2, props: { idea_id: 'b' } }] });
    const row = (await pool.query('SELECT user_id, pseudo_id FROM analytics_events WHERE event_id=$1', [e2])).rows[0]; expect(row.user_id).toBe(s.id); expect(row.pseudo_id).toBe(pseudo(s.id)); expect(row.pseudo_id).not.toContain(s.id);
  });
  it('analytics nunca bloqueia: evento inválido/props gigantes não lançam e o fluxo de negócio segue', async () => {
    await expect(track(null, 'subscription_started', { plan: { nested: true } as never })).resolves.toBeUndefined(); await expect(track('nao-e-uuid', 'revenue_recorded', {})).resolves.toBeUndefined();
  });
  it('exportação para o "warehouse": só pseudo_id (sem user_id/e-mail), quarentena separada, cursor incremental, tombstone de eliminação, SLA de frescor', async () => {
    const dir = env.WAREHOUSE_EXPORT_DIR; if (existsSync(dir)) rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); await redis.del('warehouse:cursor:events');
    const s = await reg(); await consent(s, true); await track(s.id, 'project_created', { project_id: 'p1', photos: 2 }); await http.post('/api/v1/analytics/events').send({ events: [{ name: 'evento_quarentena', props: { x: 1 } }] });
    const r = await warehouseService.exportEvents({ batch: 100000 }); expect(r.exported).toBeGreaterThan(0); expect(r.quarantined).toBeGreaterThanOrEqual(1);
    const files = readdirSync(dir); const ev = files.find((f) => f.startsWith('events-'))!; const lines = readFileSync(join(dir, ev), 'utf8').trim().split('\n').map((l) => JSON.parse(l)); expect(lines.length).toBe(r.exported);
    const raw = readFileSync(join(dir, ev), 'utf8'); expect(raw).not.toContain(s.id); expect(raw).not.toContain(s.email); expect(raw).not.toMatch(/"user_id"/); expect(lines.some((l) => l.pseudo_id === pseudo(s.id))).toBe(true);
    expect(files.some((f) => f.startsWith('quarantine-'))).toBe(true); expect((await warehouseService.exportEvents()).exported).toBe(0); // incremental
    const fr = await warehouseService.freshness(); expect(fr.ok).toBe(true); expect(fr.minutes).toBeLessThanOrEqual(1);
    // LGPD: eliminação gera tombstone com o pseudo_id para o warehouse
    await complianceService.hardDelete(s.id); expect((await pool.query('SELECT 1 FROM erasure_queue WHERE pseudo_id=$1 AND processed_at IS NULL', [pseudo(s.id)])).rowCount).toBe(1);
    const er = await warehouseService.applyErasures(); expect(er.processed).toBeGreaterThanOrEqual(1); expect(readFileSync(join(dir, readdirSync(dir).find((f) => f.startsWith('erasure-'))!), 'utf8')).toContain(pseudo(s.id));
    expect((await pool.query('SELECT count(*)::int n FROM analytics_events WHERE user_id=$1', [s.id])).rows[0].n).toBe(0);
  });
  it('endpoints admin de taxonomia/frescor exigem admin', async () => {
    const u = await reg(); expect((await http.get('/api/v1/admin/analytics/taxonomy').set(auth(u))).status).toBe(403); const t = (await http.get('/api/v1/admin/analytics/taxonomy').set(auth(admin))).body; expect(t.version).toBeGreaterThanOrEqual(1); expect(t.events.length).toBeGreaterThan(30);
  });
});

describe('14b. Atribuição multi-touch, UTM e waitlist/GTM', () => {
  const T = (source: string, daysAgo: number, now = new Date('2026-06-30T12:00:00Z')): Touch => ({ source, medium: 'x', campaign: 'c', at: new Date(now.getTime() - daysAgo * 86_400_000) });
  it('modelos: soma dos créditos = valor; last_non_direct ignora direct; U-shaped 40/20/40', () => {
    const now = new Date('2026-06-30T12:00:00Z'); const touches = [T('tiktok', 20), T('youtube', 10), T('instagram', 3), T('direct', 0)];
    for (const m of MODELS) { const c = attribute(touches, m, 10_000, now); expect(c.reduce((a, b) => a + b, 0)).toBe(10_000); }
    expect(attribute(touches, 'last_non_direct', 10_000, now)).toEqual([0, 0, 10_000, 0]); expect(attribute(touches, 'first_touch', 10_000, now)[0]).toBe(10_000);
    const u = attribute([T('a', 9), T('b', 5), T('c', 1)], 'u_shaped', 10_000, now); expect(u).toEqual([4000, 2000, 4000]); expect(attribute([T('a', 1)], 'u_shaped', 777, now)).toEqual([777]);
  });
  it('classificação de UTM/referrer em canais (orgânico, social, pago, direct) sem confiar em strings arbitrárias', () => {
    expect(classify({ utm_source: 'TikTok', utm_medium: 'paid', utm_campaign: 'Black Friday' }).source).toBe('tiktok'); expect(classify({}).source).toBe('direct'); expect(classify({ referrer: 'https://www.google.com/search?q=x' }).source).toBe('google.com');
    expect(classify({ utm_source: 'x'.repeat(500) }).source.length).toBeLessThanOrEqual(80);
  });
  it('toque anônimo → cadastro: o último canal NÃO direto vira users.attribution_source; direct não sobrescreve', async () => {
    const anon = `anon-${uniq('a')}`; await http.post('/api/v1/attribution/touch').send({ anonId: anon, utm_source: 'instagram', utm_medium: 'social', utm_campaign: 'reels' }); await new Promise((r) => setTimeout(r, 50));
    await http.post('/api/v1/attribution/touch').send({ anonId: anon, landing: '/' }); // direct
    const s = await reg({ anonId: anon, country: 'mx', timezone: 'America/Mexico_City' }); const u = (await pool.query('SELECT attribution_source, country, timezone FROM users WHERE id=$1', [s.id])).rows[0]; expect(u).toMatchObject({ attribution_source: 'instagram', country: 'MX', timezone: 'America/Mexico_City' });
    expect((await pool.query('SELECT count(*)::int n FROM attribution_touches WHERE anon_id=$1', [anon])).rows[0].n).toBe(0); expect((await pool.query('SELECT count(*)::int n FROM attribution_touches WHERE user_id=$1', [s.id])).rows[0].n).toBeGreaterThanOrEqual(1);
  });
  it('relatório de atribuição CONCILIA com as transações e com o Stripe (delta 0) em todos os modelos', async () => {
    const a = await reg({ utm: { utm_source: 'tiktok', utm_medium: 'paid', utm_campaign: 'c1' } }); const b = await reg({ utm: { utm_source: 'youtube', utm_medium: 'organic', utm_campaign: 'c2' } }); const c = await reg();
    for (const s of [a, b, c]) await buyCredits(s);
    const sub = await reg({ utm: { utm_source: 'tiktok', utm_medium: 'paid', utm_campaign: 'c1' } }); const co = (await http.post('/api/v1/billing/checkout/subscription').set(auth(sub)).set('idempotency-key', uniq('i')).send({ plan: 'pro' })).body; await stripeEvt({ id: co.sessionId, amount_total: 4900, customer: 'cus', metadata: { kind: 'subscription', plan: 'pro', userId: sub.id } }); await waitFor(async () => (await pool.query(`SELECT 1 FROM transactions WHERE user_id=$1 AND type='subscription'`, [sub.id])).rowCount, 20_000);
    for (const model of MODELS) {
      const r = (await http.get('/api/v1/admin/attribution/report').query({ from: t0.toISOString(), to: new Date(Date.now() + 1000).toISOString(), model }).set(auth(admin))).body;
      expect(r.reconciliation.attributionDeltaCents, model).toBe(0); expect(r.reconciliation.stripeDeltaCents, model).toBe(0); expect(r.channels.reduce((x: number, ch: { revenueCents: number }) => x + ch.revenueCents, 0), model).toBe(r.reconciliation.transactionsTotalCents);
      if (model === 'last_non_direct') { const tt = r.channels.find((ch: { source: string }) => ch.source === 'tiktok'); expect(tt.revenueCents).toBe(2500 + 4900); expect(r.channels.some((ch: { source: string }) => ch.source === 'unattributed')).toBe(true); }
    }
  });
  it('waitlist: entrada, duplicado idempotente, indicação sobe posição, flag fecha, e-mail inválido', async () => {
    const e1 = `${uniq('w')}@test.dev`; const a = await http.post('/api/v1/waitlist').send({ email: e1, locale: 'es-MX', country: 'mx', utm: { utm_source: 'pr', utm_campaign: 'launch' } }); expect(a.status).toBe(201); expect(a.body.referralCode).toMatch(/^W/); expect(a.body.position).toBeGreaterThanOrEqual(1);
    const again = (await http.post('/api/v1/waitlist').send({ email: e1.toUpperCase(), locale: 'pt-BR' })).body; expect(again.alreadyJoined).toBe(true); expect(again.referralCode).toBeUndefined(); expect(again.position).toBeUndefined(); expect(again.shareLink).toBeUndefined();
    const b = await http.post('/api/v1/waitlist').send({ email: `${uniq('w')}@test.dev`, locale: 'pt-BR', ref: a.body.referralCode }); expect(b.status).toBe(201);
    const st = (await http.get(`/api/v1/waitlist/${a.body.referralCode}`)).body; expect(st.referrals).toBe(1); expect(st.bonusPositions).toBe(5); expect(st.position).toBeLessThanOrEqual(a.body.position);
    expect((await http.get('/api/v1/waitlist/WZZZZZZ')).status).toBe(404); expect((await http.post('/api/v1/waitlist').send({ email: 'nope', locale: 'pt-BR' })).status).toBe(400);
    await setFlag(admin.id, 'waitlist_open', { enabled: false }); try { expect((await http.post('/api/v1/waitlist').send({ email: `${uniq('w')}@test.dev`, locale: 'en' })).status).toBe(409); } finally { await setFlag(admin.id, 'waitlist_open', { enabled: true }); }
    expect((await pool.query(`SELECT utm->>'utm_source' s FROM waitlist_entries WHERE lower(email)=$1`, [e1])).rows[0].s).toBe('pr');
  });
});

describe('14c. Parceiros: cadastro, revenue share e rastreio de vendas', () => {
  it('parceiro ativo (20%): cadastro com código → compra → comissão sobre o líquido; idempotente; pausado não acumula; pagamento zera o devido', async () => {
    const code = uniq('ag').replace('-', '_'); const plain = await reg(); expect((await http.post('/api/v1/admin/partners').set(auth(plain)).send({})).status).toBe(403);
    const p = await http.post('/api/v1/admin/partners').set(auth(admin)).send({ partnerType: 'agency', name: 'Agência Teste', code, status: 'active', revenueSharePct: 20 }); expect(p.status).toBe(201); const pid = p.body.id as string;
    expect((await http.post('/api/v1/admin/partners').set(auth(admin)).send({ partnerType: 'agency', name: 'Dup', code })).status).toBeGreaterThanOrEqual(400); expect((await http.post('/api/v1/admin/partners').set(auth(admin)).send({ partnerType: 'agency', name: 'Alto', code: uniq('x'), revenueSharePct: 90 })).status).toBe(400);
    const s = await reg({ partnerCode: code }); expect((await pool.query('SELECT partner_id FROM users WHERE id=$1', [s.id])).rows[0].partner_id).toBe(pid); const viaUtm = await reg({ utm: { utm_source: `partner_${code}` } }); expect((await pool.query('SELECT partner_id FROM users WHERE id=$1', [viaUtm.id])).rows[0].partner_id).toBe(pid);
    await buyCredits(s); await waitFor(async () => (await pool.query('SELECT 1 FROM partner_sales WHERE partner_id=$1', [pid])).rowCount, 10_000);
    let sales = (await http.get(`/api/v1/admin/partners/${pid}/sales`).set(auth(admin))).body; expect(sales.totals.sales).toBe(1); expect(Number(sales.totals.shareCents)).toBe(500); expect(Number(sales.totals.owedCents)).toBe(500); expect(sales.referredUsers).toBe(2);
    const tx = (await pool.query(`SELECT id FROM transactions WHERE user_id=$1 AND type='credit_purchase'`, [s.id])).rows[0].id; const { partnersService } = await import('../src/modules/partners/partners.service.js'); expect((await partnersService.accrue(tx)).accrued).toBe(false); // 2ª vez não acumula
    await http.patch(`/api/v1/admin/partners/${pid}`).set(auth(admin)).send({ status: 'paused' }); await buyCredits(viaUtm); sales = (await http.get(`/api/v1/admin/partners/${pid}/sales`).set(auth(admin))).body; expect(sales.totals.sales).toBe(1);
    await http.patch(`/api/v1/admin/partners/${pid}`).set(auth(admin)).send({ status: 'active' }); const paid = (await http.post(`/api/v1/admin/partners/${pid}/mark-paid`).set(auth(admin)).send({})).body; expect(paid).toMatchObject({ paidItems: 1, paidCents: 500 }); sales = (await http.get(`/api/v1/admin/partners/${pid}/sales`).set(auth(admin))).body; expect(Number(sales.totals.owedCents)).toBe(0); expect(Number(sales.totals.paidCents)).toBe(500);
  });
  it('código de parceiro inexistente/inativo não vincula nem quebra o cadastro', async () => { const s = await reg({ partnerCode: 'nao_existe_x' }); expect((await pool.query('SELECT partner_id FROM users WHERE id=$1', [s.id])).rows[0].partner_id).toBeNull(); });
  it('taxa de marketplace reduzida para criador verificado', async () => {
    const { split } = await import('../src/modules/marketplace/marketplace.service.js'); expect(split(100)).toEqual({ fee: 20, creator: 80 }); expect(split(100, 12)).toEqual({ fee: 12, creator: 88 });
    const cr = await reg(); expect((await http.post(`/api/v1/admin/creators/${cr.id}/verify`).set(auth(admin)).send({ verified: true })).status).toBe(200);
    const { monetizationService } = await import('../src/modules/monetization/monetization.service.js'); expect(await monetizationService.feePctFor(cr.id)).toBe(12); expect(await monetizationService.feePctFor((await reg()).id)).toBeNull();
  });
});

describe('14d. Marca d’água, cartão social e páginas SEO', () => {
  it('marca d’água: Free com texto/QR (ou sem, conforme experimento); plano pago sem marca', async () => {
    const f = await reg(); const w = (await http.get('/api/v1/growth/watermark').set(auth(f))).body; expect(['control', 'qr', 'none']).toContain(w.variant); if (w.enabled) expect(w.url).toMatch(/nexusreel\.com\/r\//);
    await pool.query(`UPDATE users SET plan='pro' WHERE id=$1`, [f.id]); expect((await http.get('/api/v1/growth/watermark').set(auth(f))).body).toMatchObject({ enabled: false, reason: 'paid_plan' });
  });
  it('cartão social: link com UTM + código de indicação; SVG escapa HTML; outro usuário não acessa', async () => {
    const s = await reg(); const pr = await pool.query(`INSERT INTO projects (user_id,title,script,source_locale,status) VALUES ($1,$2,'s','pt-BR','ready') RETURNING id`, [s.id, '<script>alert(1)</script> & "x"']); const id = pr.rows[0].id;
    const infoR = await http.get(`/api/v1/growth/share/${id}?channel=whatsapp`).set(auth(s)); const info = infoR.body; if (!info.url) throw new Error(JSON.stringify(infoR.body)); expect(info.url).toMatch(/utm_source=share/); expect(info.url).toMatch(/utm_medium=whatsapp/); expect(info.url).toMatch(/ref=/);
    const svg = await http.get(`/api/v1/growth/share/${id}/card.svg`).set(auth(s)); expect(svg.status).toBe(200); expect(svg.headers['content-type']).toMatch(/image\/svg\+xml/); const svgTxt = Buffer.isBuffer(svg.body) ? svg.body.toString() : String(svg.text); expect(svgTxt).not.toContain('<script>'); expect(svgTxt).toContain('&lt;script&gt;');
    const other = await reg(); expect((await http.get(`/api/v1/growth/share/${id}`).set(auth(other))).status).toBe(404);
  });
  it('páginas SEO de template: HTML com JSON-LD e CSP restrita, XSS escapado; sitemap lista só aprovados', async () => {
    const cr = await reg(); const ok = await pool.query(`INSERT INTO templates (creator_id,name,description,category,moderation_status) VALUES ($1,$2,'desc </script><b>x</b>','moda','approved') RETURNING id`, [cr.id, 'Tpl <img src=x onerror=alert(1)>']); const draft = await pool.query(`INSERT INTO templates (creator_id,name,category,moderation_status) VALUES ($1,'Rascunho','moda','draft') RETURNING id`, [cr.id]);
    const page = await http.get(`/api/v1/public/templates/${ok.rows[0].id}`); expect(page.status).toBe(200); expect(page.headers['content-type']).toMatch(/text\/html/); expect(page.headers['content-security-policy']).toContain("default-src 'none'"); expect(page.text).toContain('application/ld+json'); expect(page.text).not.toContain('<img src=x'); expect(page.text.match(/<\/script>/g)!.length).toBe(1);
    expect(page.text).toMatch(/rel="canonical"/); expect((await http.get(`/api/v1/public/templates/${draft.rows[0].id}`)).status).toBe(404);
    const sm = await http.get('/api/v1/public/sitemap.xml').buffer(true).parse((res, cb) => { let d = ''; res.on('data', (c: Buffer) => (d += c)); res.on('end', () => cb(null, d)); }); expect(sm.headers['content-type']).toMatch(/xml/); expect(String(sm.body)).toContain(ok.rows[0].id); expect(String(sm.body)).not.toContain(draft.rows[0].id);
  });
});

describe('14e. Ciência de dados: previsão de receita e custo de IA, funil, LTV de coorte', () => {
  it('previsão: série com tendência e sazonalidade semanal é projetada com intervalo; séries curtas/vazias degradam com segurança', () => {
    const series = Array.from({ length: 56 }, (_, i) => (100 + 2 * i) * ([0.6, 1, 1, 1, 1.1, 1.4, 1.3][i % 7]!)); const f = forecastDaily(series, 14, 0);
    expect(f.method).toBe('trend_weekly'); expect(f.slope).toBeGreaterThan(1.5); expect(f.points).toHaveLength(14); expect(f.points.every((p) => p.lo <= p.value && p.value <= p.hi && p.lo >= 0)).toBe(true);
    const expected = (100 + 2 * 56) * 0.6; expect(Math.abs(f.points[0]!.value - expected) / expected).toBeLessThan(0.1); expect(f.points[5]!.value).toBeGreaterThan(f.points[0]!.value); // fim de semana > segunda
    expect(forecastDaily([], 5).points.every((p) => p.value === 0)).toBe(true); expect(forecastDaily([10, 10, 10], 3).method).toBe('mean');
    const mp = projectMonth(1000, 10, Array(30).fill(50), 0); expect(mp.projected).toBeGreaterThan(1400); expect(mp.projected).toBeLessThan(1600);
  });
  it('fillDaily preenche dias sem dados com zero', () => { const from = new Date('2026-01-01T00:00:00Z'); expect(fillDaily([{ d: '2026-01-02T00:00:00Z', v: 5 }], from, 3)).toEqual([0, 5, 0]); });
  it('projeção do custo de IA acima do orçamento abre UM alerta (sem duplicar) e endpoint admin responde', async () => {
    await pool.query(`UPDATE growth_alerts SET resolved_at=now() WHERE kind='ai_cost_forecast' AND resolved_at IS NULL`); const { updateGrowthSettings } = await import('../src/modules/growth/settings.js');
    const old = (await import('../src/modules/growth/settings.js')).GROWTH_DEFAULTS.aiCostMonthlyBudgetCents; await updateGrowthSettings({ aiCostMonthlyBudgetCents: 100 });
    try {
      await pool.query(`INSERT INTO ai_usage (provider,operation,cost_cents,created_at) SELECT 'mock','scene', 500, now() - (g || ' days')::interval FROM generate_series(0,20) g`);
      const a = await datascienceService.forecastAiCost(); expect(a.overBudget).toBe(true); expect(a.projectedCents).toBeGreaterThan(100); expect(a.alerted).toBe(true); const b = await datascienceService.forecastAiCost(); expect(b.alerted).toBe(false);
      expect((await pool.query(`SELECT count(*)::int n FROM growth_alerts WHERE kind='ai_cost_forecast' AND resolved_at IS NULL`)).rows[0].n).toBe(1);
      const al = (await http.get('/api/v1/admin/growth/alerts').set(auth(admin))).body.items; expect(al.some((x: { kind: string }) => x.kind === 'ai_cost_forecast')).toBe(true); expect((await http.get('/api/v1/admin/datascience/forecast/ai-cost?alert=false').set(auth(admin))).status).toBe(200);
    } finally { await updateGrowthSettings({ aiCostMonthlyBudgetCents: old }); await pool.query(`DELETE FROM ai_usage WHERE provider='mock' AND cost_cents=500 AND user_id IS NULL`); await pool.query(`UPDATE growth_alerts SET resolved_at=now() WHERE kind='ai_cost_forecast'`); }
  });
  it('previsão de receita, funil, LTV de coorte e propensão via API admin', async () => {
    const rev = (await http.get('/api/v1/admin/datascience/forecast/revenue?horizon=14').set(auth(admin))).body; expect(rev.points).toHaveLength(14); expect(rev.unit).toBe('brl_cents');
    const fu = (await http.get('/api/v1/admin/datascience/funnel').set(auth(admin))).body; expect(fu.steps.map((x: { name: string }) => x.name)).toEqual(['user_signed_up', 'project_created', 'video_assembled', 'video_published', 'subscription_started']);
    const ltv = (await http.get('/api/v1/admin/datascience/cohort-ltv?months=3').set(auth(admin))).body; expect(Array.isArray(ltv.items)).toBe(true); if (ltv.items[0]) { const l = ltv.items[0].ltvCents; expect(l.d90).toBeGreaterThanOrEqual(l.d30); expect(l.d30).toBeGreaterThanOrEqual(l.d0); }
    expect((await http.get('/api/v1/admin/datascience/propensity?target=upgrade&limit=5').set(auth(admin))).status).toBe(200); const plain = await reg(); expect((await http.get('/api/v1/admin/datascience/funnel').set(auth(plain))).status).toBe(403);
  });
  it('configurações de growth: leitura/edição administrativa com validação', async () => {
    expect((await http.get('/api/v1/admin/growth/settings').set(auth(admin))).body.referral.rewardReferrerCredits).toBeGreaterThan(0);
    expect((await http.patch('/api/v1/admin/growth/settings').set(auth(admin)).send({ holdoutPct: 5 })).status).toBe(200); expect((await http.patch('/api/v1/admin/growth/settings').set(auth(admin)).send({ holdoutPct: 5 })).body.holdoutPct).toBe(5); await http.patch('/api/v1/admin/growth/settings').set(auth(admin)).send({ holdoutPct: 0 });
  });
});
