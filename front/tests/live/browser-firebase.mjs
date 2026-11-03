// Instalação gratuita — login com Firebase Authentication num navegador de verdade, contra o EMULADOR oficial do Firebase
// (firebase-tools, projeto "demo-*": sem conta, sem custo) e a API real (FIREBASE_PROJECT_ID=demo-nexusreel +
// FIREBASE_AUTH_EMULATOR_HOST). Fluxos: cadastro → verificação de e-mail → app; senha errada; esqueci a senha; Google.
// Uso: emulador em 127.0.0.1:9099 + API em :8787 → node tests/live/browser-firebase.mjs
import { readFileSync } from 'node:fs';
import { launch, serveFront, FRONT_URL } from './launch.mjs';
const API = process.env.NEXUS_API_URL ?? 'http://localhost:8787';
const EMU = process.env.FIREBASE_EMULATOR_URL ?? 'http://127.0.0.1:9099';
const PROJECT = 'demo-nexusreel'; const KEY = 'demo-api-key';
const WEB = new URL('../../web/', import.meta.url);
const cfg = { options: { apiKey: KEY, authDomain: `${PROJECT}.firebaseapp.com`, projectId: PROJECT }, emulatorUrl: EMU };
const html = readFileSync(new URL('index.html', WEB), 'utf8').replace('<head>', `<head><script>window.NEXUS_API_URL=${JSON.stringify(API)};window.NEXUS_FLAGS_ON=["ff_live_backend"];window.NEXUS_FIREBASE=${JSON.stringify(cfg)};</script>`);
const srv = serveFront(html); // NEXUS_SAME_ORIGIN_API: front + API na mesma origem (como o Caddy)
const res = []; const ok = (n, c, x = '') => { res.push(!!c); console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const axe = (p) => p.evaluate(async (src) => { if (!window.axe) { const sc = document.createElement('script'); sc.textContent = src; document.head.appendChild(sc); }
  const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return r.violations.map((x) => `${x.id} (${x.nodes.length})`); }, AXE);
const oob = async (email, type) => { const r = await (await fetch(`${EMU}/emulator/v1/projects/${PROJECT}/oobCodes`)).json(); return (r.oobCodes ?? []).filter((c) => c.email === email && c.requestType === type).at(-1); };
async function session() {
  const run = await launch(); const p = run.page; const errs = []; const calls = [];
  p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|net::ERR|Failed to load resource|auth\/(invalid-credential|wrong-password)/.test(m.text())) errs.push(m.text()); });
  p.on('request', (q) => { if (q.url().startsWith(API)) calls.push(`${q.method()} ${new URL(q.url()).pathname}`); });
  await p.goto(FRONT_URL); await p.getByRole('button', { name: 'Pular' }).click(); await p.waitForSelector('#live-email');
  return { run, p, errs, calls };
}
const consent = async (p) => { await p.waitForSelector('#consent-step', { timeout: 15000 }); await p.fill('#birth', '1990-01-01').catch(() => {}); const cbs = p.locator('#consent-step [role=checkbox]'); await cbs.nth(0).click(); await cbs.nth(1).click(); await p.locator('#consent-step button:not([role])').last().click(); await p.waitForSelector('.tabbar', { timeout: 10000 }); };
const email = `fb-${Date.now()}@test.dev`; const pass1 = 'Sup3rSecret!pass'; const pass2 = 'Outr4Senha!forte';
let s;
try {
  // ---- 1. cadastro → confirmar e-mail → entrar ----
  s = await session(); const { p } = s;
  ok('tela de login no modo Firebase: "Esqueci a senha" e Google; sem o botão Meta', await p.isVisible('#fb-reset') && await p.isVisible('#google-btn') && !(await p.getByRole('button', { name: /Meta/ }).count()));
  await p.fill('#live-email', email); await p.fill('#live-password', pass1); await p.click('#live-signup-btn');
  await p.waitForSelector('#fb-verify', { timeout: 15000 });
  ok('criar conta pede confirmação do e-mail (sem entrar ainda)', (await p.textContent('#fb-verify')).includes(email) && !s.calls.includes('POST /api/v1/auth/firebase'));
  const v1 = await axe(p); ok('tela de confirmação sem violações WCAG 2.2 AA (axe)', v1.length === 0, v1.join(' | '));
  await p.click('#fb-verified'); await p.waitForSelector('#live-info', { timeout: 10000 });
  ok('"Já confirmei" antes de confirmar avisa e não entra', (await p.textContent('#live-info')).includes('Ainda não confirmado') && !s.calls.includes('POST /api/v1/auth/firebase'));
  const ver = await oob(email, 'VERIFY_EMAIL'); ok('o Firebase gerou o e-mail de verificação', !!ver?.oobLink);
  await fetch(ver.oobLink); // usuário abre o link do e-mail
  await p.click('#fb-verified'); await consent(p);
  const me = await p.evaluate(() => window.nxMe);
  ok('confirmado → POST /auth/firebase → sessão do app → consentimento → app', s.calls.includes('POST /api/v1/auth/firebase') && me?.email === email, me?.email);
  ok('sem erros de console (cadastro)', s.errs.length === 0, s.errs.slice(0, 2).join(' | ')); await s.run.close();

  // ---- 2. senha errada ----
  s = await session();
  await s.p.fill('#live-email', email); await s.p.fill('#live-password', 'senha-errada-123'); await s.p.click('#live-login-btn');
  await s.p.waitForSelector('#live-error', { timeout: 10000 });
  ok('senha errada: mensagem clara, sem entrar', (await s.p.textContent('#live-error')).includes('E-mail ou senha incorretos') && !s.calls.includes('POST /api/v1/auth/firebase'));

  // ---- 3. esqueci a senha → nova senha → entrar ----
  await s.p.click('#fb-reset'); await s.p.waitForSelector('#live-info', { timeout: 10000 });
  ok('"Esqueci a senha" envia o link (sem revelar se a conta existe)', (await s.p.textContent('#live-info')).includes('Se houver uma conta'));
  const rst = await oob(email, 'PASSWORD_RESET'); ok('o Firebase gerou o e-mail de redefinição', !!rst?.oobCode);
  const rr = await fetch(`${EMU}/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=${KEY}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ oobCode: rst.oobCode, newPassword: pass2 }) });
  ok('nova senha definida pelo link', rr.ok, String(rr.status));
  await s.p.fill('#live-password', pass2); await s.p.click('#live-login-btn'); await consent(s.p).catch(() => s.p.waitForSelector('.tabbar', { timeout: 10000 }));
  ok('entra com a nova senha (mesma conta)', (await s.p.evaluate(() => window.nxMe?.email)) === email);
  ok('sem erros de console (senha)', s.errs.length === 0, s.errs.slice(0, 2).join(' | ')); await s.run.close();

  // ---- 4. Google ----
  // A janela do Google no SDK carrega https://apis.google.com/js/api.js — bloqueado NESTE ambiente (não verificável aqui).
  // Prova do resto do caminho: login Google no emulador (mesmo token que a janela produziria: sign_in_provider google.com)
  // e troca pela sessão do app dentro do navegador.
  s = await session();
  const g = await s.p.evaluate(async ({ emu, key }) => {
    const r = await fetch(`${emu}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${key}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestUri: 'http://localhost', returnSecureToken: true, postBody: `id_token=${encodeURIComponent(JSON.stringify({ sub: 'g-' + Date.now(), email: `google-${Date.now()}@gmail.test`, email_verified: true }))}&providerId=google.com` }) });
    const j = await r.json(); const t = await window.nxApiClient.firebaseLogin(j.idToken, 'pt-BR'); const me = await window.nxApiClient.request('get', '/users/me');
    return { provider: JSON.parse(atob(j.idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).firebase.sign_in_provider, ok: !!t.accessToken || !!t.csrfToken, email: me.email };
  }, { emu: EMU, key: KEY });
  ok('token do Google (google.com, e-mail verificado) → sessão do app', g.provider === 'google.com' && g.ok && /@gmail\.test$/.test(g.email), `${g.provider} ${g.email}`);
  console.log('     (janela do Google no navegador: não verificável aqui — apis.google.com bloqueado neste ambiente)');
  ok('sem erros de console (Google)', s.errs.length === 0, s.errs.slice(0, 2).join(' | '));
} catch (e) { ok('fluxo', false, String(e).slice(0, 300)); await s?.p.screenshot({ path: new URL('../../../nexusreel-final/audit/evidence/p0-1/browser-firebase-fail.png', import.meta.url).pathname }).catch(() => {}); }
await s?.run.close().catch(() => {}); srv.close();
const f = res.filter((x) => !x).length; console.log(`\nlogin Firebase (emulador): ${res.length - f} OK, ${f} falha(s)`); process.exit(f ? 1 : 0);
