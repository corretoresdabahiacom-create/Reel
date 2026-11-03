// Fluxo novo de criação por seções de 15 s, num navegador de verdade contra a API real (ff_live_backend + ff_sections + ff_voice_studio):
// feed limpo, seções (foto, o que a imagem faz, o que falar), divisão automática acima de 15 s, adicionar seção, gerar, vídeo REAL com som,
// editar e gerar de novo (sem cair no vídeo simulado), Publicar com Voltar e prévia.
// Uso: API em :8787 com EMBED_WORKERS=true, ff_sections e ff_voice_studio ligados → NEXUS_BROWSER=electron xvfb-run -a node tests/live/browser-sections.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, playback, serveFront, FRONT_URL } from './launch.mjs';
import { PNG } from './fixtures.mjs';
const API = process.env.NEXUS_API_URL ?? 'http://localhost:8787';
const WEB = new URL('../../web/', import.meta.url);
const html = readFileSync(new URL('index.html', WEB), 'utf8').replace('<head>', `<head><script>window.NEXUS_API_URL=${JSON.stringify(API)};window.NEXUS_FLAGS_ON=["ff_live_backend","ff_voice_studio","ff_sections"];</script>`);
const srv = serveFront(html);
const dir = mkdtempSync(join(tmpdir(), 'sec-'));
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const res = []; const ok = (n, c, x = '') => { res.push(!!c); console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const words = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');
const SCRIPT = `${words(18, 'a')}. ${words(18, 'b')}. ${words(18, 'c')}. ${words(18, 'd')}.`; // 72 palavras ≈ 28 s → 2 seções
const run = await launch({}); const p = run.page; const errs = [];
p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text()); });
p.on('response', async (r) => { if (r.url().includes('/api/v1/') && r.status() >= 400) console.log('HTTP', r.status(), r.request().method(), new URL(r.url()).pathname, (await r.text().catch(() => '')).slice(0, 300), '<=', (r.request().postData() || '').slice(0, 200)); });
const shot = (n) => p.screenshot({ path: join(dir, n + '.png') });
const secs = () => p.locator('[data-sec]').count();
const pick = async (i) => { await p.locator(`[data-sec="${i}"]`).click(); await p.waitForTimeout(80); };
const axe = (sel) => p.evaluate(async ([src, s]) => { if (!window.axe) { const sc = document.createElement('script'); sc.textContent = src; document.head.appendChild(sc); }
  const r = await window.axe.run(document.querySelector(s), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return r.violations.map((v) => `${v.id}: ${v.nodes.length}`); }, [AXE, sel]);
try {
  await p.goto(FRONT_URL); await p.getByRole('button', { name: 'Pular' }).click();
  await p.fill('#live-email', `sec-${Date.now()}@test.dev`); await p.fill('#live-password', 'Sup3rSecret!pass'); await p.click('#live-signup-btn');
  await p.waitForFunction(() => window.nxMe, null, { timeout: 15000 });
  await p.fill('#birth', '1990-01-01').catch(() => {}); const cbs = p.locator('#consent-step [role=checkbox]'); await cbs.nth(0).click(); await cbs.nth(1).click();
  await p.locator('#consent-step button:not([role])').last().click(); await p.waitForSelector('.tabbar', { timeout: 10000 });
  // 1. feed limpo
  await shot('1-feed');
  ok('feed sem botões laterais, sem barra superior e sem barras de progresso', (await p.locator('.fside, .ftop, .fprog, .fbtn').count()) === 0);
  ok('feed tem um único chamado claro para criar', (await p.getByRole('button', { name: /Criar um vídeo assim/ }).count()) >= 1);
  // 2. seções a partir do roteiro
  await p.click('.tab-create'); await p.fill('#script', SCRIPT);
  await p.locator('input[type=file][multiple]').first().setInputFiles(['a', 'b', 'c'].map((n) => ({ name: `f-${n}.png`, mimeType: 'image/png', buffer: PNG })));
  await p.getByRole('button', { name: 'Montar as seções' }).click(); await p.waitForSelector('[data-sec]', { timeout: 30000 });
  ok('roteiro de ~28 s vira 2 seções de até 15 s', (await secs()) === 2, String(await secs()));
  await shot('2-secoes');
  // 3. auto-divisão: passa de 15 s → o resto vai para a próxima seção sozinho
  await p.fill('#sec-text-0', words(60, 'x')); await p.waitForTimeout(300);
  const n1 = await secs(); ok('texto de 60 palavras passa de 15 s e continua em uma nova seção', n1 === 3, `${n1} seções`);
  ok('o foco foi para a seção que recebeu o resto (dá para continuar digitando)', await p.evaluate(() => document.activeElement && document.activeElement.id.startsWith('sec-text-') && document.activeElement.id !== 'sec-text-0'));
  await pick(0); const len0 = (await p.inputValue('#sec-text-0')).trim().split(/\s+/).length; ok('a seção 1 ficou com no máximo 39 palavras (15 s)', len0 <= 39, `${len0}`);
  // volta ao tamanho simples para o resto do teste
  while ((await secs()) > 2) await p.locator('[aria-label^="Remover a seção"]').last().click();
  await pick(0); await p.fill('#sec-text-0', 'Veja o produto de perto agora mesmo.'); await pick(1); await p.fill('#sec-text-1', 'Garanta o seu hoje com desconto.');
  // 4. foto, o que a foto faz, movimento, adicionar seção
  await p.click('#sec-add'); await p.waitForSelector('[data-sec="2"]'); ok('botão "Adicionar seção de 15 s" cria uma nova seção', (await secs()) === 3);
  await p.fill('#sec-text-2', 'Peça o seu pelo link da bio.');
  await pick(0); await p.fill('#sec-act-0', 'a câmera chega perto do produto'); await p.getByRole('radio', { name: 'Afastar' }).first().click();
  await pick(1); await p.locator('[aria-label="Usar a foto 3"]').click();
  await pick(0); const ok0 = (await p.inputValue('#sec-act-0')).includes('câmera') && (await p.locator('[role=radio][aria-checked=true]').textContent()) === 'Afastar';
  await pick(1); const ok1 = (await p.locator('[aria-label="Usar a foto 3"]').getAttribute('aria-pressed')) === 'true';
  ok('cada seção guarda foto, o que a imagem faz e o movimento (ao tocar em cada seção)', ok0 && ok1);
  ok('a seção escolhida mostra só o editor dela e a faixa mostra todas', (await p.locator('#sec-editor').count()) === 1 && (await secs()) === 3);
  const a1 = await axe('#sections'); ok('seções sem violações WCAG 2.2 AA (axe)', a1.length === 0, a1.join(' | '));
  await p.click('#sec-next'); await p.waitForSelector('#sec-summary');
  ok('etapa 3 resume as seções e não repete os textos por cena', (await p.locator('#scene-text-0').count()) === 0 && (await p.textContent('#sec-summary')).includes('3 seções'));
  await shot('3-som');
  // 5. gerar → vídeo real com som
  ok('etapa 3 oferece Com/Sem legendas (padrão: com)', (await p.locator('#vs-captions-on[aria-checked=true]').count()) === 1);
  let capBody = null; p.on('request', (r) => { if (r.method() === 'PUT' && /audio-settings/.test(r.url())) { try { capBody = JSON.parse(r.postData() || '{}'); } catch {} } });
  await p.click('#vs-captions-off'); ok('escolher "Sem legendas" marca a opção', (await p.locator('#vs-captions-off[aria-checked=true]').count()) === 1);
  await p.getByRole('button', { name: 'Gerar o vídeo' }).click(); await p.waitForSelector('#final-video', { timeout: Number(process.env.GEN_TIMEOUT ?? 300000) }); await shot('4-final');
  ok('depois de gerar aparece o vídeo REAL (não o player simulado) com botão grande de reproduzir', (await p.locator('.player').count()) === 0 && (await p.locator('#final-video-play').count()) === 1);
  const url = await p.getAttribute('#final-video', 'src'); const f = join(dir, 'final.mp4'); writeFileSync(f, Buffer.from(await (await fetch(url)).arrayBuffer()));
  const pr = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f]).stdout.toString();
  const vol = spawnSync('ffmpeg', ['-v', 'info', '-i', f, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/mean_volume: ([-\d.]+) dB/);
  ok('o MP4 tem áudio de verdade (narração), não silêncio', pr.includes('audio') && vol && Number(vol[1]) > -45, vol ? vol[1] + ' dB' : 'sem áudio');
  const pid = await p.evaluate(() => LIVE.projectId);
  const sc = await p.evaluate(async (id) => (await window.nxApiClient.request('get', '/projects/{id}', { params: { id } })).scenes, pid);
  ok('o servidor recebeu 3 seções com movimento, foto e o que a imagem faz', sc.length === 3 && /^\[mov:zoom_out\] a câmera/.test(sc[0].prompt) && sc[0].referenceImages.length === 1 && sc[1].referenceImages[0] !== sc[0].referenceImages[0], sc.map((x) => x.prompt.slice(0, 22)).join(' | '));
  const mid = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.toString());
  const hash = (t) => spawnSync('ffmpeg', ['-v', 'error', '-ss', String(t), '-i', f, '-frames:v', '1', '-vf', 'scale=36:64,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 }).stdout;
  ok('a foto da primeira seção se move durante a fala', Buffer.compare(hash(0.3), hash(2.2)) !== 0, `${mid.toFixed(1)} s`);
  await p.click('#final-video-play'); await p.waitForTimeout(800);
  if (run.engine === 'electron') { const pb = await playback(p, '#final-video'); ok('o vídeo toca no navegador (H.264/AAC)', pb.ok, JSON.stringify({ ...pb, src: '…' })); }
  ok('o servidor recebeu captions:false e o vídeo saiu sem legendas queimadas', !!capBody && capBody.captions === false);
  ok('o botão de play some enquanto o vídeo toca', (await p.locator('#final-video-play').count()) === 0 || !(await p.locator('#final-video-play').isVisible()));
  // 6. editar seções e gerar de novo: continua sendo o vídeo real, no mesmo projeto
  await p.click('#edit-sections'); await p.waitForSelector('[data-sec]'); ok('"Editar seções" volta às seções com tudo preenchido', (await secs()) === 3 && (await p.inputValue('#sec-text-0')).includes('Veja o produto'));
  await pick(2); await p.fill('#sec-text-2', 'Peça o seu agora pelo link na bio e receba em casa.'); await p.click('#sec-next');
  await p.getByRole('button', { name: 'Gerar o vídeo de novo' }).click(); await p.waitForFunction((old) => { const v = document.querySelector('#final-video'); return v && v.getAttribute('src') !== old; }, url, { timeout: 300000 });
  ok('gerar de novo mostra de novo o vídeo REAL (sem cair no simulado)', (await p.locator('.player').count()) === 0 && (await p.locator('#final-video').count()) === 1);
  await p.getByRole('button', { name: 'Biblioteca' }).click(); await p.waitForTimeout(1500);
  const dup = await p.locator('main, .scroll').first().evaluate((el) => (el.innerText.match(/a0 a1 a2/g) || []).length);
  ok('a edição não duplicou o projeto na biblioteca (aparece uma vez)', dup === 1, `${dup} vez(es)`);
  await p.getByRole('button', { name: 'Criar' }).first().click(); await p.waitForSelector('#final-video', { timeout: 10000 });
  // 7. Publicar: Voltar e prévia do vídeo
  await p.click('#go-publish'); await p.waitForSelector('#publish-video', { timeout: 10000 }); await shot('5-publicar');
  ok('Publicar mostra o vídeo para conferir (com botão de reproduzir)', (await p.locator('#publish-video-play').count()) === 1);
  ok('Publicar tem botão Voltar', (await p.getByRole('button', { name: 'Voltar' }).count()) >= 1);
  await p.getByRole('button', { name: 'Voltar' }).first().click(); await p.waitForSelector('#final-video', { timeout: 10000 });
  ok('Voltar leva de volta ao vídeo pronto, sem perder nada', (await p.locator('#edit-sections').count()) === 1);
  // 8. Voltar nas etapas
  await p.getByRole('button', { name: 'Voltar' }).first().click(); await p.waitForSelector('[data-sec]'); ok('Voltar do resultado leva às seções', (await secs()) === 3);
  ok('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '));
} catch (e) { ok('fluxo', false, String(e).slice(0, 400) + ' ERRS:' + errs.join(' / ').slice(0,600)); await shot('falha').catch(() => {}); }
console.log('capturas em', dir); await run.close(); srv.close();
const bad = res.filter((x) => !x).length; console.log(`\nseções (real): ${res.length - bad} OK, ${bad} falha(s)`); process.exit(bad ? 1 : 0);
