// P0-1 etapa 4 — a tela CRIAR do protótipo ligada ao backend real, num Chromium de verdade (flag ff_live_backend).
// Fluxo: cadastro real → consentimento → Criar → foto ENVIADA (arquivo de verdade) → storyboard gerado no servidor →
// cenas geradas no servidor (worker, com chaining) → montagem no servidor → vídeo final tocável → projeto existe na API.
// Uso: NEXUS_API_URL=http://localhost:8787 node tests/live/browser-create.mjs   (API com EMBED_WORKERS=true)
import { launch, playsH264, playback, serveFront, FRONT_URL } from './launch.mjs';
import { readFileSync } from 'node:fs';
import { PNG } from './fixtures.mjs';
const API = process.env.NEXUS_API_URL ?? 'http://localhost:8787';
const WEB = new URL('../../web/', import.meta.url);
const html = readFileSync(new URL('index.html', WEB), 'utf8').replace('<head>', `<head><script>window.NEXUS_API_URL=${JSON.stringify(API)};window.NEXUS_FLAGS_ON=["ff_live_backend"];</script>`);
const srv = serveFront(html); // NEXUS_SAME_ORIGIN_API: front + API na mesma origem (como o Caddy)
const res = []; const ok = (n, c, x = '') => { res.push(!!c); console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const run = await launch(); const p = run.page; console.log(`motor: ${run.engine}`); const errs = []; const apiCalls = [];
p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text()); });
p.on('request', (q) => { if (q.url().startsWith(API)) apiCalls.push(`${q.method()} ${new URL(q.url()).pathname.replace(/[0-9a-f-]{36}/g, ':id')}`); });
try {
  await p.goto(FRONT_URL); await p.getByRole('button', { name: 'Pular' }).click();
  const email = `criar-${Date.now()}@test.dev`;
  await p.fill('#live-email', email); await p.fill('#live-password', 'Sup3rSecret!pass'); await p.click('#live-signup-btn');
  await p.waitForFunction(() => window.nxMe, null, { timeout: 15000 });
  // consentimento (mesmo passo do protótipo)
  await p.fill('#birth', '1990-01-01').catch(() => {});
  const cbs = p.locator('#consent-step [role=checkbox]'); await cbs.nth(0).click();
  await p.locator('#consent-step button:not([role])').last().click();
  await p.waitForSelector('.tabbar', { timeout: 10000 });
  ok('login real → app aberto', true);
  await p.click('.tab-create');
  await p.fill('#script', 'Anúncio de 60s para uma bicicleta elétrica urbana, mostrando o design, a bateria e o conforto no trânsito da cidade.');
  await p.locator('input[type=file][multiple]').first().setInputFiles(['frente', 'lado', 'detalhe'].map((n) => ({ name: `bike-${n}.png`, mimeType: 'image/png', buffer: PNG })));
  await p.waitForFunction(() => document.querySelectorAll('.ph').length >= 3, null, { timeout: 5000 });
  ok('3 fotos reais escolhidas na etapa 1', true);
  await p.getByRole('button', { name: 'Gerar storyboard' }).click();
  await p.waitForFunction(() => document.querySelectorAll('.scard').length >= 6, null, { timeout: 60000 });
  const n = await p.locator('.scard').count();
  ok(`storyboard gerado NO SERVIDOR (${n} cenas)`, apiCalls.includes('PUT /api/v1/uploads/photo') && apiCalls.includes('POST /api/v1/projects') && apiCalls.includes('POST /api/v1/projects/:id/storyboard'), apiCalls.filter((c) => !c.includes('GET')).join(', '));
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.getByRole('button', { name: 'Gerar vídeo de 60s' }).click();
  await p.waitForFunction((k) => document.querySelectorAll('.tl-item').length === k || [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Tentar novamente')), n, { timeout: 300000 });
  const failedRow = await p.evaluate(() => { const r = [...document.querySelectorAll('.vt-row')].find((x) => x.textContent.includes('Tentar novamente')); return r ? r.textContent.slice(0, 200) : ''; });
  ok('nenhuma cena falhou no servidor', !failedRow, failedRow);
  const gens = apiCalls.filter((c) => c === 'POST /api/v1/projects/:id/scenes/:id/generate').length;
  ok(`cada cena gerada no servidor (${gens}/${n}) e montagem pedida`, gens === n && apiCalls.includes('POST /api/v1/projects/:id/assemble'));
  const proj = await p.evaluate(async () => { const a = window.nxApiClient; const list = await a.request('get', '/projects'); return list.items[0]; });
  ok('projeto pronto na API (status ready, vídeo final)', proj && proj.status === 'ready' && /^https?:/.test(proj.finalVideoUrl || ''), proj && `${proj.status} ${String(proj.finalVideoUrl).slice(0, 60)}`);
  const src = await p.evaluate(() => { const v = document.querySelector('video'); return v ? v.currentSrc || v.src : ''; });
  ok('o vídeo na tela é o do servidor', /^https?:/.test(src) && !src.startsWith('mock://'), src.slice(0, 80));
  if (await playsH264(p)) { const pb = await playback(p, '#final-video'); ok(`o vídeo final TOCA na etapa 5 (${run.engine})`, pb.ok, pb.ok ? `${pb.w}×${pb.h}, tocou até ${pb.t.toFixed(1)}s` : pb.why); }
  else if (process.env.NEXUS_REQUIRE_H264 === '1') ok('navegador com H.264 (exigido)', false, run.engine);
  const playable = await fetch(proj.finalVideoUrl).then((r) => r.ok && /video|octet/.test(r.headers.get('content-type') || '')).catch(() => false);
  ok('o vídeo final baixa de verdade (URL assinada)', playable);
  ok('sem erros de console', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) { ok('fluxo completo', false, String(e).slice(0, 300)); await p.screenshot({ path: new URL('../../../nexusreel-final/audit/evidence/p0-1/browser-create-fail.png', import.meta.url).pathname }).catch(() => {}); }
await run.close(); srv.close();
const f = res.filter((x) => !x).length; console.log(`\ntela Criar real: ${res.length - f} OK, ${f} falha(s)`); process.exit(f ? 1 : 0);
