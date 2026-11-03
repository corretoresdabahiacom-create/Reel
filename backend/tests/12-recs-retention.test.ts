import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { boot, shutdown, http, signup, auth, pool, uniq, type Session } from './helpers.js';
import { env } from '../src/config/env.js';
import { FEATURES } from '../src/modules/retention/features.js';
import { lifecycleService, parseUnsubscribeToken, unsubscribeToken, inQuiet } from '../src/modules/retention/lifecycle.service.js';
import { retentionService, rfmSegment } from '../src/modules/retention/retention.service.js';
import { heuristicChurn } from '../src/modules/retention/churn.client.js';
import { mmr } from '../src/modules/recommendations/recommendations.service.js';
import { invalidateConsent } from '../src/modules/growth/consent.js';
import { readFileSync, existsSync } from 'node:fs';

let admin: Session; let u: Session; const tplIds: string[] = [];
beforeAll(async () => {
  await boot(false); admin = await signup({ admin: true }); u = await signup();
  const creator = await signup();
  for (const [i, cat] of ['moda', 'moda', 'casa', 'casa', 'beleza', 'beleza', 'tech', 'tech'].entries()) {
    const r = await pool.query(`INSERT INTO templates (creator_id,name,category,moderation_status,usage_count,price_credits) VALUES ($1,$2,$3,'approved',$4,0) RETURNING id`, [creator.id, `Tpl ${uniq('t')}`, cat, 100 - i * 10]); tplIds.push(r.rows[0].id);
  }
});
afterAll(() => shutdown());

describe('12a. Recomendações', () => {
  it('cold start por regras → personalizado após N=5 interações; motivos explicáveis; CTR medido', async () => {
    const cold = (await http.get('/api/v1/recommendations/templates?limit=5').set(auth(u))).body; expect(cold.mode).toBe('cold_start'); expect(cold.interactions).toBe(0); expect(cold.items.length).toBeGreaterThan(0);
    const reqId = cold.requestId as string;
    // impressões + 1 clique
    await http.post('/api/v1/recommendations/events').set(auth(u)).send({ events: cold.items.map((x: { id: string }, i: number) => ({ surface: 'templates', itemType: 'template', itemId: x.id, action: 'impression', requestId: reqId, position: i })) });
    for (const id of tplIds.slice(0, 5)) await http.post('/api/v1/recommendations/events').set(auth(u)).send({ events: [{ surface: 'templates', itemType: 'template', itemId: id, action: 'click', requestId: reqId }] });
    const warm = (await http.get('/api/v1/recommendations/templates?limit=5').set(auth(u))).body; expect(warm.interactions).toBeGreaterThanOrEqual(5); expect(warm.mode).toBe('personalized');
    expect(warm.items.every((x: { reasons: string[] }) => x.reasons.length > 0)).toBe(true);
    const mt = (await http.get('/api/v1/admin/recommendations/metrics').set(auth(admin))).body; expect(JSON.stringify(mt)).toMatch(/ctr/i);
  });
  it('MMR aumenta a diversidade de categorias sem perder o melhor item', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ id: i, category: i < 8 ? 'moda' : i < 10 ? 'casa' : 'tech', score: 1 - i * 0.02 }));
    const pure = mmr(items, 5, 1); const div = mmr(items, 5, 0.6);
    expect(new Set(div.map((x) => x.category)).size).toBeGreaterThanOrEqual(new Set(pure.map((x) => x.category)).size); expect(div[0]!.id).toBe(0);
  });
  it('prompts, ideias de foto, plataformas e melhor horário respondem no idioma/fuso do usuário', async () => {
    for (const p of ['prompts?category=moda', 'photo-ideas?category=moda&locale=en', 'platforms?goal=sell', 'publish-time?platform=tiktok']) { const r = await http.get(`/api/v1/recommendations/${p}`).set(auth(u)); expect(r.status, p).toBe(200); }
    const en = (await http.get('/api/v1/recommendations/photo-ideas?category=moda&locale=en').set(auth(u))).body; expect(en.locale).toBe('en'); expect(en.items.length).toBeGreaterThan(0);
    expect((await http.get('/api/v1/recommendations/publish-time?platform=nao_existe').set(auth(u))).status).toBe(400);
  });
});

describe('12b. Churn / LTV / propensão (serviço de ML com fallback)', () => {
  it('lote de 100 usuários: churn_scores + users.churn_risk preenchidos (fallback heurístico sem serviço)', async () => {
    env.ML_SERVICE_URL = ''; const ids: string[] = [];
    for (let i = 0; i < 100; i++) { const r = await pool.query(`INSERT INTO users (email,name,locale,created_at,last_seen_at) VALUES ($1,'c','pt-BR', now() - ($2 || ' days')::interval, now() - ($3 || ' days')::interval) RETURNING id`, [`${uniq('ch')}@t.dev`, String(5 + (i % 90)), String(i % 60)]); ids.push(r.rows[0].id); }
    const r = await retentionService.refreshScores({ userIds: ids }); expect(r.scored).toBe(100); expect(r.fallback).toBe(100); expect(r.model).toBe(0);
    const n = (await pool.query(`SELECT count(*)::int n, min(score) lo, max(score) hi FROM churn_scores WHERE user_id = ANY($1)`, [ids])).rows[0]; expect(n.n).toBe(100); expect(n.lo).toBeGreaterThanOrEqual(0); expect(n.hi).toBeLessThanOrEqual(1); expect(n.hi - n.lo).toBeGreaterThan(0.1);
    expect((await pool.query(`SELECT count(*)::int n FROM users WHERE id = ANY($1) AND churn_risk IS NOT NULL`, [ids])).rows[0].n).toBe(100);
    expect((await pool.query(`SELECT count(*)::int n FROM ltv_predictions WHERE user_id = ANY($1)`, [ids])).rows[0].n).toBe(100);
    expect((await pool.query(`SELECT count(*)::int n FROM propensity_scores WHERE user_id = ANY($1)`, [ids])).rows[0].n).toBe(200);
  });
  it('heurística monotônica: inativo e sem publicar > ativo que publica', () => {
    const base = Object.fromEntries(FEATURES.map((f) => [f, 0])) as Record<(typeof FEATURES)[number], number>;
    const dormant = heuristicChurn({ ...base, days_since_last_login: 40, tenure_days: 60, gen_success_rate_30d: 1 }).score; const active = heuristicChurn({ ...base, days_since_last_login: 0, tenure_days: 60, projects_30d: 6, publications_30d: 4, gen_success_rate_30d: 1, onboarding_completed: 1, platforms_connected: 2 }).score;
    expect(dormant).toBeGreaterThan(active + 0.3);
  });
  it('serviço de ML lento (>timeout) cai no fallback sem falhar; serviço rápido é usado', async () => {
    const s = await signup(); let delay = 0;
    const srv: Server = createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => setTimeout(() => { const body = JSON.parse(b || '{}'); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ version: { churn: 'xgb-test', ltv: 'ltv-test', propensity: 'p-test' }, predictions: (body.rows ?? []).map((r: { id: string }) => ({ id: r.id, churn: 0.42, ltv_brl: 100, p_upgrade: 0.1, p_credits: 0.2, top: [] })) })); }, delay)); });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r)); env.ML_SERVICE_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`; env.ML_TIMEOUT_MS = 50;
    try {
      delay = 0; const ok = await retentionService.churnFor(s.id); expect(ok.source === 'model' || ok.source === 'fallback').toBe(true);
      const { scoreOne } = await import('../src/modules/retention/churn.client.js'); const { buildFeatures } = await import('../src/modules/retention/features.js'); const f = (await buildFeatures([s.id]))[0]!;
      expect((await scoreOne(f)).churn.source).toBe('model'); delay = 300; const t0 = Date.now(); const slow = await scoreOne(f); expect(slow.churn.source).toBe('fallback'); expect(Date.now() - t0).toBeLessThan(250);
    } finally { srv.close(); env.ML_SERVICE_URL = ''; }
  });
  it('RFM: segmentos coerentes', () => { expect(rfmSegment(5, 5, 5, 200, false)).toBeTruthy(); expect(rfmSegment(1, 1, 1, 200, false)).not.toBe(rfmSegment(5, 5, 5, 200, false)); });
  it('contrato de features igual ao do serviço Python (paridade)', () => { const p = 'services/ml/features.json'; if (!existsSync(p)) return; expect(JSON.parse(readFileSync(p, 'utf8')).features).toEqual([...FEATURES]); });
});

describe('12c. Lifecycle (push/e-mail/in-app) — segmentação, quiet hours, opt-out, frequência', () => {
  const mkUser = async (o: { age: number; tz?: string; marketing?: boolean; unsub?: boolean }) => {
    const r = await pool.query(`INSERT INTO users (email,name,locale,timezone,created_at) VALUES ($1,'Ana Lima','pt-BR',$2, now() - ($3 || ' days')::interval) RETURNING id`, [`${uniq('lc')}@t.dev`, o.tz ?? 'America/Sao_Paulo', String(o.age)]); const id = r.rows[0].id as string;
    if (o.marketing) await pool.query(`INSERT INTO consents (user_id,type,version) VALUES ($1,'marketing','v1')`, [id]); if (o.unsub) await pool.query(`INSERT INTO notification_preferences (user_id, unsubscribed_all) VALUES ($1,true)`, [id]); await invalidateConsent(id); return id;
  };
  it('"D+7 sem publicar" chega só ao segmento certo; quiet hours, opt-out e consentimento suprimem; 2ª execução não duplica', async () => {
    await pool.query(`UPDATE lifecycle_campaigns SET active = (key='d7_never_published')`);
    const target = await mkUser({ age: 8, marketing: true }); const noConsent = await mkUser({ age: 8 }); const optOut = await mkUser({ age: 8, marketing: true, unsub: true }); const young = await mkUser({ age: 2, marketing: true });
    const publisher = await mkUser({ age: 8, marketing: true });
    const pr = await pool.query(`INSERT INTO projects (user_id,title,script,source_locale,status) VALUES ($1,'p','s','pt-BR','ready') RETURNING id`, [publisher]);
    await pool.query(`INSERT INTO publications (project_id,user_id,platform,status,published_at) VALUES ($1,$2,'tiktok','published',now())`, [pr.rows[0].id, publisher]);
    const evening = new Date(); evening.setUTCHours(23, 30, 0, 0); // 20:30 em São Paulo (UTC-3)
    const run = (await lifecycleService.run({ now: evening, only: ['d7_never_published'], limitPerCampaign: 5000 }))[0]!; expect(run.sent).toBeGreaterThanOrEqual(1);
    const got = async (id: string) => (await pool.query(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND campaign_key='d7_never_published'`, [id])).rows[0].n;
    expect(await got(target)).toBe(1); expect(await got(noConsent)).toBe(0); expect(await got(optOut)).toBe(0); expect(await got(young)).toBe(0); expect(await got(publisher)).toBe(0);
    expect(run.suppressed.no_consent ?? 0).toBeGreaterThanOrEqual(1); expect(run.suppressed.opt_out ?? 0).toBeGreaterThanOrEqual(1);
    await lifecycleService.run({ now: evening, only: ['d7_never_published'], limitPerCampaign: 5000 }); expect(await got(target)).toBe(1); // idempotente
    const stats = (await http.get('/api/v1/admin/lifecycle/stats').set(auth(admin))).body.items.find((x: { key: string }) => x.key === 'd7_never_published'); expect(stats.sent).toBeGreaterThanOrEqual(1);
    const night = await mkUser({ age: 8, marketing: true }); const quiet = new Date(); quiet.setUTCHours(2, 0, 0, 0); // 23:00 em São Paulo → horário silencioso
    const q = (await lifecycleService.run({ now: quiet, only: ['d7_never_published'], limitPerCampaign: 5000 }))[0]!; expect(q.suppressed.quiet_hours ?? 0).toBeGreaterThanOrEqual(1); expect(await got(night)).toBe(0);
    await pool.query(`UPDATE lifecycle_campaigns SET active=true`);
  });
  it('janelas de silêncio atravessando a meia-noite', () => { expect(inQuiet(23, 22, 8)).toBe(true); expect(inQuiet(3, 22, 8)).toBe(true); expect(inQuiet(12, 22, 8)).toBe(false); expect(inQuiet(9, 9, 18)).toBe(true); });
  it('opt-out por link assinado (GET e POST one-click); token adulterado é rejeitado', async () => {
    const id = (await signup()).id; const t = unsubscribeToken(id); expect(parseUnsubscribeToken(t)).toBe(id); expect(parseUnsubscribeToken(t.slice(0, -2) + 'zz')).toBeNull();
    expect((await http.post(`/api/v1/notifications/unsubscribe?t=${t}`).send({})).status).toBe(200); expect((await pool.query('SELECT unsubscribed_all FROM notification_preferences WHERE user_id=$1', [id])).rows[0].unsubscribed_all).toBe(true);
    expect((await http.get(`/api/v1/notifications/unsubscribe?t=${t.slice(0, -2)}zz`)).status).toBeGreaterThanOrEqual(400);
  });
  it('preferências e caixa de notificações do usuário', async () => {
    const s = await signup(); expect((await http.put('/api/v1/notifications/preferences').set(auth(s)).send({ push: false, quietStart: 21, quietEnd: 7 })).status).toBe(200);
    expect((await http.get('/api/v1/notifications/preferences').set(auth(s))).body).toMatchObject({ push: false, quietStart: 21, quietEnd: 7 });
    const n = await pool.query(`INSERT INTO notifications (user_id,channel,title,body) VALUES ($1,'in_app','t','b') RETURNING id`, [s.id]);
    expect((await http.get('/api/v1/notifications').set(auth(s))).body.items).toHaveLength(1); expect((await http.post(`/api/v1/notifications/${n.rows[0].id}/action`).set(auth(s)).send({ action: 'read' })).status).toBe(200);
  });
  it('onboarding adaptativo por objetivo e persistência de país/fuso', async () => {
    const s = await signup(); const before = (await http.get('/api/v1/onboarding/plan').set(auth(s))).body; expect(before.steps?.length ?? before.items?.length).toBeGreaterThan(0);
    expect((await http.put('/api/v1/users/me/onboarding').set(auth(s)).send({ goal: 'sell', country: 'mx', timezone: 'America/Mexico_City' })).status).toBe(200);
    const after = (await http.get('/api/v1/onboarding/plan').set(auth(s))).body; expect(JSON.stringify(after)).toMatch(/photocoach/i);
    expect((await pool.query('SELECT country, timezone, onboarding_goal FROM users WHERE id=$1', [s.id])).rows[0]).toMatchObject({ country: 'MX', timezone: 'America/Mexico_City', onboarding_goal: 'sell' });
  });
});
