// P0-1 etapa 4 — "Excluir projeto" no player, ligado ao backend real (flag ff_live_backend), num navegador de verdade.
// Confere: diálogo acessível (foco preso, Cancelar primeiro), cancelar não apaga, erro de rede não some com o projeto,
// confirmar → DELETE → sai da Biblioteca → API 404 → ARQUIVOS apagados do storage (vídeo e fotos só dele) e a foto
// que outro projeto ainda usa continua lá.
// Uso: NEXUS_API_URL=http://localhost:8787 node tests/live/browser-delete.mjs   (API com EMBED_WORKERS=true)
import { readFileSync } from 'node:fs';
import { PNG_B64 } from './fixtures.mjs';
import { launch, serveFront, FRONT_URL } from './launch.mjs';
const API = process.env.NEXUS_API_URL ?? 'http://localhost:8787';
const WEB = new URL('../../web/', import.meta.url);
const html = readFileSync(new URL('index.html', WEB), 'utf8').replace('<head>', `<head><script>window.NEXUS_API_URL=${JSON.stringify(API)};window.NEXUS_FLAGS_ON=["ff_live_backend"];</script>`);
const srv = serveFront(html); // NEXUS_SAME_ORIGIN_API: front + API na mesma origem (como o Caddy)
const res = []; const ok = (n, c, x = '') => { res.push(!!c); console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const run = await launch(); const p = run.page; console.log(`motor: ${run.engine}`); const errs = []; const apiCalls = [];
p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text()); });
p.on('request', (q) => { if (q.url().startsWith(API)) apiCalls.push(`${q.method()} ${new URL(q.url()).pathname.replace(/[0-9a-f-]{36}/g, ':id')}`); });
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const axe = () => p.evaluate(async (src) => { if (!window.axe) { const sc = document.createElement('script'); sc.textContent = src; document.head.appendChild(sc); }
  const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return r.violations.map((x) => `${x.id} (${x.nodes.length})`); }, AXE);
const status = (u) => fetch(u).then((r) => r.status).catch(() => 0);
try {
  await p.goto(FRONT_URL); await p.getByRole('button', { name: 'Pular' }).click();
  await p.fill('#live-email', `excluir-${Date.now()}@test.dev`); await p.fill('#live-password', 'Sup3rSecret!pass'); await p.click('#live-signup-btn');
  await p.waitForFunction(() => window.nxMe, null, { timeout: 15000 });
  await p.fill('#birth', '1990-01-01').catch(() => {});
  const cbs = p.locator('#consent-step [role=checkbox]'); await cbs.nth(0).click(); await cbs.nth(1).click();
  await p.locator('#consent-step button:not([role])').last().click(); await p.waitForSelector('.tabbar', { timeout: 10000 });
  ok('login real → app aberto', true);

  // ---- preparação: 1 vídeo pronto (3 fotos) + 1 rascunho que REAPROVEITA a 1ª foto ----
  const seed = await p.evaluate(async (b64) => {
    const a = window.nxApiClient; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' });
    const refs = []; for (let i = 0; i < 3; i++) refs.push((await a.upload('put', '/uploads/photo', blob, 'image/png')).ref);
    const poll = async (id, pick, ms = 180000) => { const t0 = Date.now(); for (;;) { const x = await a.request('get', '/projects/{id}', { params: { id } }); if (pick(x)) return x; if (Date.now() - t0 > ms) throw new Error('timeout'); await sleep(500); } };
    const pr = await a.request('post', '/projects', { body: { title: 'Vídeo para excluir', script: 'Roteiro de teste da exclusão com algumas frases para virar cenas.', photos: refs, locale: 'pt-BR' } });
    await a.request('post', '/projects/{id}/storyboard', { params: { id: pr.id }, body: {} });
    let x = await poll(pr.id, (y) => y.scenes && y.scenes.length);
    for (const sc of x.scenes) { await a.request('post', '/projects/{id}/scenes/{sceneId}/generate', { params: { id: pr.id, sceneId: sc.id }, body: {} }); await poll(pr.id, (y) => ['done', 'error'].includes(y.scenes.find((z) => z.id === sc.id).status)); }
    await a.request('post', '/projects/{id}/assemble', { params: { id: pr.id }, body: {} });
    x = await poll(pr.id, (y) => y.status === 'ready' || y.status === 'failed', 240000);
    await a.request('post', '/projects', { body: { title: 'Outro projeto', script: 'Este reaproveita a primeira foto do outro projeto.', photos: [refs[0]], locale: 'pt-BR' } });
    return { id: pr.id, status: x.status, video: x.finalVideoUrl, scene: x.scenes[0].videoUrl, photos: x.photoUrls };
  }, PNG_B64);
  ok('preparação: vídeo pronto com 3 fotos + outro projeto usando a 1ª foto', seed.status === 'ready' && seed.photos.length === 3, seed.status);
  ok('antes de excluir, vídeo, cena e fotos estão no storage', (await status(seed.video)) === 200 && (await status(seed.scene)) === 200 && (await Promise.all(seed.photos.map(status))).every((s) => s === 200));

  // ---- abrir no player ----
  await p.locator('.tabbar').getByRole('button', { name: 'Biblioteca' }).click();
  await p.locator('.grid3 button.thumb', { hasText: 'Vídeo para excluir' }).click();
  await p.waitForSelector('#pj-delete', { timeout: 10000 });
  ok('o player tem "Excluir projeto" (modo real)', await p.isVisible('#pj-delete'));

  // ---- cancelar ----
  await p.click('#pj-delete'); await p.waitForSelector('.sheet');
  await p.waitForFunction(() => document.querySelector('.sheet').contains(document.activeElement));
  const first = await p.evaluate(() => document.activeElement.textContent.trim());
  ok('diálogo abre com o foco dentro dele, em "Cancelar" (o seguro primeiro)', first === 'Cancelar', first);
  for (let i = 0; i < 6; i++) await p.keyboard.press('Tab');
  ok('Tab não sai do diálogo (foco preso na camada do topo)', await p.evaluate(() => document.querySelector('.sheet').contains(document.activeElement)));
  const v1 = await axe(); ok('diálogo sem violações WCAG 2.2 AA (axe)', v1.length === 0, v1.join(' | '));
  await p.getByRole('button', { name: 'Cancelar' }).click(); await p.waitForSelector('.sheet', { state: 'detached' });
  ok('cancelar não apaga nada', !apiCalls.includes('DELETE /api/v1/projects/:id') && (await status(seed.video)) === 200);

  // ---- erro de rede ----
  await p.route('**/api/v1/projects/*', (r) => (r.request().method() === 'DELETE' ? r.abort() : r.continue()));
  await p.click('#pj-delete'); await p.waitForSelector('.sheet'); await p.locator('.sheet').getByRole('button', { name: 'Excluir' }).click();
  await p.waitForFunction(() => /Não foi possível|conexão|rede/i.test(document.body.innerText) , null, { timeout: 15000 }).catch(() => {});
  const warned = await p.evaluate(() => /Não foi possível|conexão|rede/i.test(document.body.innerText)); const stillOpen = await p.isVisible('#pj-delete'); const enabled = await p.isEnabled('#pj-delete');
  ok('falha de rede: avisa, o projeto continua e dá para tentar de novo', warned && stillOpen && enabled && (await status(seed.video)) === 200, `aviso=${warned}`);
  await p.unrouteAll();

  // ---- confirmar ----
  apiCalls.length = 0;
  await p.click('#pj-delete'); await p.waitForSelector('.sheet'); await p.locator('.sheet').getByRole('button', { name: 'Excluir' }).click();
  await p.waitForSelector('.overlay', { state: 'detached', timeout: 15000 });
  await p.waitForFunction(() => document.body.innerText.includes('Projeto excluído'), null, { timeout: 5000 }).catch(() => {});
  ok('confirmar chama DELETE, fecha o player e avisa', apiCalls.includes('DELETE /api/v1/projects/:id') && (await p.evaluate(() => document.body.innerText.includes('Projeto excluído'))));
  ok('sai da Biblioteca na hora', !(await p.locator('.grid3 button.thumb', { hasText: 'Vídeo para excluir' }).count()) && (await p.locator('.grid3 button.thumb', { hasText: 'Outro projeto' }).count()) === 1);
  const api404 = await p.evaluate(async (id) => { try { await window.nxApiClient.request('get', '/projects/{id}', { params: { id } }); return 200; } catch (e) { return e.status; } }, seed.id);
  ok('a API não devolve mais o projeto (404)', api404 === 404, String(api404));

  // ---- arquivos apagados do storage (job em segundo plano) ----
  const t0 = Date.now(); let st = {};
  for (;;) { st = { video: await status(seed.video), scene: await status(seed.scene), p0: await status(seed.photos[0]), p1: await status(seed.photos[1]), p2: await status(seed.photos[2]) }; if ((st.video === 404 && st.p1 === 404) || Date.now() - t0 > 20000) break; await new Promise((r) => setTimeout(r, 500)); }
  ok(`vídeo final e cenas apagados do storage (${((Date.now() - t0) / 1000).toFixed(1)}s)`, st.video === 404 && st.scene === 404, JSON.stringify(st));
  ok('fotos usadas só nele apagadas; a foto que o outro projeto usa continua', st.p1 === 404 && st.p2 === 404 && st.p0 === 200, JSON.stringify(st));
  ok('sem erros de console', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { ok('fluxo completo', false, String(e).slice(0, 300)); await p.screenshot({ path: new URL('../../../nexusreel-final/audit/evidence/p0-1/browser-delete-fail.png', import.meta.url).pathname }).catch(() => {}); }
await run.close(); srv.close();
const f = res.filter((x) => !x).length; console.log(`\nexcluir projeto (real): ${res.length - f} OK, ${f} falha(s)`); process.exit(f ? 1 : 0);
