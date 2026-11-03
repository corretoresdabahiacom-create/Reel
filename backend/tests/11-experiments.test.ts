import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, pool, uniq, type Session } from './helpers.js';
import { bucket10k, pickVariant, decide, hash32 } from '../src/modules/experiments/assignment.js';
import { sampleSizeProportions, mdeProportions, twoProportionZ, srmCheck, holm, benjaminiHochberg, welchT, normInv, tCdf } from '../src/modules/experiments/stats.js';
import { evaluateGuardrail, experimentsService } from '../src/modules/experiments/experiments.service.js';

let admin: Session; let u1: Session;
beforeAll(async () => { await boot(false); admin = await signup({ admin: true }); u1 = await signup(); });
afterAll(() => shutdown());
const mk = (key: string, extra: object = {}) => http.post('/api/v1/admin/experiments').set(auth(admin)).send({
  key, name: `Teste ${key}`, hypothesis: 'h', variants: [{ key: 'control', weight: 50 }, { key: 'treat', weight: 50 }], primaryMetric: { type: 'conversion', event: 'subscription_started' }, ...extra,
});
const adm = (m: 'get' | 'post' | 'patch', url: string) => http[m](`/api/v1/admin/experiments${url}`).set(auth(admin));

describe('11a. Experimentação — estatística e hash (puros)', () => {
  it('hash FNV-1a determinístico e distribuição uniforme (50/50 ±2% em 20k ids)', () => {
    expect(hash32('abc')).toBe(hash32('abc')); expect(bucket10k('variant', 's', 'u1')).toBe(bucket10k('variant', 's', 'u1'));
    let a = 0; for (let i = 0; i < 20_000; i++) if (pickVariant([{ key: 'control', weight: 50 }, { key: 'treat', weight: 50 }], 'salt', 'k', `user-${i}`) === 'treat') a++;
    expect(Math.abs(a / 20_000 - 0.5)).toBeLessThan(0.02);
  });
  it('salt diferente por experimento descorrelaciona as atribuições', () => {
    let same = 0; const v = [{ key: 'control', weight: 50 }, { key: 'treat', weight: 50 }];
    for (let i = 0; i < 4000; i++) if (pickVariant(v, 'saltA', 'a', `u${i}`) === pickVariant(v, 'saltB', 'b', `u${i}`)) same++;
    expect(same / 4000).toBeGreaterThan(0.45); expect(same / 4000).toBeLessThan(0.55);
  });
  it('valores de referência: z, t, tamanho de amostra, MDE, SRM, Holm/BH', () => {
    expect(normInv(0.975)).toBeCloseTo(1.95996, 4); expect(tCdf(2.0, 10)).toBeCloseTo(0.963306, 4);
    expect(sampleSizeProportions({ baseline: 0.05, mdeRelative: 0.2 })).toBeGreaterThan(7000); expect(sampleSizeProportions({ baseline: 0.05, mdeRelative: 0.2 })).toBeLessThan(8500);
    const n = sampleSizeProportions({ baseline: 0.1, mdeRelative: 0.1 }); expect(mdeProportions({ baseline: 0.1, n })).toBeCloseTo(0.1, 1);
    const r = twoProportionZ({ x: 100, n: 1000 }, { x: 150, n: 1000 }); expect(r.p).toBeLessThan(0.001); expect(r.relLift).toBeCloseTo(0.5, 5);
    expect(srmCheck([5000, 5000], [50, 50]).mismatch).toBe(false); expect(srmCheck([5600, 4400], [50, 50]).mismatch).toBe(true);
    expect(holm([0.01, 0.04, 0.03])).toEqual([0.03, 0.06, 0.06]); expect(benjaminiHochberg([0.01, 0.04, 0.03]).map((x) => +x.toFixed(2))).toEqual([0.03, 0.04, 0.04]);
    expect(welchT({ n: 100, mean: 10, variance: 4 }, { n: 100, mean: 10, variance: 4 }).p).toBeCloseTo(1, 5);
  });
  it('guardrail exige efeito relativo, significância unilateral e amostra mínima', () => {
    const g = { metric: 'ai_cost_cents', direction: 'increase_bad' as const, maxRelativeChange: 0.25, minHours: 0, minSample: 50 };
    expect(evaluateGuardrail(g, { n: 500, mean: 10, variance: 4 }, { n: 500, mean: 14, variance: 4 }).breached).toBe(true);
    expect(evaluateGuardrail(g, { n: 500, mean: 10, variance: 4 }, { n: 500, mean: 11, variance: 4 }).breached).toBe(false); // abaixo do limite
    expect(evaluateGuardrail(g, { n: 10, mean: 10, variance: 4 }, { n: 10, mean: 30, variance: 4 }).breached).toBe(false); // amostra mínima
    expect(evaluateGuardrail(g, { n: 500, mean: 10, variance: 4000 }, { n: 500, mean: 13, variance: 4000 }).breached).toBe(false); // ruído: não significativo
  });
  it('alvo (plano, região, novos usuários) e holdout global são respeitados', () => {
    const base = { key: 'k', salt: 's', variants: [{ key: 'control', weight: 50 }, { key: 'treat', weight: 50 }], trafficPct: 100, startAt: new Date('2026-01-01'), respectsHoldout: true };
    const u = { id: 'u', plan: 'free', region: 'LATAM', country: 'BR', createdAt: new Date('2025-12-01') };
    expect(decide({ ...base, target: { plans: ['pro'] } }, u, 0).inExperiment).toBe(false);
    expect(decide({ ...base, target: { newUsersOnly: true } }, u, 0).inExperiment).toBe(false);
    expect(decide({ ...base, target: { regions: ['LATAM'], countries: ['BR'] } }, u, 0).inExperiment).toBe(true);
    let held = 0; for (let i = 0; i < 5000; i++) if (!decide({ ...base, target: {} }, { ...u, id: `x${i}` }, 10).inExperiment) held++; expect(held / 5000).toBeGreaterThan(0.08); expect(held / 5000).toBeLessThan(0.12);
  });
});

describe('11b. Experimentação — ponta a ponta', () => {
  it('rascunho → início; edição bloqueada após iniciar; usuário comum não administra', async () => {
    const key = uniq('exp').replace('-', '_'); expect((await mk(key)).status).toBe(201);
    expect((await http.post('/api/v1/admin/experiments').set(auth(u1)).send({})).status).toBe(403);
    expect((await mk(key)).status).toBeGreaterThanOrEqual(400); // chave duplicada
    expect((await adm('patch', `/${key}`).send({ trafficPct: 50 })).status).toBe(200);
    expect((await adm('post', `/${key}/start`).send({})).body.status).toBe('running');
    expect((await adm('patch', `/${key}`).send({ variants: [{ key: 'control', weight: 10 }, { key: 'treat', weight: 90 }] })).status).toBeGreaterThanOrEqual(400);
  });
  it('pesos que não somam 100 e variantes duplicadas são rejeitados', async () => {
    expect((await mk('bad_weights', { variants: [{ key: 'control', weight: 60 }, { key: 'treat', weight: 60 }] })).status).toBe(400);
    expect((await mk('bad_dupes', { variants: [{ key: 'control', weight: 50 }, { key: 'control', weight: 50 }] })).status).toBe(400);
  });
  it('sem flicker: a mesma variante em 25 chamadas e após limpar o cache Redis; /active é igual e não expõe', async () => {
    const key = uniq('flick').replace('-', '_'); await mk(key); await adm('post', `/${key}/start`).send({});
    const first = (await http.post(`/api/v1/experiments/${key}/assign`).set(auth(u1)).send({ expose: false })).body; expect(first.inExperiment).toBe(true);
    for (let i = 0; i < 25; i++) expect((await http.post(`/api/v1/experiments/${key}/assign`).set(auth(u1)).send({ expose: false })).body.variant).toBe(first.variant);
    const keys = await (await import('../src/db/redis.js')).redis.keys('exp:*'); if (keys.length) await (await import('../src/db/redis.js')).redis.del(...keys);
    expect((await http.post(`/api/v1/experiments/${key}/assign`).set(auth(u1)).send({ expose: false })).body.variant).toBe(first.variant);
    const act = (await http.get('/api/v1/experiments/active').set(auth(u1))).body.experiments[key]; expect(act.variant).toBe(first.variant);
    expect((await pool.query(`SELECT exposed_at FROM experiment_assignments a JOIN experiments e ON e.id=a.experiment_id WHERE e.key=$1 AND a.user_id=$2`, [key, u1.id])).rows[0].exposed_at).toBeNull();
    await http.post(`/api/v1/experiments/${key}/assign`).set(auth(u1)).send({ expose: true });
    expect((await pool.query(`SELECT exposed_at FROM experiment_assignments a JOIN experiments e ON e.id=a.experiment_id WHERE e.key=$1 AND a.user_id=$2`, [key, u1.id])).rows[0].exposed_at).not.toBeNull();
  });
  it('fallback seguro: experimento inexistente/pausado devolve controle; erro de Redis não derruba', async () => {
    const r = await http.post('/api/v1/experiments/nao_existe_xyz/assign').set(auth(u1)).send({}); expect(r.status).toBe(200); expect(r.body).toMatchObject({ inExperiment: false, fallback: true });
    const key = uniq('pause').replace('-', '_'); await mk(key); await adm('post', `/${key}/start`).send({}); await adm('post', `/${key}/pause`).send({ reason: 'teste' });
    const p = (await http.post(`/api/v1/experiments/${key}/assign`).set(auth(u1)).send({})).body; expect(p.variant).toBe('control'); expect(p.inExperiment).toBe(false);
  });
  it('usuário que revogou cookies sai dos experimentos (controle) — consentimento respeitado', async () => {
    const s = await signup(); const key = uniq('optout').replace('-', '_'); await mk(key); await adm('post', `/${key}/start`).send({});
    await http.post('/api/v1/users/me/consents').set(auth(s)).send({ items: [{ type: 'cookies', accepted: true }] });
    await http.post('/api/v1/users/me/consents').set(auth(s)).send({ items: [{ type: 'cookies', accepted: false }] });
    const r = (await http.post(`/api/v1/experiments/${key}/assign`).set(auth(s)).send({})).body; expect(r.variant).toBe('control'); expect(r.reason).toBe('opted_out');
  });
  it('resultados: conversões por variante, SRM, custo de IA e dica de decisão', async () => {
    const key = uniq('res').replace('-', '_'); await mk(key, { conversionWindowDays: 7 }); await adm('post', `/${key}/start`).send({});
    const ex = (await adm('get', `/${key}`)).body; expect(ex.status).toBe('running');
    const r = await adm('get', `/${key}/results`); expect(r.status).toBe(200); expect(r.body).toHaveProperty('sampleSufficient'); expect(r.body).toHaveProperty('guardrails');
  });
  it('guardrail de custo de IA pausa automaticamente o experimento e abre alerta', async () => {
    const key = uniq('guard').replace('-', '_'); await mk(key, { guardrails: [{ metric: 'ai_cost_cents', direction: 'increase_bad', maxRelativeChange: 0.2, minHours: 24, minSample: 20 }] });
    await adm('post', `/${key}/start`).send({}); const e = (await adm('get', `/${key}`)).body; const eid = (await pool.query('SELECT id FROM experiments WHERE key=$1', [key])).rows[0].id;
    const ids: string[] = []; for (let i = 0; i < 60; i++) { const r = await pool.query(`INSERT INTO users (email,name,locale) VALUES ($1,'g','pt-BR') RETURNING id`, [`${uniq('g')}@t.dev`]); ids.push(r.rows[0].id); }
    for (let i = 0; i < ids.length; i++) {
      const variant = i % 2 ? 'treat' : 'control'; await pool.query(`INSERT INTO experiment_assignments (experiment_id,user_id,variant,exposed_at) VALUES ($1,$2,$3,now() - interval '1 hour')`, [eid, ids[i], variant]);
      const cost = (variant === 'treat' ? 30 : 10) + (i % 5); await pool.query(`INSERT INTO ai_usage (user_id,provider,operation,cost_cents) VALUES ($1,'mock','scene',$2)`, [ids[i], cost]);
    }
    expect(e.key).toBe(key);
    const first = (await experimentsService.checkGuardrails(new Date())).find((x) => x.key === key); expect(first?.action).toBe('breach_started');
    const second = (await experimentsService.checkGuardrails(new Date(Date.now() + 25 * 3_600_000))).find((x) => x.key === key); expect(second?.action).toBe('paused');
    expect((await adm('get', `/${key}`)).body.status).toBe('paused');
    const al = (await http.get('/api/v1/admin/growth/alerts').set(auth(admin))).body.items; expect(al.some((a: { kind: string; message: string }) => a.kind === 'experiment_guardrail' && a.message.includes(key))).toBe(true);
  });
  it('experimento concluído com "ship" serve o vencedor a todos', async () => {
    const key = uniq('ship').replace('-', '_'); await mk(key); await adm('post', `/${key}/start`).send({});
    expect((await adm('post', `/${key}/conclude`).send({ decision: 'ship', winner: 'treat', notes: 'ok' })).status).toBe(200);
    const s = await signup(); const r = (await http.post(`/api/v1/experiments/${key}/assign`).set(auth(s)).send({})).body; expect(r.variant).toBe('treat'); expect(r.reason).toBe('shipped');
  });
  it('calculadora de amostra/MDE/duração', async () => {
    const r = await adm('post', '/plan').send({ baseline: 0.05, mdeRelative: 0.2, variants: 2, eligiblePerDay: 500 }); expect(r.status).toBe(200); expect(r.body.requiredPerVariant).toBeGreaterThan(5000); expect(r.body.minDurationDays).toBeGreaterThanOrEqual(7);
  });
});
