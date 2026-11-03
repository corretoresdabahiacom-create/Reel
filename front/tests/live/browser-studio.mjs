// Estúdio de voz num navegador de verdade (ff_live_backend + ff_voice_studio), contra a API real:
// escolher voz e OUVIR (texto → voz no servidor), gravar a narração pelo MICROFONE (microfone simulado pelo Chromium
// com um WAV de fala), compor música, gerar o vídeo e conferir que o servidor montou com a gravação e a música.
// Uso: API em :8787 com EMBED_WORKERS=true e o estúdio ligado (ff_voice_studio) → node tests/live/browser-studio.mjs
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, playback, serveFront, FRONT_URL } from './launch.mjs';
import { PNG } from './fixtures.mjs';
const API = process.env.NEXUS_API_URL ?? 'http://localhost:8787';
const WEB = new URL('../../web/', import.meta.url);
const html = readFileSync(new URL('index.html', WEB), 'utf8').replace('<head>', `<head><script>window.NEXUS_API_URL=${JSON.stringify(API)};window.NEXUS_FLAGS_ON=["ff_live_backend","ff_voice_studio"];</script>`);
const srv = serveFront(html);
const SCRIPT = 'Conheça a nova bicicleta elétrica urbana. A bateria dura o dia inteiro. O quadro é leve e resistente. Peça a sua hoje mesmo.';
// "microfone": a pessoa lendo o roteiro (espeak-ng), WAV PCM 16 bits como o Chromium exige, com 1 s de silêncio antes
const dir = mkdtempSync(join(tmpdir(), 'mic-')); const raw = join(dir, 'fala.wav'), mic = join(dir, 'mic.wav');
spawnSync('espeak-ng', ['-v', 'pt-br', '-s', '150', '-w', raw, SCRIPT]);
spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-t', '1', '-i', 'anullsrc=r=22050:cl=mono', '-i', raw, '-filter_complex', '[0:a][1:a]concat=n=2:v=0:a=1', '-ac', '1', '-ar', '44100', '-c:a', 'pcm_s16le', mic]);
const res = []; const ok = (n, c, x = '') => { res.push(!!c); console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const AXE = readFileSync(new URL('../../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const axe = (p) => p.evaluate(async (src) => { if (!window.axe) { const sc = document.createElement('script'); sc.textContent = src; document.head.appendChild(sc); }
  const r = await window.axe.run(document.querySelector('#voice-studio'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] }); return r.violations.map((x) => `${x.id} (${x.nodes.length})`); }, AXE);
const run = await launch({ fakeMic: mic }); const p = run.page; console.log(`motor: ${run.engine}`); const errs = []; const calls = [];
p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_TUNNEL|net::ERR|Failed to load resource/.test(m.text())) errs.push(m.text()); });
p.on('request', (q) => { if (q.url().includes('/api/v1/')) calls.push(`${q.method()} ${new URL(q.url()).pathname.replace(/[0-9a-f-]{36}/g, ':id')}`); });
const AAC = run => run.engine === 'electron';
const audioPlays = (key) => p.evaluate((k) => new Promise((resolve) => { const t0 = Date.now(); const tick = () => { const a = VsPlayer.el; if (a && VsPlayer.key === k && a.error) return resolve({ ok: false, why: 'erro ' + a.error.code }); if (a && VsPlayer.key === k && a.currentTime > 0.2) return resolve({ ok: true, dur: a.duration }); if (Date.now() - t0 > 45000) return resolve({ ok: false, why: `key=${VsPlayer.key} t=${a && a.currentTime}` }); setTimeout(tick, 150); }; tick(); }), key);
try {
  await p.goto(FRONT_URL); await p.getByRole('button', { name: 'Pular' }).click();
  await p.fill('#live-email', `estudio-${Date.now()}@test.dev`); await p.fill('#live-password', 'Sup3rSecret!pass'); await p.click('#live-signup-btn');
  await p.waitForFunction(() => window.nxMe, null, { timeout: 15000 });
  await p.fill('#birth', '1990-01-01').catch(() => {}); const cbs = p.locator('#consent-step [role=checkbox]'); await cbs.nth(0).click(); await cbs.nth(1).click();
  await p.locator('#consent-step button:not([role])').last().click(); await p.waitForSelector('.tabbar', { timeout: 10000 });
  await p.click('.tab-create'); await p.fill('#script', SCRIPT);
  await p.locator('input[type=file][multiple]').first().setInputFiles(['a', 'b', 'c'].map((n) => ({ name: `f-${n}.png`, mimeType: 'image/png', buffer: PNG })));
  await p.getByRole('button', { name: 'Gerar storyboard' }).click(); await p.waitForFunction(() => document.querySelectorAll('.scard').length >= 3, null, { timeout: 60000 });
  await p.getByRole('button', { name: 'Continuar' }).click();
  await p.waitForSelector('#voice-studio', { timeout: 10000 });
  await p.waitForFunction(() => document.querySelectorAll('#voice-studio [aria-label^="Ouvir "]').length >= 3, null, { timeout: 15000 });
  const voices = await p.$$eval('#voice-studio [role=radiogroup][aria-label="Escolha a voz"] .chip', (b) => b.map((x) => x.textContent.trim()));
  ok('etapa 3 mostra o estúdio com as vozes abertas do servidor', voices.some((v) => /Dora/.test(v)) && voices.some((v) => /masculina/.test(v)), voices.join(' | '));
  const v1 = await axe(p); ok('estúdio sem violações WCAG 2.2 AA (axe)', v1.length === 0, v1.join(' | '));
  // ouvir uma voz (texto → voz no servidor)
  await p.click('[aria-label="Ouvir Cadu"]'); const heard = AAC(run) ? await audioPlays('piper:pt_BR-cadu-medium') : await p.waitForFunction(() => VsPlayer.el && /^https?:/.test(VsPlayer.el.src), null, { timeout: 30000 }).then(() => ({ ok: true, note: 'Chromium sem AAC: só confere o link' }), (e) => ({ ok: false, why: String(e).slice(0, 80) }));
  ok('"Ouvir" toca a voz gerada no servidor', heard.ok && calls.includes('POST /api/v1/audio/studio/tts'), JSON.stringify(heard));
  await p.click('[aria-label="Parar Cadu"]').catch(() => {});
  await p.click('#vs-tts-script'); await p.waitForSelector('#vs-tts-download', { timeout: 30000 });
  ok('"Ouvir o roteiro" gera o áudio e oferece "Baixar áudio"', /^https?:\/\//.test(await p.getAttribute('#vs-tts-download', 'href')));
  // gravar a própria voz pelo microfone
  await p.click('#vs-mode-recorded'); await p.click('#vs-rec-start');
  await p.waitForSelector('#vs-rec-stop', { timeout: 5000 }); await p.waitForTimeout(9000); await p.click('#vs-rec-stop');
  await p.waitForSelector('#vs-rec-use', { timeout: 10000 }); await p.click('#vs-rec-use');
  await p.waitForSelector('#vs-rec-saved', { timeout: 60000 }).catch(() => {});
  const saved = await p.textContent('#vs-rec-saved').catch(() => ''); const err1 = await p.textContent('#vs-error').catch(() => '');
  ok('gravar pelo microfone → enviar → narração salva no servidor', /Narração salva/.test(saved) && calls.includes('POST /api/v1/audio/studio/recordings'), saved || err1);
  // música: compor e escolher
  await p.getByRole('radio', { name: 'Calma' }).click(); await p.click('#vs-compose');
  await p.waitForFunction(() => [...document.querySelectorAll('#vs-tracks .chip.on')].some((b) => /Música Calma/.test(b.textContent)), null, { timeout: 60000 });
  ok('"Compor música nova" cria e seleciona a música', calls.includes('POST /api/v1/audio/studio/tracks/compose'));
  const trackTitle = await p.$eval('#vs-tracks .chip.on span', (b) => b.textContent.trim());
  await p.click(`#vs-tracks [aria-label="Ouvir ${trackTitle}"]`); const trackId = await p.evaluate(() => LIVE.audio.trackId); const mus = AAC(run) ? await audioPlays(trackId) : await p.waitForFunction(() => VsPlayer.el && /preview|storage/.test(VsPlayer.el.src), null, { timeout: 30000 }).then(() => ({ ok: true }), () => ({ ok: false })); ok('a música toca na prévia', mus.ok, JSON.stringify(mus));
  await p.fill('#vs-volume', '40').catch(() => {});
  const v2 = await axe(p); ok('estúdio (gravação + música) sem violações WCAG 2.2 AA', v2.length === 0, v2.join(' | '));
  // gerar o vídeo
  await p.getByRole('button', { name: 'Gerar vídeo de 60s' }).click();
  await p.waitForSelector('#final-video', { timeout: 300000 });
  ok('montagem pediu as escolhas de áudio antes de montar', calls.indexOf('PUT /api/v1/projects/:id/audio-settings') >= 0 && calls.indexOf('PUT /api/v1/projects/:id/audio-settings') < calls.lastIndexOf('POST /api/v1/projects/:id/assemble'));
  const pid = await p.evaluate(() => LIVE.projectId);
  const st = await p.evaluate(async (id) => (await window.nxApiClient.request('get', '/projects/{id}/audio-settings', { params: { id } })).settings, pid);
  ok('servidor guardou: narração gravada + música + volume', st?.narration?.mode === 'recorded' && !!st?.music?.trackId && Math.abs(st.music.volume - 0.4) < 0.06, JSON.stringify(st));
  if (process.env.NEXUS_REQUIRE_H264 === '1') { const pb = await playback(p, '#final-video'); ok('vídeo final toca (H.264/AAC)', pb.ok, JSON.stringify(pb)); }
  const url = await p.getAttribute('#final-video', 'src'); const buf = Buffer.from(await (await fetch(url)).arrayBuffer()); const f = join(dir, 'final.mp4'); writeFileSync(f, buf);
  const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.toString());
  ok('o vídeo dura o tempo da gravação (a narração é a sua voz)', dur > 7 && dur < 13, `${dur.toFixed(1)} s`);
  ok('sem erros de console', errs.length === 0, errs.slice(0, 2).join(' | '));
} catch (e) { ok('fluxo', false, String(e).slice(0, 300)); await p.screenshot({ path: join(dir, 'falha.png') }).catch(() => {}); console.log('captura:', join(dir, 'falha.png')); }
await run.close(); srv.close();
const f = res.filter((x) => !x).length; console.log(`\nestúdio de voz (real): ${res.length - f} OK, ${f} falha(s)`); process.exit(f ? 1 : 0);
