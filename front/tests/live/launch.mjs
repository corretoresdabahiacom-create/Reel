// Lançador dos testes de tela em navegador real.
//   padrão:                 Chromium do Playwright (build aberto: NÃO toca H.264/AAC)
//   NEXUS_BROWSER=electron: Electron = motor do Chrome com codecs proprietários (H.264/AAC), como Chrome/Safari/WebView.
//                           Precisa de tela: rode com `xvfb-run -a` (npm run test:browser:h264 já faz isso).
import { chromium, _electron } from 'playwright-core';
import { fileURLToPath } from 'node:url';

/** `fakeMic`: arquivo WAV usado como microfone (gravação de voz nos testes), com permissão concedida. */
export async function launch({ width = 390, height = 844, fakeMic = null } = {}) {
  const mic = fakeMic ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-audio-capture=${fakeMic}`] : [];
  if (process.env.NEXUS_BROWSER === 'electron') {
    const exe = process.env.ELECTRON_PATH ?? fileURLToPath(new URL('../../node_modules/electron/dist/electron', import.meta.url));
    const env = { ...process.env, NEXUS_W: String(width), NEXUS_H: String(height), NEXUS_USER_DATA: mkdtempSync(join(tmpdir(), 'nx-electron-')) }; delete env.NODE_OPTIONS; // o Electron recusa algumas opções do Node
    const app = await _electron.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-gpu', '--lang=pt-BR', ...mic, ...(process.env.NEXUS_FRONT_HTTPS === '1' ? ['--ignore-certificate-errors'] : []), fileURLToPath(new URL('./electron-main.cjs', import.meta.url))], env });
    const page = await app.firstWindow();
    return { page, engine: 'electron', close: () => app.close() };
  }
  const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: mic });
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'pt-BR', ignoreHTTPSErrors: process.env.NEXUS_FRONT_HTTPS === '1', ...(fakeMic ? { permissions: ['microphone'] } : {}) });
  return { page: await ctx.newPage(), engine: 'chromium', close: () => browser.close() };
}
/** O navegador toca H.264 (o formato do vídeo final)? */
export const playsH264 = (p) => p.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"') !== '');
/** Espera o <video> carregar e TOCAR de verdade: metadados, dimensões e o tempo avançando (mudo, para o autoplay valer). */
export const playback = (p, sel) => p.evaluate((s) => new Promise((resolve) => {
  const v = document.querySelector(s); if (!v) return resolve({ ok: false, why: 'sem <video>' });
  v.muted = true; const t0 = Date.now();
  const tick = () => { if (v.error) return resolve({ ok: false, why: 'erro ' + v.error.code, src: v.currentSrc });
    if (v.readyState >= 2 && v.currentTime > 0.3) return resolve({ ok: true, w: v.videoWidth, h: v.videoHeight, dur: v.duration, t: v.currentTime, src: v.currentSrc });
    if (Date.now() - t0 > 20000) return resolve({ ok: false, why: `readyState ${v.readyState}, t=${v.currentTime}`, src: v.currentSrc }); if (v.paused) v.play().catch(() => {}); setTimeout(tick, 200); };
  tick(); }), sel);
/** URL assinada em qualquer driver: storage local (sig), S3 (X-Amz-Signature) ou CDN CloudFront (Signature). */
export const SIGNED = /^https?:\/\/.+[?&](sig|X-Amz-Signature|Signature)=/;
export const hideSig = (u) => String(u).replace(/(sig|X-Amz-Signature|Signature)=[^&]+/, '$1=…');
/** Mesma URL, mas já vencida (para testar a renovação), no formato do driver. */
export const expireUrl = (u) => u.replace(/([?&])exp=\d+/, '$1exp=1').replace(/([?&])Expires=\d+/, '$1Expires=1').replace(/([?&])X-Amz-Date=\d{8}T\d{6}Z/, '$1X-Amz-Date=20200101T000000Z');
/**
 * Servidor do front para os testes. Com NEXUS_SAME_ORIGIN_API (ex.: http://localhost:8787) também repassa /api/* para a
 * API — front e API na MESMA origem, como o Caddy da instalação gratuita (cookie Secure/SameSite=Strict de produção).
 */
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync as readFileSyncFs } from 'node:fs';
/** URL do front nos testes: https://localhost (NEXUS_FRONT_HTTPS=1, emula o Caddy) ou http://localhost:5173. */
export const FRONT_URL = process.env.NEXUS_FRONT_HTTPS === '1' ? 'https://localhost/' : 'http://localhost:5173/';
export function serveFront(html, port = 5173) {
  // NEXUS_REAL_CADDY=1: o front vem do Caddy de verdade (infra/free/Caddyfile, config gerada por gen-front-config.sh) — nada a servir aqui
  if (process.env.NEXUS_REAL_CADDY === '1') return { close() {} };
  const WEB = new URL('../../web/', import.meta.url); const target = process.env.NEXUS_SAME_ORIGIN_API ? new URL(process.env.NEXUS_SAME_ORIGIN_API) : null;
  const handler = (q, r) => {
    const path = q.url.split('?')[0];
    if (target && path.startsWith('/api/')) {
      const up = httpRequest({ hostname: target.hostname, port: target.port, path: q.url, method: q.method, headers: { ...q.headers, host: target.host, 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' } }, (res) => { r.writeHead(res.statusCode, res.headers); res.pipe(r); });
      up.on('error', () => { r.writeHead(502); r.end(); }); q.pipe(up); return;
    }
    if (path === '/' || path === '/index.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end(html); }
    try { const b = readFileSyncFs(new URL('.' + path, WEB)); r.writeHead(200, { 'content-type': path.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' }); r.end(b); } catch { r.writeHead(404); r.end(); }
  };
  if (process.env.NEXUS_FRONT_HTTPS === '1') { // HTTPS na 443 com certificado gerado na hora (o navegador de teste aceita)
    const d = mkdtempSync(join(tmpdir(), 'front-tls-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(d, 'k.pem'), '-out', join(d, 'c.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
    return createHttpsServer({ key: readFileSyncFs(join(d, 'k.pem')), cert: readFileSyncFs(join(d, 'c.pem')) }, handler).listen(443);
  }
  return createServer(handler).listen(port);
}
