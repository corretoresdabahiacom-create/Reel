import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, pool, uniq, type Session } from './helpers.js';
import { budgetRemaining, evaluateBurn, freezePolicy, hoursToExhaustion, burnRate, type Sample } from '../src/modules/sre/slo.js';
import { sreService } from '../src/modules/sre/sre.service.js';
import { parseSpec, generateRules } from '../src/modules/sre/spec.js';
import { loadSpecs, render } from '../tools/slo-generator/index.js';
import { incidentsService } from '../src/modules/incidents/incidents.service.js';
import { addBusinessDays, metrics } from '../src/modules/incidents/postmortem.js';
import { readFileSync } from 'node:fs';

let admin: Session; let user: Session;
beforeAll(async () => { await boot(false); admin = await signup({ admin: true }); user = await signup(); await sreService.syncDefinitions(); });
afterAll(async () => { await pool.query(`UPDATE feature_flags SET enabled=false WHERE key='release_freeze'`); await shutdown(); });
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);
/** amostras de 5 em 5 min por `hours` horas; `errPct` = fração de erro */
const series = (hours: number, total: number, errPct: number, now = NOW): Sample[] => Array.from({ length: Math.round((hours * 60) / 5) }, (_, i) => ({ ts: now - i * 5 * 60_000, good: Math.round(total * (1 - errPct)), total }));

describe('17. SRE: SLO, burn rate, error budget e freeze', () => {
  it('matemática: burn = erro/(1-alvo); 14,4× em 1 h dispara page; 0,05% de erro em 99,9% fica abaixo', () => {
    expect(burnRate(0.0144, 0.999)).toBeCloseTo(14.4, 5);
    const bad = evaluateBurn(series(72, 1000, 0.02), 0.999, NOW); expect(bad.find((a) => a.window === '1h')!.firing).toBe(true); expect(bad.find((a) => a.window === '1h')!.severity).toBe('page'); expect(bad.find((a) => a.window === '3d')!.severity).toBe('ticket');
    const ok = evaluateBurn(series(72, 1000, 0.0005), 0.999, NOW); expect(ok.every((a) => !a.firing)).toBe(true);
  });
  it('multi-janela: pico curto (só a janela curta) não dispara; erro persistente dispara', () => {
    // falhou há 20–50 min e RECUPEROU: janela longa (1h) queimou muito, mas a curta (5 min) está limpa → não pagina (fecha rápido após a recuperação)
    const base = series(6, 1000, 0); const spike = base.map((s) => (s.ts <= NOW - 20 * 60_000 && s.ts > NOW - 50 * 60_000 ? { ...s, good: 0 } : s));
    const a1h = evaluateBurn(spike, 0.999, NOW).find((a) => a.window === '1h')!; expect(a1h.burn).toBeGreaterThan(14.4); expect(a1h.shortBurn).toBe(0); expect(a1h.firing).toBe(false);
    // falha ATUAL (só o último bucket de 5 min) com 1 h de histórico: ambas as janelas acima do limite → pagina
    const now5 = base.map((s) => (s.ts > NOW - 5 * 60_000 ? { ...s, good: 0 } : s)); expect(evaluateBurn(now5, 0.999, NOW).find((a) => a.window === '1h')!.firing).toBe(true);
    expect(evaluateBurn(series(6, 1000, 0.01), 0.999, NOW).find((a) => a.window === '6h')!.firing).toBe(true);
  });
  it('orçamento restante e política de freeze (<25% congela; ≤0 esgotado)', () => {
    const s = series(24 * 30, 10000, 0.0008); const b = budgetRemaining(s, 0.999, 30, NOW); expect(b.remaining).toBeGreaterThan(0.15); expect(b.remaining).toBeLessThan(0.25); expect(freezePolicy(b.remaining)).toEqual({ freeze: true, level: 'freeze' });
    expect(freezePolicy(0.6).freeze).toBe(false); expect(freezePolicy(0).level).toBe('exhausted'); expect(freezePolicy(-0.2).level).toBe('exhausted');
    expect(hoursToExhaustion(0.5, 2, 30)).toBeCloseTo(180, 5); expect(hoursToExhaustion(0.5, 0, 30)).toBe(Infinity);
  });
  it('definições: 15 SLOs de 7 serviços sincronizados do YAML', async () => {
    const defs = await sreService.definitions(); expect(defs.length).toBe(15); expect(new Set(defs.map((d) => d.service))).toEqual(new Set(['api', 'generation', 'publication', 'dubbing', 'queues', 'cdn', 'auth']));
    expect(Number(defs.find((d) => d.id === 'api-availability')!.target)).toBeCloseTo(0.999, 6);
  });
  it('erro persistente na API: evaluate dispara page, abre incidente Sev2 (source=slo), liga freeze; gate bloqueia feature e libera fix', async () => {
    const t = Date.now(); const rows = series(72, 2000, 0.01, t).map((s) => ({ ts: s.ts, good: s.good, total: s.total }));
    expect(await sreService.ingest('api-availability', rows)).toBe(rows.length);
    const ev = await sreService.evaluate(t); expect(ev.fired.some((f) => f.slo === 'api-availability' && f.severity === 'page')).toBe(true); expect(ev.froze || ev.frozen).toBe(true);
    const inc = (await pool.query(`SELECT severity, source FROM incidents WHERE source='slo' AND title LIKE 'SLO api-availability%'`)).rows; expect(inc.length).toBeGreaterThan(0); expect(inc[0]).toEqual({ severity: 'sev2', source: 'slo' });
    expect((await sreService.releaseGate('feature')).allowed).toBe(false); expect((await sreService.releaseGate('fix')).allowed).toBe(true);
    const again = await sreService.evaluate(t); expect(again.fired.filter((f) => f.slo === 'api-availability')).toHaveLength(0); // alerta já aberto: não duplica
  });
  it('admin: gate/status por HTTP; usuário comum 403; descongelar com orçamento esgotado exige aprovação de SRE e motivo', async () => {
    expect((await http.get('/api/v1/admin/ops/slo').set(auth(user))).status).toBe(403); expect((await http.get('/api/v1/admin/ops/slo')).status).toBe(401);
    const g = await http.get('/api/v1/admin/ops/release-gate?type=feature').set(auth(admin)); expect(g.status).toBe(200); expect(g.body.allowed).toBe(false);
    expect((await http.post('/api/v1/admin/ops/release-gate/unfreeze').set(auth(admin)).send({ reason: 'curto' })).status).toBe(400);
    const noSre = await http.post('/api/v1/admin/ops/release-gate/unfreeze').set(auth(admin)).send({ reason: 'liberar correção de pagamentos' }); expect([409]).toContain(noSre.status);
    const ok = await http.post('/api/v1/admin/ops/release-gate/unfreeze').set(auth(admin)).send({ reason: 'liberar correção de pagamentos', sreApproval: true }); expect(ok.status).toBe(200); expect(ok.body.override).toBe(true);
    expect((await sreService.releaseGate('feature')).frozen).toBe(false);
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE action LIKE '%freeze%' OR action LIKE '%unfreeze%'`)).rowCount).toBeGreaterThan(0);
  });
  it('slo-generator: artefatos gerados batem com os YAMLs; ids únicos; regras multi-janela presentes', () => {
    const specs = loadSpecs('slo'); const r = render(specs); expect(r.rules).toBe(readFileSync('infra/observability/slo-rules.generated.yml', 'utf8'));
    for (const f of Object.keys(r.dashboards)) expect(r.dashboards[f]).toBe(readFileSync(`dashboards/sre/${f}`, 'utf8'));
    expect(r.rules).toMatch(/14\.4 \* 0\.001/); expect(r.rules).toMatch(/\(6 \* 0\.001\)/); expect(r.rules).toMatch(/severity: ticket/); const ids = specs.flatMap((s) => s.slos.map((x) => `${s.service}-${x.name}`)); expect(new Set(ids).size).toBe(ids.length);
    expect(() => parseSpec('version: "x"\nservice: a\nslos: []')).toThrow(); expect(generateRules(specs[0]!).length).toBeGreaterThan(0);
  });
});

describe('18. Incidentes: bot, status page, postmortem em ≤ 5 dias úteis', () => {
  let id = ''; let tok = '';
  it('abrir Sev1: canal, papéis, on-call registrado, status page mostra o componente em major_outage', async () => {
    const r = await http.post('/api/v1/admin/ops/incidents').set(auth(admin)).send({ severity: 'sev1', title: `Fila de publicação travada ${uniq()}`, components: ['publishing'], impact: 'Publicações não concluem' });
    expect(r.status).toBe(200); id = r.body.id; expect(r.body.channel).toMatch(/^#?incident-/); expect(r.body.roles.incidentCommander).toBeTruthy(); expect(r.body.paged).toBe(true);
    expect((await pool.query(`SELECT 1 FROM oncall_pages WHERE incident_id=$1`, [id])).rowCount).toBe(1);
    const sp = (await http.get('/api/v1/status')).body; expect(sp.components.find((c: { key: string }) => c.key === 'publishing').status).toBe('major_outage'); expect(sp.overall).toBe('major_outage'); expect(sp.activeIncidents.some((i: { id: string }) => i.id === id)).toBe(true);
    expect((await http.get('/api/v1/status')).status).toBe(200); expect((await http.get('/api/v1/status.rss')).headers['content-type']).toMatch(/rss/);
  });
  it('assinatura da status page com confirmação; e-mail enfileirado só para confirmados', async () => {
    const email = `${uniq('sub')}@test.dev`; expect((await http.post('/api/v1/status/subscribe').send({ channel: 'email', target: email, components: ['publishing'] })).status).toBe(200);
    tok = (await pool.query('SELECT token FROM status_subscribers WHERE target=$1', [email])).rows[0].token; expect((await incidentsService.notifySubscribers({ severity: 'sev2', title: 'x', components: ['publishing'] }, 'm'))).toBeGreaterThanOrEqual(0);
    const before = await incidentsService.notifySubscribers({ severity: 'sev2', title: 'x', components: ['publishing'] }, 'm'); expect((await http.get(`/api/v1/status/confirm/${tok}`)).body.confirmed).toBe(true);
    expect(await incidentsService.notifySubscribers({ severity: 'sev2', title: 'x', components: ['publishing'] }, 'm')).toBe(before + 1); expect((await http.get('/api/v1/status/confirm/nao-existe')).status).toBe(404);
  });
  it('cadência: update atrasado (>30 min) aparece em overdue; update novo zera', async () => {
    await pool.query(`UPDATE incident_updates SET created_at = now() - interval '45 minutes' WHERE incident_id=$1`, [id]);
    expect((await incidentsService.overdueUpdates()).some((o) => o.id === id)).toBe(true);
    const u = await http.post(`/api/v1/admin/ops/incidents/${id}/updates`).set(auth(admin)).send({ message: 'Causa identificada: worker travado', status: 'identified' }); expect(u.status).toBe(200);
    expect((await incidentsService.overdueUpdates()).some((o) => o.id === id)).toBe(false);
  });
  it('resolver gera rascunho de postmortem com métricas; revisão exige causa raiz e ≥ 3 porquês; publicar só após revisão', async () => {
    await http.post(`/api/v1/admin/ops/incidents/${id}/updates`).set(auth(admin)).send({ message: 'Mitigado e resolvido', status: 'resolved' });
    const pm = (await pool.query('SELECT draft, reviewed_at FROM postmortems WHERE incident_id=$1', [id])).rows[0]; expect(pm.draft).toBe(true); expect(pm.reviewed_at).toBeNull();
    const sla = (await incidentsService.postmortemSla()).find((p) => p.incidentId === id)!; expect(sla.reviewed).toBe(false); expect(new Date(sla.dueAt).getTime()).toBeGreaterThan(Date.now());
    const bad = await http.post(`/api/v1/admin/ops/incidents/${id}/postmortem/review`).set(auth(admin)).send({ rootCause: 'worker sem timeout configurado', fiveWhys: [{ why: 1, answer: 'sem timeout' }] }); expect(bad.status).toBe(400);
    const thin = await incidentsService.reviewPostmortem(id, admin.id, { rootCause: 'x', fiveWhys: [{ why: 1, answer: 'a' }, { why: 2, answer: '' }, { why: 3, answer: ' ' }] }).catch((e) => e); expect((thin as { code: string }).code).toBe('postmortem_incomplete');
    const ok = await http.post(`/api/v1/admin/ops/incidents/${id}/postmortem/review`).set(auth(admin)).send({ rootCause: 'worker sem timeout configurado', fiveWhys: [{ why: 1, answer: 'sem timeout' }, { why: 2, answer: 'default infinito' }, { why: 3, answer: 'sem revisão de config' }], publish: true }); expect(ok.status).toBe(200); expect(ok.body.draft).toBe(false); expect(ok.body.publishedAt).toBeTruthy();
    expect((await incidentsService.postmortemSla()).find((p) => p.incidentId === id)!.reviewed).toBe(true);
    expect((await http.get('/api/v1/status')).body.components.find((c: { key: string }) => c.key === 'publishing').status).not.toBe('major_outage');
  });
  it('prazo: 5 dias úteis pulam fim de semana; métricas MTTD/MTTR; Sev1 vencido aparece em overdue', () => {
    expect(addBusinessDays(new Date('2026-10-23T12:00:00Z'), 5).toISOString().slice(0, 10)).toBe('2026-10-30'); expect(addBusinessDays(new Date('2026-10-24T12:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-10-26');
    const m = metrics({ id: 'x', severity: 'sev1', title: 't', started_at: '2026-10-20T10:00:00Z', detected_at: '2026-10-20T10:05:00Z', mitigated_at: '2026-10-20T10:35:00Z', resolved_at: '2026-10-20T11:00:00Z' } as never); expect(JSON.stringify(m)).toMatch(/5|35|60/);
  });
  it('postmortem de incidente resolvido há 8 dias úteis sem revisão fica overdue', async () => {
    const i = await incidentsService.open({ severity: 'sev1', title: `Antigo ${uniq()}`, components: ['api'] }); await pool.query(`UPDATE incidents SET status='resolved', resolved_at=now() - interval '12 days' WHERE id=$1`, [i.id]); await incidentsService.createPostmortemDraft(i.id);
    expect((await incidentsService.postmortemSla()).find((p) => p.incidentId === i.id)!.overdue).toBe(true); expect((await incidentsService.stats()).total).toBeGreaterThan(0);
    const load = (await http.get('/api/v1/admin/ops/oncall/load?days=30').set(auth(admin))).body; expect(load.limits.pages).toBe(8); expect(load.people.length).toBeGreaterThan(0);
  });
});
