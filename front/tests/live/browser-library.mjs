// P0-1 etapa 4 — a tela BIBLIOTECA do protótipo ligada ao backend real, num Chromium de verdade (flag ff_live_backend).
// Prepara pela API (no próprio navegador, com a sessão real): 1 vídeo pronto, 1 rascunho com storyboard e 24 rascunhos simples
// (26 projetos = 2 páginas). Depois confere na tela: lista real paginada, miniatura assinada, vídeo assinado tocando,
// rascunho abrindo no storyboard, erro de rede com "Tentar novamente" e nenhum erro de console.
// Uso: NEXUS_API_URL=http://localhost:8787 node tests/live/browser-library.mjs   (API com EMBED_WORKERS=true)
import { launch, playsH264, playback, SIGNED, hideSig, expireUrl, serveFront, FRONT_URL } from './launch.mjs';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PNG_B64 } from './fixtures.mjs';
const API = process.env.NEXUS_API_URL ?? 'http://localhost:8787';
const WEB = new URL('../../web/', import.meta.url);
const html = readFileSync(new URL('index.html', WEB), 'utf8').replace('<head>', `<head><script>window.NEXUS_API_URL=${JSON.stringify(API)};window.NEXUS_FLAGS_ON=["ff_live_backend"];</script>`);
const srv = serveFront(html); // NEXUS_SAME_ORIGIN_API: front + API na mesma origem (como o Caddy)
const res = []; const ok = (n, c, x = '') => { res.push(!!c); console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const run = await launch(); const p = run.page; console.log(`motor: ${run.engine}`); const errs = []; const apiCalls = [];
p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text()); });
p.on('request', (q) => { if (q.url().startsWith(API)) apiCalls.push(`${q.method()} ${new URL(q.url()).pathname.replace(/[0-9a-f-]{36}/g, ':id')}${q.url().includes('cursor=') ? '?cursor' : ''}${(q.url().match(/[?&]status=(\w+)/) || [])[1] ? '?status=' + q.url().match(/[?&]status=(\w+)/)[1] : ''}`); });
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8'); const axeBad = [];
/** Mesmo critério da auditoria do M11 (WCAG 2.2 AA), agora nas telas ligadas ao backend real. */
const axe = async (name) => { await p.waitForTimeout(250); const v = await p.evaluate(async (src) => { if (!window.axe) { const sc = document.createElement('script'); sc.textContent = src; document.head.appendChild(sc); }
  const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return r.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(', ')}`); }, AXE);
  for (const x of v) axeBad.push(`[${name}] ${x}`); };
const thumbs = () => p.evaluate(() => [...document.querySelectorAll('.grid3 button.thumb')].map((t) => ({ label: t.getAttribute('aria-label'), bg: t.style.background, pill: (t.querySelector('.pill') || {}).textContent })));
try {
  await p.goto(FRONT_URL); await p.getByRole('button', { name: 'Pular' }).click();
  await p.fill('#live-email', `biblioteca-${Date.now()}@test.dev`); await p.fill('#live-password', 'Sup3rSecret!pass'); await p.click('#live-signup-btn');
  await p.waitForFunction(() => window.nxMe, null, { timeout: 15000 });
  await p.fill('#birth', '1990-01-01').catch(() => {});
  const cbs = p.locator('#consent-step [role=checkbox]'); await cbs.nth(0).click();
  await p.locator('#consent-step button:not([role])').last().click();
  await p.waitForSelector('.tabbar', { timeout: 10000 });
  ok('login real → app aberto', true);

  // ---- preparação pela API, com a sessão real do navegador ----
  const seeded = await p.evaluate(async (b64) => {
    const a = window.nxApiClient; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const blob = new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'image/png' });
    const refs = []; for (let i = 0; i < 3; i++) refs.push((await a.upload('put', '/uploads/photo', blob, 'image/png')).ref); // 3 fotos = 3 arquivos
    const mk = (title) => a.request('post', '/projects', { body: { title, script: 'Roteiro de teste da Biblioteca com algumas frases para virar cenas.', photos: refs, locale: 'pt-BR' } });
    const poll = async (id, pick, ms = 180000) => { const t0 = Date.now(); for (;;) { const x = await a.request('get', '/projects/{id}', { params: { id } }); if (pick(x)) return x; if (Date.now() - t0 > ms) throw new Error('timeout ' + id); await sleep(500); } };
    const ready = await mk('Vídeo pronto');
    await a.request('post', '/projects/{id}/storyboard', { params: { id: ready.id }, body: {} });
    let full = await poll(ready.id, (x) => x.scenes && x.scenes.length);
    for (const sc of full.scenes) { await a.request('post', '/projects/{id}/scenes/{sceneId}/generate', { params: { id: ready.id, sceneId: sc.id }, body: {} }); await poll(ready.id, (x) => ['done', 'error'].includes(x.scenes.find((y) => y.id === sc.id).status)); }
    await a.request('post', '/projects/{id}/assemble', { params: { id: ready.id }, body: {} });
    full = await poll(ready.id, (x) => x.status === 'ready' || x.status === 'failed', 240000);
    const draft = await mk('Rascunho com storyboard');
    await a.request('post', '/projects/{id}/storyboard', { params: { id: draft.id }, body: {} });
    const d = await poll(draft.id, (x) => x.scenes && x.scenes.length);
    // 1ª cena já pronta no servidor: ao reabrir, só as outras podem ser geradas (e cobradas)
    await a.request('post', '/projects/{id}/scenes/{sceneId}/generate', { params: { id: draft.id, sceneId: d.scenes[0].id }, body: {} });
    await poll(draft.id, (x) => ['done', 'error'].includes(x.scenes[0].status));
    for (let i = 1; i <= 24; i++) await mk('Rascunho ' + i);
    return { readyStatus: full.status, readyId: ready.id, draftId: draft.id };
  }, PNG_B64);
  ok('preparação: 26 projetos no servidor (1 pronto, 1 com storyboard, 24 rascunhos)', seeded.readyStatus === 'ready', seeded.readyStatus);

  // ---- 1ª página ----
  apiCalls.length = 0;
  await p.locator('.tabbar').getByRole('button', { name: 'Biblioteca' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.grid3 button.thumb').length > 0 || document.querySelector('#lib-error'), null, { timeout: 15000 });
  let t = await thumbs();
  ok('Biblioteca lê GET /projects (1ª página = 24)', apiCalls.includes('GET /api/v1/projects') && t.length === 24, `${t.length} itens; ${apiCalls.join(', ')}`);
  ok('só projetos reais na tela (exemplos do mock sumiram)', t.every((x) => /^Rascunho \d+$/.test(x.label)), t.slice(0, 3).map((x) => x.label).join(' | '));
  await p.waitForFunction(() => document.querySelector('.grid3 button.thumb[data-lazy=loaded]'), null, { timeout: 5000 });
  const thumbUrl = await p.evaluate(() => { const bg = document.querySelector('.grid3 button.thumb[data-lazy=loaded]').style.background; const m = bg.match(/url\("?([^")]+)"?\)/); return m ? m[1] : ''; });
  const thumbOk = await fetch(thumbUrl).then((r) => r.ok && /image/.test(r.headers.get('content-type') || '')).catch(() => false); // a imagem em si, servida pelo storage
  ok('miniatura = foto do servidor com URL assinada, e a imagem carrega', SIGNED.test(thumbUrl) && thumbOk, hideSig(thumbUrl).slice(0, 90));

  // ---- paginação ----
  await p.click('#lib-more');
  await p.waitForFunction(() => document.querySelectorAll('.grid3 button.thumb').length === 26, null, { timeout: 10000 });
  t = await thumbs();
  ok('"Carregar mais" traz a 2ª página pelo cursor (26, sem repetir) e some no fim', apiCalls.includes('GET /api/v1/projects?cursor') && new Set(t.map((x) => x.label)).size === 26 && !(await p.$('#lib-more')), `${t.length} itens`);
  await axe('biblioteca real (26 itens)');
  ok('selos de status do servidor', t.find((x) => x.label === 'Vídeo pronto')?.pill === 'Pronto' && t.find((x) => x.label === 'Rascunho 1')?.pill === 'Rascunho');
  ok('contagem indica que há mais páginas só enquanto há', (await p.textContent('.scroll')).includes('26 itens'));

  // ---- filtro no servidor: o vídeo pronto está na 2ª página, mas "Prontos" o encontra de cara ----
  apiCalls.length = 0;
  await p.locator('.chips .chip', { hasText: 'Prontos' }).click();
  await p.waitForFunction(() => { const t = [...document.querySelectorAll('.grid3 button.thumb')]; return t.length === 1 && t[0].getAttribute('aria-label') === 'Vídeo pronto'; }, null, { timeout: 10000 });
  ok('filtro "Prontos" consulta o servidor (status=ready), não só a página carregada', apiCalls.includes('GET /api/v1/projects?status=ready'), apiCalls.join(', '));

  // ---- abrir o vídeo pronto: detalhe + vídeo assinado tocando ----
  apiCalls.length = 0;
  // URL vencida: a 1ª resposta do detalhe vem com exp no passado → o <video> falha → o player pede uma URL nova sozinho
  await p.route(`**/api/v1/projects/${seeded.readyId}`, async (r) => { const res = await r.fetch(); const j = await res.json(); j.finalVideoUrl = expireUrl(j.finalVideoUrl); await r.fulfill({ response: res, json: j }); }, { times: 1 });
  await p.locator('.grid3 button.thumb', { hasText: 'Vídeo pronto' }).click();
  await p.waitForFunction(() => { const v = document.querySelector('#player-video'); const src = (v && v.getAttribute('src')) || ''; return src && !/[?&]exp=1(&|$)|[?&]Expires=1(&|$)|X-Amz-Date=20200101T000000Z/.test(src); }, null, { timeout: 15000 }).catch(() => {}); // trocou pela URL renovada
  ok('URL vencida é renovada sozinha pelo player (sem laço)', apiCalls.filter((c) => c === 'GET /api/v1/projects/:id').length === 2, apiCalls.filter((c) => c.includes('/projects/:id')).join(', '));
  await p.waitForSelector('#player-video', { timeout: 10000 });
  const vid = await p.evaluate(() => new Promise((r) => { const v = document.querySelector('#player-video'); const done = () => r({ src: v.currentSrc || v.src, w: v.videoWidth, h: v.videoHeight, dur: v.duration, err: v.error && v.error.code });
    if (v.readyState >= 1) return done(); v.addEventListener('loadedmetadata', done, { once: true }); v.addEventListener('error', done, { once: true }); setTimeout(done, 15000); }));
  ok('abrir busca o detalhe (URL assinada de novo)', apiCalls.includes('GET /api/v1/projects/:id'));
  const h264 = await playsH264(p);
  ok('o player usa o vídeo do servidor (URL assinada)', SIGNED.test(vid.src), hideSig(vid.src).slice(0, 90));
  if (h264) { const pb = await playback(p, '#player-video'); ok(`o vídeo do servidor TOCA no player (${run.engine}: metadados + tempo avançando)`, pb.ok && pb.w > 0 && pb.dur > 0, pb.ok ? `${pb.w}×${pb.h}, ${Math.round(pb.dur)}s, tocou até ${pb.t.toFixed(1)}s` : pb.why); }
  else if (process.env.NEXUS_REQUIRE_H264 === '1') ok('navegador com H.264 (exigido)', false, `${run.engine} não toca H.264: rode com NEXUS_BROWSER=electron`);
  else {
    // Chromium aberto do Playwright: sem H.264. Prova parcial: o arquivo da URL assinada decodifica. A prova completa é `npm run test:browser:h264`.
    const r = await fetch(vid.src); const buf = Buffer.from(await r.arrayBuffer());
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height:format=duration', '-of', 'csv=p=0', '-i', 'pipe:0'], { input: buf, encoding: 'utf8' });
    console.log('     (este motor não toca H.264; a reprodução é verificada em npm run test:browser:h264)');
    ok('o arquivo da URL assinada é um vídeo H.264 decodificável', r.ok && probe.status === 0 && /^h264,\d+,\d+/.test(probe.stdout.trim()), `${r.headers.get('content-type')} ${buf.length} bytes; ${probe.stdout.trim().replace(/\n/g, ' ')}`);
  }
  await axe('player com vídeo do servidor');
  await p.locator('.overlay').getByRole('button', { name: /fechar/i }).first().click();

  await p.waitForTimeout(1500); ok('sem laço de renovação (codec não suportado não gera novas buscas)', apiCalls.filter((c) => c === 'GET /api/v1/projects/:id').length === 2);
  await p.locator('.chips .chip', { hasText: 'Tudo' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.grid3 button.thumb').length === 24, null, { timeout: 10000 });
  await p.click('#lib-more'); await p.waitForFunction(() => document.querySelectorAll('.grid3 button.thumb').length === 26, null, { timeout: 10000 });

  // ---- abrir o rascunho com storyboard (1 cena pronta) ----
  await p.locator('.grid3 button.thumb', { hasText: 'Rascunho com storyboard' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.scard').length >= 6, null, { timeout: 10000 });
  const n = await p.locator('.scard').count();
  ok('rascunho abre no storyboard com as cenas do servidor', n >= 6, `${n} cenas`);
  const photoUrls = await p.evaluate(() => [...new Set([...document.querySelectorAll('.scard')].map((e) => (e.style.background.match(/url\("?([^")]+)"?\)/) || [])[1]).filter(Boolean).map((u) => u.split('?')[0]))]);
  ok('as 3 fotos do projeto aparecem nas cenas (todas assinadas, não só a 1ª)', photoUrls.length === 3, `${photoUrls.length} fotos distintas`);
  apiCalls.length = 0;
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByRole('button', { name: /Gerar vídeo de/ }).click();
  await p.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k || [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Tentar novamente')), n, { timeout: 300000 });
  const gens = apiCalls.filter((c) => c === 'POST /api/v1/projects/:id/scenes/:id/generate').length;
  ok(`cena já pronta não é gerada (nem cobrada) de novo: ${gens}/${n - 1} gerações, montagem pedida`, gens === n - 1 && apiCalls.includes('POST /api/v1/projects/:id/assemble'));

  // ---- erro de rede → "Tentar novamente" ----
  await p.route('**/api/v1/projects?*', (r) => r.abort()); await p.route('**/api/v1/projects', (r) => r.abort());
  await p.locator('.tabbar').getByRole('button', { name: 'Biblioteca' }).click();
  await p.waitForSelector('#lib-error', { timeout: 15000 });
  ok('falha de rede mostra erro com "Tentar novamente" (sem tela quebrada)', (await p.textContent('#lib-error')).includes('Tentar novamente'));
  await axe('biblioteca com erro de rede');
  await p.unrouteAll();
  await p.locator('#lib-error').getByRole('button', { name: 'Tentar novamente' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.grid3 button.thumb').length === 24, null, { timeout: 15000 });
  ok('"Tentar novamente" recarrega a lista', true);
  ok('acessibilidade WCAG 2.2 AA (axe) nas telas reais: 0 violações', axeBad.length === 0, axeBad.slice(0, 4).join(' | '));
  ok('sem erros de console', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { ok('fluxo completo', false, String(e).slice(0, 300)); await p.screenshot({ path: new URL('../../../nexusreel-final/audit/evidence/p0-1/browser-library-fail.png', import.meta.url).pathname }).catch(() => {}); }
await run.close(); srv.close();
const f = res.filter((x) => !x).length; console.log(`\ntela Biblioteca real: ${res.length - f} OK, ${f} falha(s)`); process.exit(f ? 1 : 0);
