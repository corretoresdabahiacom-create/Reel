// P0-1 etapa 4 — sessão em cookie httpOnly num NAVEGADOR REAL (Chromium), contra o backend real.
// Página do front servida em FRONT_ORIGIN; API em NEXUS_API_URL. Verifica: CORS com credenciais, cookie gravado e
// invisível ao JS, F5 (restore), logout; e que em SITE DIFERENTE o cookie não vai (regra de deploy).
// Uso: NEXUS_API_URL=http://localhost:8787 node tests/live/browser-session.mjs
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
const API = process.env.NEXUS_API_URL ?? 'http://localhost:8787';
const bundle = readFileSync(new URL('../../web/nexus-api.js', import.meta.url), 'utf8');
const page = `<!doctype html><meta charset="utf-8"><script>${bundle}</script><body>ok</body>`;
const srv = createServer((_q, r) => { r.writeHead(200, { 'content-type': 'text/html' }); r.end(page); }).listen(5173);
const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const results = []; const ok = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`); };
async function run(frontOrigin, label) {
  const ctx = await browser.newContext(); const p = await ctx.newPage(); const errors = []; p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await p.goto(`${frontOrigin}/`);
  const email = `br-${Date.now()}-${label}@test.dev`;
  const r = await p.evaluate(async ({ API, email }) => {
    const h = NexusApi.createHttp({ baseUrl: API }); const out = {};
    try { const reg = await h.register({ email, password: 'Sup3rSecret!pass', name: 'Browser', birthDate: '1990-01-01' }); out.refreshInBody = 'refreshToken' in reg; out.csrfInBody = !!reg.csrfToken; } catch (e) { out.registerError = `${e.status} ${e.code}`; return out; }
    out.jsSeesRefreshCookie = document.cookie.includes('nx_rt'); out.me = (await h.request('get', '/users/me')).email;
    const h2 = NexusApi.createHttp({ baseUrl: API }); out.restore = await h2.restore(); try { out.meAfterF5 = (await h2.request('get', '/users/me')).email; } catch (e) { out.meAfterF5Error = `${e.status} ${e.code}`; }
    await h2.logout(); const h3 = NexusApi.createHttp({ baseUrl: API }); out.restoreAfterLogout = await h3.restore();
    return out;
  }, { API, email });
  const cookies = await ctx.cookies(API); const rt = cookies.find((c) => c.name === 'nx_rt');
  await ctx.close(); return { r, rt, errors, email };
}
// 1) mesmo site (localhost:5173 → localhost:8787): tem de funcionar
const same = await run('http://localhost:5173', 'same');
ok('mesmo site: registro em modo cookie, refresh fora do corpo', same.r.refreshInBody === false && same.r.csrfInBody, JSON.stringify(same.r.registerError ?? ''));
ok('mesmo site: JS da página NÃO enxerga o cookie de refresh (HttpOnly)', same.r.jsSeesRefreshCookie === false);
ok('mesmo site: /users/me com o access em memória', same.r.me === same.email);
ok('mesmo site: F5 → restore() renova pelo cookie e /users/me volta a funcionar', same.r.restore === true && same.r.meAfterF5 === same.email, same.r.meAfterF5Error ?? '');
ok('mesmo site: logout invalida — restore depois do logout falha', same.r.restoreAfterLogout === false);
// 2) site diferente (127.0.0.1 → localhost): o navegador não manda SameSite=Strict → sessão não sobrevive ao F5
const cross = await run('http://127.0.0.1:5173', 'cross');
ok('site diferente: o login funciona (CORS ok) mas o F5 NÃO recupera a sessão (cookie Strict não vai)', cross.r.me === cross.email && cross.r.restore === false, JSON.stringify(cross.r));
await browser.close(); srv.close();
const fail = results.filter((x) => !x.ok).length; console.log(`\nnavegador real: ${results.length - fail} OK, ${fail} falha(s)`); process.exit(fail ? 1 : 0);
