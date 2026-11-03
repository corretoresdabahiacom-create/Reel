// P0-1 etapa 4 — a TELA de login do protótipo ligada ao backend real, num Chromium de verdade (flag ff_live_backend).
// Uso: NEXUS_API_URL=http://localhost:8787 node tests/live/browser-login.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const API = process.env.NEXUS_API_URL ?? 'http://localhost:8787';
const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8').replace('<head>', `<head><script>window.NEXUS_API_URL=${JSON.stringify(API)};window.NEXUS_FLAGS_ON=["ff_live_backend"];</script>`);
const api = readFileSync(new URL('../../web/nexus-api.js', import.meta.url));
const WEB = new URL('../../web/', import.meta.url);
const serve = (page) => (q, r) => { const path = q.url.split('?')[0]; if (path === '/' || path === '/index.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(page); }
  try { const body = readFileSync(new URL('.' + path, WEB)); r.writeHead(200, { 'content-type': path.endsWith('.js') ? 'text/javascript' : path.endsWith('.json') || path.endsWith('.webmanifest') ? 'application/json' : 'application/octet-stream' }); r.end(body); } catch { r.writeHead(404); r.end(); } };
void api; const srv = createServer(serve(html)).listen(5173);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const res = []; const ok = (n, c, x = '') => { res.push(!!c); console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' }); const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|net::ERR/.test(m.text())) errs.push(m.text()); });
await p.goto('http://localhost:5173/'); await p.getByRole('button', { name: 'Pular' }).click();
ok('com ff_live_backend: a tela de login mostra o formulário real', await p.locator('#live-login').isVisible());
const email = `tela-${Date.now()}@test.dev`;
await p.fill('#live-email', email); await p.fill('#live-password', 'curta'); await p.click('#live-login-btn');
ok('validação do navegador barra senha curta (sem ir à rede)', await p.evaluate(() => !document.querySelector('#live-password').checkValidity()));
await p.fill('#live-password', 'Sup3rSecret!pass'); await p.click('#live-signup-btn');
await p.waitForFunction(() => window.nxMe, null, { timeout: 15000 }).catch(() => {});
ok('Criar conta → backend real → segue para o consentimento', await p.evaluate((e) => window.nxMe && window.nxMe.email === e, email));
ok('o cookie de refresh existe e é httpOnly (invisível ao JS)', (await ctx.cookies()).some((c) => c.name === 'nx_rt' && c.httpOnly) && !(await p.evaluate(() => document.cookie.includes('nx_rt'))));
await p.reload(); const restored = await p.evaluate(async () => { const s = document.createElement('script'); s.src = 'nexus-api.js'; await new Promise((r) => { s.onload = r; document.head.appendChild(s); }); const a = window.NexusApi.createHttp({ baseUrl: window.NEXUS_API_URL }); const ok = await a.restore(); return ok && (await a.request('get', '/users/me')).email; });
ok('F5: a sessão volta pelo cookie', restored === email);
const p2 = await (await browser.newContext({ locale: 'pt-BR' })).newPage(); await p2.goto('http://localhost:5173/'); await p2.getByRole('button', { name: 'Pular' }).click();
await p2.fill('#live-email', email); await p2.fill('#live-password', 'SenhaErrada123'); await p2.click('#live-login-btn');
await p2.waitForSelector('#live-error', { timeout: 10000 }).catch(() => {});
ok('senha errada → mensagem clara na tela, sem sair do login', /senha|inválid|credenciais/i.test(await p2.locator('#live-error').textContent().catch(() => '')), await p2.locator('#live-error').textContent().catch(() => '(sem mensagem)'));
ok('sem erros de console', errs.length === 0, errs.slice(0, 3).join(' | '));
// flag desligada: login simulado de sempre, sem formulário
const p3 = await (await browser.newContext({ locale: 'pt-BR' })).newPage(); const htmlOff = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
const s2 = createServer(serve(htmlOff)).listen(5174);
await p3.goto('http://localhost:5174/'); await p3.getByRole('button', { name: 'Pular' }).click();
ok('flag desligada: tela de login idêntica à de antes (sem formulário real)', !(await p3.locator('#live-login').count()));
await browser.close(); srv.close(); s2.close();
const f = res.filter((x) => !x).length; console.log(`\ntela de login real: ${res.length - f} OK, ${f} falha(s)`); process.exit(f ? 1 : 0);
