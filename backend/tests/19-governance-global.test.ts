import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, pool, uniq, type Session } from './helpers.js';
import { retentionKpis, ltvCents, paybackMonths, magicNumber, ruleOf40, burnMultiple, runwayMonths, growthPct, zAnomaly } from '../src/modules/board/kpis.js';
import { boardService } from '../src/modules/board/board.service.js';
import { residencyService } from '../src/modules/residency/residency.js';
import { resolveProfile, PROFILES } from '../src/modules/i18n-deep/profile.js';
import { render } from '../src/modules/emails/email.service.js';
import { bcpService } from '../src/modules/bcp/bcp.service.js';
import { jaroWinkler, THRESHOLD } from '../src/modules/governance/sanctions.js';
import { fill, variables, generate as genContract, templates } from '../tools/contract-generator/index.js';
import { parse as parseChecklist, validate as validateChecklist, generate as genChecklist, addWorkdays } from '../tools/onboarding-checklist/index.js';
import { classify, sbom, licenseReport } from '../tools/compliance-audit/index.js';
import { catalogReport, scanHardcoded } from '../tools/i18n-check/index.js';
import { pseudoLocalize, isPseudo } from '../tools/i18n-check/pseudo.js';
import { check as checkDataRoom, loadManifest, FOLDERS } from '../tools/data-room-sync/index.js';
import { matrixMd as complianceMd, ropaMd } from '../tools/compliance-audit/docs.js';
import { matrixMd as i18nMd } from '../tools/i18n-check/docs.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

let admin: Session; let admin2: Session; let user: Session;
beforeAll(async () => { await boot(false); admin = await signup({ admin: true }); admin2 = await signup({ admin: true }); user = await signup(); });
afterAll(async () => { delete process.env.DEPLOY_REGION; await shutdown(); });
const idem = () => uniq('idem');
const requestPayout = (s: Session, amountCents: number) => http.post('/api/v1/payouts').set(auth(s)).set('idempotency-key', idem()).send({ source: 'affiliate', amountCents });
const decide = (id: string, a: Session, approve = true) => http.post(`/api/v1/admin/payouts/${id}/decision`).set(auth(a)).send({ approve, reason: approve ? undefined : 'teste' });

describe('21. Governança: KYC, sanções, dupla aprovação e segregação de funções em saques', () => {
  it('saque ≥ R$ 5.000 exige KYC verificado (409 kyc_required); abaixo do limite não exige; KYC rejeitado continua bloqueando', async () => {
    const s = await signup(); await pool.query('UPDATE users SET affiliate_balance_cents=3000000 WHERE id=$1', [s.id]);
    expect((await requestPayout(s, 100000)).status).toBe(201); const blocked = await requestPayout(s, 600000); expect(blocked.status).toBe(409); expect(blocked.body.code).toBe('kyc_required');
    expect((await http.post('/api/v1/users/me/kyc').set(auth(s)).send({ documentType: 'passport', externalRef: 'reject-1' })).body.status).toBe('rejected'); expect((await requestPayout(s, 600000)).status).toBe(409);
    expect((await http.post('/api/v1/users/me/kyc').set(auth(s)).send({ documentType: 'passport', externalRef: 'doc-ok-1' })).body.status).toBe('verified'); expect((await http.get('/api/v1/users/me/kyc').set(auth(s))).body.kycStatus).toBe('verified');
    expect((await requestPayout(s, 600000)).status).toBe(201);
  });
  it('saldo insuficiente continua sendo 402 mesmo sem KYC (ordem das verificações)', async () => { const s = await signup(); await pool.query('UPDATE users SET affiliate_balance_cents=100000 WHERE id=$1', [s.id]); expect((await requestPayout(s, 900000)).status).toBe(402); });
  it('sanções: nome na lista retém o saque (409 sanctions_hold + hold_reason + registro), mesmo com KYC; rejeição estorna', async () => {
    const s = await signup(); await pool.query(`UPDATE users SET name='Ivan Petrovich Sanctionov', affiliate_balance_cents=200000 WHERE id=$1`, [s.id]); const p = await requestPayout(s, 70000); expect(p.status).toBe(201);
    const d = await decide(p.body.id, admin); expect(d.status).toBe(409); expect(d.body.code).toBe('sanctions_hold');
    expect((await pool.query(`SELECT hold_reason, status FROM payout_requests WHERE id=$1`, [p.body.id])).rows[0]).toEqual({ hold_reason: 'sanctions_match', status: 'pending' }); expect((await pool.query(`SELECT count(*)::int n FROM sanctions_checks WHERE user_id=$1`, [s.id])).rows[0].n).toBe(1);
    expect((await pool.query(`SELECT sanctions_cleared FROM users WHERE id=$1`, [s.id])).rows[0].sanctions_cleared).toBe(false);
    expect((await decide(p.body.id, admin, false)).body.status).toBe('rejected'); expect(Number((await pool.query(`SELECT affiliate_balance_cents b FROM users WHERE id=$1`, [s.id])).rows[0].b)).toBe(200000);
    expect(jaroWinkler('ivan petrovich sanctionov', 'ivan petrovich sanctionov')).toBe(1); expect(jaroWinkler('maria silva', 'ivan petrovich sanctionov')).toBeLessThan(THRESHOLD);
  });
  it('nome comum passa na triagem e o resultado fica registrado', async () => {
    const s = await signup(); await pool.query(`UPDATE users SET name='Maria Silva', affiliate_balance_cents=100000 WHERE id=$1`, [s.id]); const p = await requestPayout(s, 60000); const d = await decide(p.body.id, admin); expect(d.status).toBe(200); expect(d.body.status).toBe('paid'); expect((await pool.query(`SELECT sanctions_cleared FROM users WHERE id=$1`, [s.id])).rows[0].sanctions_cleared).toBe(true);
  });
  it('dupla aprovação ≥ R$ 10.000: 1ª aprovação não paga; o mesmo admin não conta duas vezes (409); 2º admin liquida; auditoria registra a 1ª', async () => {
    const s = await signup(); await pool.query(`UPDATE users SET name='Carla Dias', kyc_status='verified', affiliate_balance_cents=5000000 WHERE id=$1`, [s.id]); const p = await requestPayout(s, 1_100_000); expect(p.status).toBe(201);
    const a1 = await decide(p.body.id, admin); expect(a1.status).toBe(200); expect(a1.body.status).toBe('pending'); expect(a1.body.awaitingSecondApproval).toBe(true);
    const again = await decide(p.body.id, admin); expect(again.status).toBe(409); expect(again.body.code).toBe('dual_approval_same_admin');
    const a2 = await decide(p.body.id, admin2); expect(a2.status).toBe(200); expect(a2.body.status).toBe('paid');
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE action='payout.first_approval' AND target_id=$1`, [p.body.id])).rowCount).toBe(1);
  });
  it('segregação: admin não aprova o próprio saque (403 self_approval)', async () => {
    await pool.query(`UPDATE users SET affiliate_balance_cents=200000, name='Admin Pagador' WHERE id=$1`, [admin.id]); const p = await requestPayout(admin, 70000); expect(p.status).toBe(201); const d = await decide(p.body.id, admin); expect(d.status).toBe(403); expect(d.body.code).toBe('self_approval');
    expect((await decide(p.body.id, admin2)).body.status).toBe('paid');
  });
  it('licenças e SBOM: copyleft forte negado; permissivas ok; exceção registrada vale; SBOM CycloneDX com hashes', () => {
    expect(classify('MIT')).toBe('ok'); expect(classify('(MIT OR Apache-2.0)')).toBe('ok'); expect(classify('GPL-3.0')).toBe('denied'); expect(classify('AGPL-3.0-only')).toBe('denied'); expect(classify('UNKNOWN')).toBe('review'); expect(classify('GPL-3.0', ['pkg-x'], 'pkg-x')).toBe('ok'); expect(classify('LGPL-3.0-or-later')).toBe('ok');
    const rep = licenseReport(JSON.parse(readFileSync('docs/GOVERNANCE/license-exceptions.json', 'utf8')).packages); expect(rep.total).toBeGreaterThan(100); expect(rep.denied).toEqual([]); expect(rep.review).toEqual([]);
    const b = sbom() as { bomFormat: string; specVersion: string; components: Array<{ purl: string; hashes?: unknown[] }> }; expect(b.bomFormat).toBe('CycloneDX'); expect(b.specVersion).toBe('1.5'); expect(b.components.length).toBe(rep.total); expect(b.components.every((c) => c.purl.startsWith('pkg:npm/'))).toBe(true); expect(b.components.filter((c) => c.hashes).length).toBeGreaterThan(b.components.length * 0.9);
  });
  it('.env.example completo: toda variável lida pelo schema de env e por process.env aparece documentada', () => {
    // Auditoria F6.A1: ~40 variáveis lidas pelo código (Módulos 6–11, C2PA, residência, alertas) não estavam no .env.example.
    const ex = readFileSync('.env.example', 'utf8'); const keys = new Set<string>();
    for (const m of readFileSync('src/config/env.ts', 'utf8').matchAll(/\b([A-Z][A-Z0-9_]{2,}):\s*(?:z\.|num\(|bool\(|list\()/g)) keys.add(m[1]!);
    const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.ts') ? [join(d, e.name)] : []);
    for (const f of [...walk('src'), ...walk('tools'), ...walk('scripts')]) for (const m of readFileSync(f, 'utf8').matchAll(/process\.env\.([A-Z][A-Z0-9_]{2,})/g)) keys.add(m[1]!);
    const base = ['NODE_ENV', 'CI', 'HOME', 'PATH', 'PWD', 'TZ', 'VITEST'];
    expect([...keys].filter((k) => !base.includes(k) && !new RegExp(`\\b${k}\\b`).test(ex)).sort()).toEqual([]);
  });
  it('SBOM versionado (docs/GOVERNANCE e data room) está em dia com o package-lock: mesmos componentes de produção', () => {
    // Auditoria X10: o teste acima só valida o SBOM gerado em memória; este impede que o arquivo commitado fique desatualizado.
    const want = new Set((sbom() as { components: Array<{ purl: string }> }).components.map((c) => c.purl));
    for (const f of ['docs/GOVERNANCE/sbom.cdx.json', 'docs/DATA_ROOM/Technology/sbom.cdx.json']) {
      const got = new Set((JSON.parse(readFileSync(f, 'utf8')) as { components: Array<{ purl: string }> }).components.map((c) => c.purl));
      expect([...want].filter((x) => !got.has(x)), `${f}: faltam (rode npm run audit:sbom && npm run dataroom:sync)`).toEqual([]);
      expect([...got].filter((x) => !want.has(x)), `${f}: sobram`).toEqual([]);
    }
  });
});

describe('22. Escala global: residência de dados, painel regional e KPIs de board', () => {
  it('cadastro atribui residência por país; migração admin é auditada e exige motivo', async () => {
    const u = await signup(); expect(await residencyService.assignOnSignup(u.id, 'DE')).toBe('EU'); expect((await http.get('/api/v1/users/me/residency').set(auth(u))).body).toMatchObject({ region: 'EU', cloudRegion: 'eu-west-1' });
    const routes = (await http.get('/api/v1/users/me/residency').set(auth(u))).body.routes; expect(routes.find((r: { dataType: string }) => r.dataType === 'primary_db').storageRegion).toBe('eu-west-1'); expect(routes.find((r: { dataType: string }) => r.dataType === 'ai_inference').storageRegion).toBe('eu');
    expect((await http.post('/api/v1/admin/ops/residency/migrate').set(auth(admin)).send({ userId: u.id, to: 'BR', reason: 'x' })).status).toBe(400);
    const m = await http.post('/api/v1/admin/ops/residency/migrate').set(auth(admin)).send({ userId: u.id, to: 'BR', reason: 'mudou-se para o Brasil (pedido do titular)' }); expect(m.status).toBe(200); expect((await residencyService.homeRegion(u.id))).toBe('BR'); expect((await pool.query(`SELECT 1 FROM audit_logs WHERE action LIKE 'residency%' AND target_id=$1`, [u.id])).rowCount).toBeGreaterThan(0);
  });
  it('deploy regional responde 421 wrong_region com a região de origem; usuários da própria região seguem normalmente', async () => {
    const eu = await signup(); await residencyService.assignOnSignup(eu.id, 'FR'); const br = await signup(); await residencyService.assignOnSignup(br.id, 'BR');
    process.env.DEPLOY_REGION = 'BR';
    try { const w = await http.get('/api/v1/users/me').set(auth(eu)); expect(w.status).toBe(421); expect(w.body.code).toBe('wrong_region'); expect(w.body.details?.homeRegion ?? w.body.homeRegion).toBe('EU'); expect((await http.get('/api/v1/users/me').set(auth(br))).status).toBe(200); }
    finally { delete process.env.DEPLOY_REGION; }
    expect((await http.get('/api/v1/users/me').set(auth(eu))).status).toBe(200);
  });
  it('painel executivo regional: usuários, MAU e custo por região; anomalia de cadastro por z-score', async () => {
    const r = await http.get('/api/v1/admin/ops/regional').set(auth(admin)); expect(r.status).toBe(200); const regs = r.body.regions.map((x: { region: string }) => x.region); expect(regs).toEqual(expect.arrayContaining(['BR', 'EU'])); expect(r.body.regions.find((x: { region: string }) => x.region === 'EU').users).toBeGreaterThanOrEqual(1); expect(r.body.notes.length).toBeGreaterThan(0);
    expect((await http.get('/api/v1/admin/ops/residency/distribution').set(auth(admin))).body.items.length).toBeGreaterThanOrEqual(2); expect(zAnomaly([10, 11, 9, 10, 12, 10, 11], 40).anomaly).toBe(true); expect(zAnomaly([10, 11, 9, 10, 12, 10, 11], 11).anomaly).toBe(false);
  });
  it('KPIs: fórmulas corretas e nulas quando faltam entradas', () => {
    const prev = new Map([['a', 100], ['b', 100], ['c', 100], ['d', 100]]); const curr = new Map([['a', 150], ['b', 80], ['c', 100]]); // d churn; a expande 50; b contrai 20
    const r = retentionKpis({ prevMrr: prev, currMrr: curr }); expect(r.ndrPct).toBeCloseTo(82.5, 5); expect(r.grrPct).toBeCloseTo(70, 5); expect(r.logoChurnPct).toBeCloseTo(25, 5); expect(r.revenueChurnPct).toBeCloseTo(30, 5);
    expect(retentionKpis({ prevMrr: new Map(), currMrr: new Map() }).ndrPct).toBeNull(); expect(growthPct(120, 100)).toBe(20); expect(growthPct(5, 0)).toBeNull();
    expect(ltvCents(4900, 50, 5)).toBe(49000); expect(ltvCents(4900, 50, 0)).toBeNull(); expect(paybackMonths(9800, 4900, 50)).toBe(4); expect(magicNumber(1_200_000, 1_000_000)).toBe(1.2); expect(ruleOf40(30, 15)).toBe(45); expect(ruleOf40(null, 15)).toBeNull();
    expect(burnMultiple(200, 400)).toBe(0.5); expect(burnMultiple(200, -5)).toBeNull(); expect(runwayMonths(1_000_000, 100_000)).toBe(10); expect(runwayMonths(null, 1)).toBeNull();
  });
  it('relatório de board: sem entradas externas os KPIs dependentes ficam nulos e listados; salvar/publicar; publicado não é sobrescrito', async () => {
    const k = await boardService.compute(); expect(k.cacCents).toBeNull(); expect(k.cashRunwayMonths).toBeNull(); expect(k.missingInputs).toEqual(expect.arrayContaining(['marketingSpendCents', 'cashCents'])); expect(k.caveats.join(' ')).toMatch(/auditad/i);
    const period = '2026-09'; const s = await http.post(`/api/v1/admin/ops/board/${period}`).set(auth(admin)).send({ cashCents: 5_000_000, netBurnMonthlyCents: 500_000 }); expect(s.status).toBe(200); expect(Number(s.body.cashRunwayMonths)).toBe(10);
    expect((await http.post(`/api/v1/admin/ops/board/${period}/publish`).set(auth(admin))).status).toBe(200); expect((await http.post(`/api/v1/admin/ops/board/${period}/publish`).set(auth(admin))).status).toBe(404); expect((await http.post(`/api/v1/admin/ops/board/${period}`).set(auth(admin)).send({})).status).toBe(409);
    expect((await http.get('/api/v1/admin/ops/board').set(auth(admin))).body.items[0].period).toBe(period); expect((await http.post('/api/v1/admin/ops/board/2026-9').set(auth(admin)).send({})).status).toBe(422);
  });
});

describe('23. Internacionalização profunda: ES-MX, perfis e pseudolocalização', () => {
  it('perfil ES-MX: formatos, plataformas, pagamentos (OXXO/SPEI), IVA 16%, suporte e regulação', async () => {
    const r = await http.get('/api/v1/i18n/profile?locale=es-MX&country=MX'); expect(r.status).toBe(200); expect(r.body.payments.methods).toEqual(expect.arrayContaining(['oxxo', 'spei'])); expect(r.body.payments.taxName).toBe('IVA'); expect(r.body.payments.taxPct).toBe(16); expect(r.body.payments.currency).toBe('MXN'); expect(r.body.videoFormats[0]).toContain('9:16'); expect(r.body.dominantPlatforms).toContain('mercadolivre'); expect(r.body.musicPackIds.length).toBeGreaterThan(0); expect(r.body.support.language).toBe('es-MX'); expect(r.body.aiRegulation.join(' ')).toMatch(/LFPDPPP/);
  });
  it('país sem perfil dedicado herda o idioma mas usa residência/DSAR da jurisdição real e avisa para revisar; entradas inválidas = 400', async () => {
    const p = resolveProfile('es-MX', 'DE'); expect(p.country).toBe('DE'); expect(p.residency).toBe('EU'); expect(p.dsarDays).toBe(30); expect(p.culturalNotes.join(' ')).toMatch(/revisar localmente/);
    expect((await http.get('/api/v1/i18n/profile?locale=xx')).status).toBe(400); expect((await http.get('/api/v1/i18n/profile?locale=es-MX&country=MEX')).status).toBe(400); for (const pr of PROFILES) expect(resolveProfile(pr.locale, pr.country).residency).toBeTruthy();
  });
  it('usuário pode escolher es-MX e recebe o perfil; e-mail cai para espanhol (es-MX → es), não para português', async () => {
    const u = await signup(); const patch = await http.patch('/api/v1/users/me').set(auth(u)).send({ locale: 'es-MX' }); expect(patch.status).toBe(200); expect(patch.body.locale).toBe('es-MX');
    await pool.query(`UPDATE users SET country='MX' WHERE id=$1`, [u.id]); const prof = await http.get('/api/v1/users/me/i18n-profile').set(auth(u)); expect(prof.body.locale).toBe('es-MX'); expect(prof.body.payments.taxPct).toBe(16);
    expect(render({ to: 'a@b.c', template: 'welcome', locale: 'es-MX', vars: { name: 'Ana' } }).subject).toBe('Bienvenido a NexusReel'); expect(render({ to: 'a@b.c', template: 'welcome', locale: 'fr', vars: {} }).subject).toBe('Bem-vindo ao NexusReel');
  });
  it('pseudolocalização: delimita, acentua, expande e preserva placeholders; catálogos completos; novas strings hardcoded são detectadas', () => {
    const t = pseudoLocalize('Olá ${name}, sua posição: #{pos}'); expect(isPseudo(t)).toBe(true); expect(t).toContain('${name}'); expect(t).toContain('#{pos}'); expect(t.length).toBeGreaterThan('Olá ${name}, sua posição: #{pos}'.length); expect(t).not.toContain('Olá');
    const c = catalogReport(); expect(c.missing).toEqual([]); expect(c.pseudoProblems).toEqual([]); expect(c.fellBack.some((f) => f.locale === 'es-MX' && f.to === 'es')).toBe(true);
    const base: string[] = JSON.parse(readFileSync('tools/i18n-check/baseline.json', 'utf8')).strings; const now = scanHardcoded(); expect(now.filter((x) => !base.includes(x))).toEqual([]); expect(now.length).toBeGreaterThan(0);
    expect(scanHardcoded('tests').length).toBeGreaterThanOrEqual(0);
  });
  it('documentos gerados (compliance, ROPA, i18n) batem com o código — docs não divergem do sistema', () => {
    expect(readFileSync('docs/COMPLIANCE/MATRIX.md', 'utf8')).toBe(complianceMd()); expect(readFileSync('docs/COMPLIANCE/ROPA.md', 'utf8')).toBe(ropaMd()); expect(readFileSync('docs/INTERNATIONALIZATION/MATRIX.md', 'utf8')).toBe(i18nMd());
  });
});

describe('24. Continuidade (BCP) e ferramentas operacionais', () => {
  it('drill de failover de IA: breaker abre e restaura; relata a LACUNA de 2º provedor real (não maquia); registra o exercício', async () => {
    const d = await bcpService.drillAiProviderFailover(); expect(d.steps.every((s) => s.ok)).toBe(true); expect(d.outcome).toBe('gaps_found'); expect(d.gaps.join(' ')).toMatch(/video.*apenas 1 provedor/i); expect(d.gaps.join(' ')).toMatch(/AI_VIDEO_FALLBACK=mock/); expect(d.limitations.length).toBeGreaterThan(0);
    const r = await http.post('/api/v1/admin/ops/bcp/drill/ai_provider_failure').set(auth(admin)); expect(r.status).toBe(200); expect(r.body.outcome).toBe('gaps_found'); expect(r.body.exerciseId).toBeTruthy();
    const sc = (await http.get('/api/v1/admin/ops/bcp/scenarios').set(auth(admin))).body; expect(sc.items.find((x: { name: string }) => x.name === 'ai_provider_failure').lastTestedAt).toBeTruthy(); expect(sc.overdue.map((o: { name: string }) => o.name)).not.toContain('ai_provider_failure'); expect(sc.overdue.map((o: { name: string }) => o.name)).toContain('ransomware'); expect(sc.integratedProviders.video).toEqual(['kling']);
  });
  it('drill de kill switch de plataforma: desliga, valida e RESTAURA a flag; drill de perda de região reporta lacuna UE→fora da UE', async () => {
    const before = (await pool.query(`SELECT enabled FROM feature_flags WHERE key='publish_tiktok'`)).rows[0].enabled; const d = await bcpService.drillPlatformKillSwitch(); expect(d.outcome).toBe('passed'); expect((await pool.query(`SELECT enabled FROM feature_flags WHERE key='publish_tiktok'`)).rows[0].enabled).toBe(before);
    const reg = await bcpService.drillRegionLoss('eu-west-1'); expect(reg.gaps.join(' ')).toMatch(/UE/); expect(reg.steps.find((s) => s.step.includes('usuários'))).toBeTruthy(); expect((await bcpService.drillRegionLoss('sa-east-1')).outcome).toBe('passed');
    expect((await http.post('/api/v1/admin/ops/bcp/drill/ransomware').set(auth(admin))).status).toBe(400);
  });
  it('exercícios: agendar → concluir com resultado e evidência; usuário comum não acessa', async () => {
    const e = await http.post('/api/v1/admin/ops/exercises').set(auth(admin)).send({ kind: 'gameday', name: 'Game day #1 IA', owner: 'sre', scheduledFor: '2026-11-18' }); expect(e.status).toBe(200); expect(e.body.outcome).toBeNull();
    const c = await http.post(`/api/v1/admin/ops/exercises/${e.body.id}/complete`).set(auth(admin)).send({ outcome: 'gaps_found', measuredMinutes: 42, evidenceUrl: 'https://wiki/gameday1' }); expect(c.status).toBe(200); expect(c.body.measuredMinutes).toBe(42); expect((await http.get('/api/v1/admin/ops/exercises').set(auth(user))).status).toBe(403);
  });
  it('contract-generator: preenche todas as variáveis, falha se faltar alguma e não permite injeção de linhas', () => {
    expect(templates().sort()).toEqual(['DPA', 'MSA_LIGHT', 'NDA', 'SLA_ADDENDUM']); expect(variables('a {{x}} b {{ y }} {{x}}')).toEqual(['x', 'y']); expect(() => fill('{{a}} {{b}}', { a: '1' })).toThrow(/b/); expect(fill('{{a}}', { a: 'x\n## injetado' })).toBe('x ## injetado');
    const vars = Object.fromEntries(variables(readFileSync('docs/legal/NDA.md', 'utf8')).map((k) => [k, `v-${k}`])); const out = genContract('NDA', vars); expect(out).toContain('MINUTA GERADA AUTOMATICAMENTE'); expect(out).not.toMatch(/\{\{/);
  });
  it('onboarding: checklist cumpre a meta < 1 semana; validador pega violações; datas ignoram fim de semana', () => {
    const items = parseChecklist(readFileSync('docs/ONBOARDING/CHECKLIST.md', 'utf8')); expect(items.length).toBeGreaterThanOrEqual(15); expect(validateChecklist(items)).toEqual([]); expect(Math.max(...items.map((i) => i.day))).toBeLessThanOrEqual(5);
    expect(validateChecklist([...items, { day: 8, roles: ['all'], text: 'Treinamento extra' }]).join(' ')).toMatch(/dia 5/); expect(validateChecklist(items.filter((i) => !/primeiro PR/i.test(i.text))).join(' ')).toMatch(/primeiro PR/);
    expect(addWorkdays(new Date('2026-11-06T00:00:00Z'), 3).toISOString().slice(0, 10)).toBe('2026-11-10'); const md = genChecklist(items, { name: 'Ana', start: '2026-11-03', role: 'backend' }); expect(md).toContain('Meta: produtivo até 2026-11-09'); expect(genChecklist(items, { name: 'B', start: '2026-11-03', role: 'sre' })).not.toBe(md);
  });
  it('data room: 9 pastas obrigatórias, tudo com fonte no repositório presente e sincronizado; itens externos listados como pendentes', () => {
    const items = loadManifest(); expect(FOLDERS.length).toBe(9); const r = checkDataRoom(items); expect(r.missingFolders).toEqual([]); expect(r.missingSources).toEqual([]); expect(r.stale).toEqual([]); expect(r.externalPending.length).toBeGreaterThan(0); expect(r.externalPending.join(' ')).toMatch(/auditadas/);
    expect(items.every((i) => (FOLDERS as readonly string[]).includes(i.folder))).toBe(true);
  });
});
