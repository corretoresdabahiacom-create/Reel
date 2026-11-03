import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, pool, uniq, type Session } from './helpers.js';
import { finopsService, monthRange } from '../src/modules/finops/finops.service.js';
import { simulate, breakEvenPrice, DEFAULT_PROFILES } from '../src/modules/finops/pricing-sim.js';
import { sceneCacheKey, costGuard, chooseProvider, sceneComplexity, PROVIDER_MATRIX } from '../src/modules/cost-optimization/index.js';
import { ropaService, ACTIVITIES } from '../src/modules/compliance/ropa.js';
import { dpiaService, assessRisks } from '../src/modules/compliance/dpia.js';
import { dsarService, slaFor } from '../src/modules/compliance/dsar.js';
import { aiActService } from '../src/modules/compliance/aiact.js';
import { JURISDICTIONS, residencyFor, jurisdictionFor } from '../src/modules/compliance/matrix.js';
import { runPolicyRetention } from '../src/workers/retention.js';
import { c2paAssertion } from '../src/modules/compliance/aiDisclosure.js';

let admin: Session; let user: Session;
beforeAll(async () => { await boot(false); admin = await signup({ admin: true }); user = await signup(); });
afterAll(async () => { await pool.query(`UPDATE feature_flags SET enabled=false WHERE key IN ('ai_kill_switch')`); await pool.query(`UPDATE feature_flags SET enabled=true WHERE key='generation_enabled'`); await shutdown(); });

describe('19. FinOps: custos unitários, tags, simulador, guardrail e cache', () => {
  it('simulador: Pro a R$ 19,90 tem margem negativa nas premissas; otimizações melhoram; break-even coerente', () => {
    const c = { aiCentsPerVideoSecond: 2.8, ttsCentsPerLanguage: 9, infraCentsPerPublication: 2, infraCentsPerUserMonth: 15 };
    const base = simulate(DEFAULT_PROFILES.pro!, c, { priceCents: 1990, taxPct: 8, paymentFeePct: 3.99, paymentFixedCents: 0 }); expect(base.grossMarginPct).toBeLessThan(0);
    const opt = simulate(DEFAULT_PROFILES.pro!, c, { priceCents: 1990, taxPct: 8, paymentFeePct: 3.99, paymentFixedCents: 0, cacheHitRate: 0.1, routingSavingsPct: 0.12, distillShare: 0.3, distillSavingsPct: 0.5 }); expect(opt.grossMarginPct!).toBeGreaterThan(base.grossMarginPct!); expect(opt.cogsCents).toBeLessThan(base.cogsCents);
    const be = breakEvenPrice(DEFAULT_PROFILES.pro!, c, { taxPct: 8, paymentFeePct: 3.99, paymentFixedCents: 0 }, 0); expect(be).toBeGreaterThan(1990); expect(breakEvenPrice(DEFAULT_PROFILES.pro!, c, { taxPct: 8, paymentFeePct: 3.99, paymentFixedCents: 0 }, 40)).toBeGreaterThan(be); expect(simulate(DEFAULT_PROFILES.pro!, c, { priceCents: Math.ceil(be) + 1, taxPct: 8, paymentFeePct: 3.99, paymentFixedCents: 0 }).grossProfitCents).toBeGreaterThanOrEqual(0);
  });
  it('simulador via HTTP exige admin e devolve antes/depois', async () => {
    expect((await http.post('/api/v1/admin/ops/finops/simulate').set(auth(user)).send({ priceCents: 2990 })).status).toBe(403);
    const r = await http.post('/api/v1/admin/ops/finops/simulate').set(auth(admin)).send({ priceCents: 2990, taxPct: 8, profile: 'pro', optimizations: { cacheHitRate: 0.1 } }); expect(r.status).toBe(200); expect(r.body.before.priceCents).toBe(2990); expect(r.body.after.cogsCents).toBeLessThan(r.body.before.cogsCents); expect(r.body.unitCostsSource).toMatch(/assumed|measured/);
  });
  it('importação de custos: linha sem as 5 tags obrigatórias é rejeitada e contabilizada', async () => {
    const tags = { env: 'prod', service: 'api', region: 'sa-east-1', team: 'backend', 'cost-center': 'eng' };
    const r = await http.post('/api/v1/admin/ops/finops/cost-import').set(auth(admin)).send({ rows: [{ date: '2026-10-01', service: 'ecs', costCents: 12345, tags }, { date: '2026-10-01', service: 'rds', costCents: 999, tags: { env: 'prod', service: 'db' } }] });
    expect(r.status).toBe(200); expect(r.body.imported).toBe(1); expect(r.body.rejected).toEqual([{ service: 'rds', missing: ['region', 'team', 'cost-center'] }]); expect(r.body.tagCompliancePct).toBe(50);
  });
  it('custo unitário: custo por vídeo, projeto mais caro e margem por segmento a partir de ai_usage medido', async () => {
    const p = (await pool.query(`INSERT INTO projects (user_id, title, status, duration_sec) VALUES ($1,$2,'ready',30) RETURNING id`, [user.id, `caro-${uniq()}`])).rows[0].id;
    await pool.query(`INSERT INTO ai_usage (user_id, project_id, provider, operation, cost_cents) VALUES ($1,$2,'kling','video',250),($1,$2,'elevenlabs','tts',9)`, [user.id, p]);
    const r = monthRange(); const ue = await finopsService.unitEconomics(r); expect(ue.aiCostTotalCents).toBeGreaterThanOrEqual(259); expect(ue.costPerVideoCents).not.toBeNull(); expect(ue.costPerPublicationCents).toBeNull(); // sem infra importada para publicação: não inventa
    const top = await finopsService.topProjects(r, 10); expect(top[0]!.costCents).toBeGreaterThanOrEqual(259); expect(top.some((t) => t.projectId === p)).toBe(true);
    const gm = await finopsService.grossMargin(r); expect(gm.segments.map((s) => s.segment)).toEqual(expect.arrayContaining(['free', 'pro'])); const free = gm.segments.find((s) => s.segment === 'free')!; expect(typeof free.subsidyCents).toBe('number'); expect(free.revenueCents === 0 ? free.grossMarginPct === null : typeof free.grossMarginPct === 'number').toBe(true);
    const opp = await finopsService.opportunities(r); expect(opp.opportunities.length).toBeGreaterThanOrEqual(10); expect(opp.dataAvailable).toBe(true);
  });
  it('guardrail: hoje > 3× média de 7 dias dispara alerta; kill switch só com a flag; reativação manual auditada', async () => {
    await pool.query(`DELETE FROM ai_usage`); await pool.query(`DELETE FROM growth_alerts WHERE kind='ai_cost_anomaly'`);
    for (let d = 1; d <= 7; d++) await pool.query(`INSERT INTO ai_usage (provider, operation, cost_cents, created_at) VALUES ('kling','video',100, date_trunc('day', now()) - ($1 || ' days')::interval + interval '12 hours')`, [String(d)]);
    await pool.query(`INSERT INTO ai_usage (provider, operation, cost_cents) VALUES ('kling','video',150)`); const calm = await costGuard.evaluate(); expect(calm.anomaly).toBe(false); expect(calm.ratio).toBeCloseTo(1.5, 1);
    await pool.query(`INSERT INTO ai_usage (provider, operation, cost_cents) VALUES ('kling','video',300)`); const spike = await costGuard.evaluate(); expect(spike.anomaly).toBe(true); expect(spike.killed).toBe(false);
    expect((await pool.query(`SELECT 1 FROM growth_alerts WHERE kind='ai_cost_anomaly'`)).rowCount).toBe(1); expect((await pool.query(`SELECT enabled FROM feature_flags WHERE key='generation_enabled'`)).rows[0].enabled).toBe(true);
    await pool.query(`UPDATE feature_flags SET enabled=true WHERE key='ai_kill_switch'`); const { invalidateFlags } = await import('../src/modules/flags.service.js'); await invalidateFlags();
    const k = await costGuard.evaluate(); expect(k.killed).toBe(true); expect((await pool.query(`SELECT enabled FROM feature_flags WHERE key='generation_enabled'`)).rows[0].enabled).toBe(false);
    expect((await http.post('/api/v1/admin/ops/finops/guard/release').set(auth(admin)).send({ reason: 'falso positivo investigado' })).body.generationEnabled).toBe(true); expect((await pool.query(`SELECT enabled FROM feature_flags WHERE key='generation_enabled'`)).rows[0].enabled).toBe(true);
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE action='ai.kill_switch_release'`)).rowCount).toBe(1);
  });
  it('cache: chave estável a espaços/caixa/ordem de refs e sensível a duração/frame anterior; roteador só usa provedores integrados', () => {
    const a = { prompt: ' Praia ', text: 'Olá  mundo', durationSec: 5, referenceKeys: ['b', 'a'], referenceMode: 'image' as const }; const b = { ...a, prompt: 'praia', text: 'olá mundo', referenceKeys: ['a', 'b'] };
    expect(sceneCacheKey(a as never)).toBe(sceneCacheKey(b as never)); expect(sceneCacheKey({ ...b, durationSec: 6 } as never)).not.toBe(sceneCacheKey(b as never)); expect(sceneCacheKey(b as never, 'frame1')).not.toBe(sceneCacheKey(b as never));
    expect(sceneComplexity({ text: 'zoom no produto', durationSec: 3, prompt: 'close-up' })).toBe('simple'); expect(sceneComplexity({ text: 'pessoas dançando e correndo', durationSec: 8, prompt: 'multidão' })).toBe('complex');
    const pick = chooseProvider({ kind: 'video', tier: 'complex' }); expect(pick!.integrated).toBe(true); expect(pick!.name).toBe('kling'); expect(chooseProvider({ kind: 'video', tier: 'simple', includeCandidates: true })!.name).toBe('kling-lite');
    expect(chooseProvider({ kind: 'video', tier: 'complex', breakerOpen: (n) => n === 'kling' })).toBeNull(); expect(PROVIDER_MATRIX.filter((p) => p.integrated && p.name !== 'mock').map((p) => p.name).sort()).toEqual(['elevenlabs', 'kling']);
  });
});

describe('20. Compliance: matriz, DPIA → ROPA, retenção, DSAR, AI Act e consentimento com prova', () => {
  it('matriz corrigida: Canadá = PIPEDA (30 d), EUA 45 d, BR 15 d, UE 30 d; residência EEE/UK/CH → EU; SLA por região', () => {
    expect(jurisdictionFor('CA')!.law).toMatch(/PIPEDA/); expect(JURISDICTIONS.some((j) => /CCPA/.test(j.law) && j.countries.includes('CA'))).toBe(false);
    expect([slaFor('BR'), slaFor('EU'), slaFor('CA'), slaFor('US')]).toEqual([15, 30, 30, 45]); expect(residencyFor('GB')).toBe('EU'); expect(residencyFor('DE')).toBe('EU'); expect(residencyFor('BR')).toBe('BR'); expect(residencyFor('MX')).toBe('US'); expect(residencyFor('CA')).toBe('CA');
  });
  it('ROPA é preenchido automaticamente das atividades e das tabelas; nenhuma tabela com dado pessoal fica órfã', async () => {
    const r = await http.post('/api/v1/admin/ops/compliance/ropa/refresh').set(auth(admin)); expect(r.status).toBe(200); expect(r.body.upserted).toBe(ACTIVITIES.length); expect(r.body.skipped).toEqual([]);
    const list = await http.get('/api/v1/admin/ops/compliance/ropa').set(auth(admin)); expect(list.body.items.length).toBeGreaterThanOrEqual(ACTIVITIES.length); expect(list.body.items.every((i: { retention: string }) => i.retention)).toBe(true);
    expect((await ropaService.stale()).length).toBe(0);
  });
  it('DPIA de provedor de IA: rascunho → revisão humana → aprovado registra ROPA, subprocessador e AI Act; risco alto sem DPA bloqueia', async () => {
    const subject = { kind: 'ai_provider' as const, name: `Provedor-${uniq()}`, purpose: 'Geração de vídeo', dataCategories: ['foto de usuário', 'roteiro'], countries: ['CN'], transferOutsideRegion: true, processesMinors: false };
    const risks = assessRisks({ ...subject, dpaSigned: false }); expect(risks.some((x) => x.level === 'alto')).toBe(true);
    const c = await http.post('/api/v1/admin/ops/compliance/dpia').set(auth(admin)).send(subject); expect(c.status).toBe(200); expect(c.body.status).toBe('in_review'); expect(c.body.markdown).toContain('Revisão humana obrigatória');
    const id = c.body.id; const rv = await http.post(`/api/v1/admin/ops/compliance/dpia/${id}/review`).set(auth(admin)).send({ decision: 'approve', notes: 'ok' }); expect(rv.status).toBe(200); expect(rv.body.status).toBe('approved');
    const after = (await http.get(`/api/v1/admin/ops/compliance/dpia/${id}`).set(auth(admin))).body; expect(after.status).toBe('approved'); expect((await pool.query(`SELECT 1 FROM compliance_ropa WHERE source='dpia' AND processing_activity LIKE $1`, [`%${subject.name}%`])).rowCount).toBe(1); expect((await pool.query(`SELECT 1 FROM ai_act_registrations WHERE model_provider=$1 AND dpia_id=$2`, [subject.name, id])).rowCount).toBe(1); expect((await pool.query(`SELECT status FROM subprocessors WHERE name=$1`, [subject.name])).rows[0].status).toBe('pending_dpa'); expect(after.nextReviewAt).toBeTruthy();
    expect((await http.post(`/api/v1/admin/ops/compliance/dpia/${id}/review`).set(auth(admin)).send({ decision: 'approve' })).status).toBe(409);
    expect((await http.post(`/api/v1/admin/ops/compliance/dpia/${id}/review`).set(auth(user)).send({ decision: 'approve' })).status).toBe(403);
  });
  it('gate de jurisdição: BR liberado; país sem DPIA/matriz pronta bloqueado com motivo', async () => {
    expect((await dpiaService.jurisdictionGate('BR')).allowed).toBe(true); const g = await dpiaService.jurisdictionGate('SG'); expect(g.allowed).toBe(false); expect(g.reason).toBeTruthy(); expect((await dpiaService.jurisdictionGate('ZZ')).allowed).toBe(false);
  });
  it('AI Act: provedores integrados registrados; pendências sem DPIA aprovado listadas', async () => {
    const s = await aiActService.sync(); expect(s.registered).toBe(3); const l = await http.get('/api/v1/admin/ops/compliance/ai-act').set(auth(admin)); expect(l.body.items.map((i: { modelProvider: string }) => i.modelProvider)).toEqual(expect.arrayContaining(['kling', 'elevenlabs', 'openai-moderation'])); expect(l.body.gaps.length).toBeGreaterThan(0); expect(l.body.items[0].riskClassification).toBe('limited');
  });
  it('consentimento com prova: jurisdição, hash de IP/UA e hash de prova gravados', async () => {
    const s = await signup(); await pool.query(`UPDATE users SET country='DE' WHERE id=$1`, [s.id]);
    const r = await http.post('/api/v1/users/me/consents').set(auth(s)).set('user-agent', 'Mozilla/5.0 teste').send({ items: [{ type: 'ai', accepted: true }] }); expect(r.status).toBe(201);
    const c = (await pool.query(`SELECT jurisdiction, user_agent_hash, proof_hash, ip_hash FROM consents WHERE user_id=$1 AND type='ai'`, [s.id])).rows[0]; expect(c.jurisdiction).toBe('EU'); expect(c.user_agent_hash).toMatch(/^[0-9a-f]{64}$/); expect(c.proof_hash).toMatch(/^[0-9a-f]{64}$/); expect(c.ip_hash).toBeTruthy();
  });
  it('retenção: modo seco conta sem apagar; execução apaga o expirado, preserva o novo e registra em retention_runs; vídeo final só em relatório', async () => {
    const old = `old-${uniq()}@t.dev`; const fresh = `new-${uniq()}@t.dev`;
    await pool.query(`INSERT INTO status_subscribers (channel, target, token, created_at) VALUES ('email',$1,'t1', now() - interval '10 days'),('email',$2,'t2', now())`, [old, fresh]);
    await pool.query(`INSERT INTO slo_samples (slo_id, ts, good, total) VALUES ('api-availability', now() - interval '120 days', 1, 1)`).catch(() => undefined);
    const runsBefore = (await pool.query(`SELECT count(*)::int n FROM retention_runs`)).rows[0].n; const dry = await runPolicyRetention({ dryRun: true }); expect(dry.dryRun).toBe(true); expect(dry.unconfirmedSubscribers).toBeGreaterThanOrEqual(1); expect((await pool.query(`SELECT 1 FROM status_subscribers WHERE target=$1`, [old])).rowCount).toBe(1);
    const real = await runPolicyRetention({ dryRun: false }); expect(real.unconfirmedSubscribers).toBeGreaterThanOrEqual(1); expect((await pool.query(`SELECT 1 FROM status_subscribers WHERE target=$1`, [old])).rowCount).toBe(0); expect((await pool.query(`SELECT 1 FROM status_subscribers WHERE target=$1`, [fresh])).rowCount).toBe(1);
    expect(real.eligibleForExpiryReportOnly).toEqual({ finalVideosFree: expect.any(Number), finalVideosPaid: expect.any(Number), rawScenesPastLifecycle: expect.any(Number) });
    expect((await pool.query(`SELECT count(*)::int n FROM retention_runs`)).rows[0].n).toBe(runsBefore + 2); const rep = await http.get('/api/v1/admin/ops/compliance/retention/report?days=1').set(auth(admin)); expect(rep.body.items.length).toBeGreaterThanOrEqual(2); expect(rep.body.items[0].dryRun).toBe(false); expect(rep.body.items.some((i: { dryRun: boolean }) => i.dryRun)).toBe(true);
  });
  it('DSAR: relatório por região com SLA da jurisdição; pedido vencido e próximo do vencimento sinalizados', async () => {
    const eu = await signup(); await pool.query(`UPDATE users SET data_residency_region='EU' WHERE id=$1`, [eu.id]); const br = await signup(); await pool.query(`UPDATE users SET data_residency_region='BR' WHERE id=$1`, [br.id]);
    await pool.query(`INSERT INTO data_export_requests (user_id, status, requested_at) VALUES ($1,'processing', now() - interval '20 days'),($2,'processing', now() - interval '13 days')`, [br.id, eu.id]);
    const r = (await http.get('/api/v1/admin/ops/compliance/dsar?days=60').set(auth(admin))).body; expect(r.byRegion.BR.slaDays).toBe(15); expect(r.byRegion.EU.slaDays).toBe(30); expect(r.byRegion.BR.overdue).toBe(1); expect(r.byRegion.EU.overdue).toBe(0); expect(r.overdue).toBeGreaterThanOrEqual(1);
    expect((await dsarService.report(60)).items.find((i) => i.region === 'BR' && i.status === 'processing')!.overdue).toBe(true);
  });
  it('divulgação de IA: sidecar C2PA-style não assinado e rótulo; limitações explícitas', () => {
    const m = c2paAssertion(Buffer.from('video'), { visible: true }) as Record<string, any>; expect(JSON.stringify(m)).toMatch(/ai|generated|trainedAlgorithmicMedia|c2pa/i); expect(m.signed).toBe(false); expect(JSON.stringify(m)).toContain('EU AI Act art. 50');
  });
});
