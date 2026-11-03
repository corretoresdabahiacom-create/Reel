// Módulo 11 — auditoria WCAG 2.2 AA com axe-core em Chromium REAL (contraste e foco precisam de layout; o jsdom não mede).
// Percorre as telas críticas (com as flags dos módulos desligadas e ligadas) e falha se houver violação "critical" ou "serious".
// Uso: node tests/a11y/axe-audit.mjs [--json saida.json]   (CHROMIUM_PATH opcional; no CI: npx playwright-core install chromium)
import { chromium } from 'playwright-core';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const AXE = readFileSync(join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const out = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const exe = process.env.CHROMIUM_PATH || (process.env.CI ? undefined : '/opt/pw-browsers/chromium-1194/chrome-linux/chrome');
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
const results = []; const consoleErrors = []; const kb = [];
/** Teclado (WCAG 2.1.1, 2.4.3, 2.4.7, 2.4.11): Tab percorre a tela; cada foco é visível (contorno/sombra) e não some atrás de nada. */
async function keyboard(p, name, presses = 24) {
  await p.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); }); const seen = []; const bad = [];
  for (let i = 0; i < presses; i++) { await p.keyboard.press('Tab');
    // mede depois de 2 quadros (nada de tempo fixo: sob carga 40 ms não bastavam) e reprova foco fora da camada modal aberta
    const f = await p.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(() => { const e = document.activeElement; if (!e || e === document.body) return ok(null); const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
      const layers = [...document.querySelectorAll('.overlay, .sheet, [aria-modal=true]')].filter((x) => x.getClientRects().length); const top = layers[layers.length - 1]; const escaped = !!top && !top.contains(e);
      const ring = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none');
      const name = (e.getAttribute('aria-label') || e.textContent || e.id || e.tagName).trim().slice(0, 40);
      const hidden = r.width === 0 || r.height === 0 || cs.visibility === 'hidden'; ok({ tag: e.tagName, name, ring, hidden, escaped, sel: e.matches(':focus-visible') }); }))));
    if (!f) continue; seen.push(f.name); if (!f.ring || f.hidden || f.escaped) bad.push(f); }
  kb.push({ screen: name, focused: seen.length, unique: new Set(seen).size, problems: bad });
}
/** Tela assentada: 2 quadros + nenhuma animação CSS finita em andamento (máx. 3 s). Substitui os tempos fixos, que falhavam sob carga. */
const settle = (p) => p.evaluate(() => new Promise((ok) => { const t0 = performance.now(); const step = () => requestAnimationFrame(() => requestAnimationFrame(() => {
  const busy = document.getAnimations().some((a) => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming?.().endTime ?? Infinity));
  if (!busy || performance.now() - t0 > 3000) ok(); else setTimeout(step, 50); })); step(); }));
async function audit(p, name) {
  await settle(p);
  const r = await p.evaluate(async ([src, tags]) => { if (!window.axe) { const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s); }
    const res = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ')) })); }, [AXE, TAGS]);
  results.push({ screen: name, violations: r });
}
async function flags(p, keys, on) {
  await p.evaluate(() => { location.hash = '#/__debug'; }); await p.waitForSelector('#debug-ov'); await p.locator('#debug-ov .seg button').nth(3).click();
  for (const f of keys) { const row = p.locator('#dbg-flags .row', { hasText: new RegExp(f + '(?!_)') }) /* chave exata: ff_live ≠ ff_live_backend */; await row.locator('select').selectOption(on ? '100' : '0'); const sw = row.locator('[role=switch]'); if (((await sw.getAttribute('aria-checked')) === 'true') !== on) await sw.click(); }
  await p.locator('#debug-ov .top .iconbtn').last().click(); await p.evaluate(() => { location.hash = ''; }); await p.waitForSelector('#debug-ov', { state: 'detached' }); await settle(p);
}
/** Biblioteca pronta = cartões reais na tela e nenhum esqueleto (antes: 500–600 ms fixos < 650 ms de esqueleto → sob carga o clique caía num esqueleto). */
const openLibrary = async (p) => { await p.locator('.tabbar button').nth(2).click(); await p.waitForSelector('.grid3 button.thumb'); await p.waitForFunction(() => !document.querySelector('.skeleton')); };
const openPlayer = async (p) => { await openLibrary(p); await p.locator('.grid3 button.thumb').first().click(); await p.waitForSelector('.overlay'); await settle(p);
  const inside = await p.evaluate(() => document.querySelector('.overlay').contains(document.activeElement)); // WCAG 2.4.3: ao abrir, o foco entra na camada
  if (!inside) kb.push({ screen: 'player: foco ao abrir', focused: 0, unique: 0, problems: [{ tag: 'OVERLAY', name: 'o foco não entrou no player ao abrir', ring: true, hidden: false, escaped: true }] }); };
const close = async (p) => { for (let i = 0; i < 3; i++) { const c = p.locator('.sheet [aria-label=Fechar], .overlay .top .iconbtn').last(); if (!(await c.count())) break; const before = await p.locator('.overlay, .sheet').count(); await c.click({ timeout: 3000 }).catch(() => p.keyboard.press('Escape')); await p.waitForFunction((n) => document.querySelectorAll('.overlay, .sheet').length < n, before, { timeout: 3000 }).catch(() => {}); await settle(p); } };
const ALL = ['ff_audio', 'ff_background', 'ff_elements', 'ff_merge', 'ff_save', 'ff_assets', 'ff_email', 'ff_collaboration', 'ff_timeline', 'ff_transcript', 'ff_agent', 'ff_insights', 'ff_series', 'ff_seal', 'ff_live', 'ff_accessibility', 'ff_teleprompter'];
for (const width of [390, 1280]) {
  const p = await browser.newPage({ viewport: { width, height: width > 800 ? 900 : 844 }, locale: 'pt-BR' }); await p.route(/fonts\./, (r) => r.abort());
  p.on('pageerror', (e) => consoleErrors.push(String(e)));
  await p.goto('file://' + join(root, 'web/index.html')); await p.getByRole('button', { name: 'Pular' }).first().waitFor();
  const tag = (n) => `${n} @${width}px`;
  await audit(p, tag('onboarding'));
  await p.getByRole('button', { name: 'Pular' }).first().click(); await audit(p, tag('login')); await keyboard(p, tag('login'), 12);
  await p.locator('button', { hasText: 'Google' }).first().click(); await p.waitForSelector('#consent-step'); await audit(p, tag('consentimento'));
  await p.fill('#birth', '1990-05-10'); const cbs = p.locator('#consent-step [role=checkbox]'); await cbs.nth(0).click(); await cbs.nth(1).click();
  await p.locator('#consent-step button:not([role])').last().click(); await p.waitForSelector('.tabbar');
  const tabs = ['feed', 'criar', 'biblioteca', 'publicar', 'perfil'];
  for (const [i, n] of tabs.entries()) { await p.locator('.tabbar button').nth(i).click(); await p.waitForFunction((k) => document.querySelectorAll('.tabbar button')[k].getAttribute('aria-current') === 'page' && !document.querySelector('.skeleton'), i); await audit(p, tag(n));
    if (n === 'biblioteca' || n === 'criar') await keyboard(p, tag(n), 16); }
  await openPlayer(p); await audit(p, tag('player (flags OFF)')); await keyboard(p, tag('player'), 30); await close(p);
  await flags(p, ALL, true);
  await openPlayer(p); await audit(p, tag('player (flags ON)'));
  for (const [btn, sel, name] of [['#tx-open', '#tx-ov', 'texto e comandos (M9)'], ['#in-open', '#in-ov', 'previsão (M10)'], ['#se-open', '#se-ov', 'séries (M10)'], ['#cl-open', '#cl-ov', 'colaboração (M8)'], ['#assets-open', '#as-sheet', 'assets (M6)'],
    ['#a11y-open', '#a11y-ov', 'acessibilidade (M11)'], ['#tp-open', '#tp-ov', 'teleprompter (M11)']]) {
    if (!(await p.locator(btn).count())) { results.push({ screen: tag(name), skipped: 'botão ausente' }); continue; }
    await p.locator(btn).click(); await p.waitForSelector(sel); await audit(p, tag(name)); await keyboard(p, tag(name), 16);
    if (btn === '#a11y-open') { // abas por teclado (setas) + estados com conteúdo
      await p.locator('#a11y-tab-captions').focus(); await p.keyboard.press('ArrowRight'); await p.waitForSelector('#a11y-tab-ad[aria-selected=true]', { timeout: 3000 }).catch(() => {});
      if (!(await p.locator('#a11y-tab-ad[aria-selected=true]').count())) kb.push({ screen: tag('abas por setas'), focused: 0, unique: 0, problems: [{ tag: 'TAB', name: 'ArrowRight não trocou de aba', ring: false, hidden: false }] }); else kb.push({ screen: tag('abas por setas (→ troca e foca a próxima)'), focused: 1, unique: 1, problems: [] });
      await p.locator('#ad-gen').click(); await p.waitForSelector('#ad-list'); await audit(p, tag('audiodescrição em revisão (M11)'));
      await p.locator('#a11y-tab-transcript').click(); await p.locator('[data-export=srt]').click(); await p.waitForSelector('#tr-out'); await audit(p, tag('transcrição exportada (M11)'));
    }
    if (btn === '#tp-open') { await p.locator('#tp-rec-ask').click(); await p.waitForSelector('#tp-perm'); await audit(p, tag('teleprompter: pedido de câmera (M11)')); await p.locator('#tp-perm-no').click();
      await p.locator('#tp-count').selectOption('0'); await p.locator('#tp-start').click(); await p.waitForSelector('#tp-stage'); await audit(p, tag('teleprompter lendo (M11)'));
      await p.keyboard.press('Space'); await p.waitForSelector('#tp-pause[aria-pressed=true]', { timeout: 3000 }).catch(() => {}); const paused = await p.locator('#tp-pause[aria-pressed=true]').count(); await p.keyboard.press('ArrowUp'); await p.waitForFunction(() => /140/.test(document.querySelector('#tp-wpm')?.textContent || ''), null, { timeout: 3000 }).catch(() => {}); const w = await p.locator('#tp-wpm').textContent();
      kb.push({ screen: tag('teleprompter por teclado (Espaço pausa, ↑ acelera, Esc sai)'), focused: 3, unique: 3, problems: paused && /140/.test(w) ? [] : [{ tag: 'STAGE', name: 'atalhos não responderam', ring: false, hidden: false }] });
      await p.keyboard.press('Escape'); await p.waitForSelector('#tp-stage', { state: 'detached', timeout: 3000 }).catch(() => {}); if (await p.locator('#tp-stage').count()) kb.push({ screen: tag('Esc'), focused: 0, unique: 0, problems: [{ tag: 'STAGE', name: 'Esc não saiu', ring: false, hidden: false }] }); }
    await close(p); await openPlayer(p);
  }
  await close(p);
  await p.locator('.tabbar button').nth(4).click(); await p.waitForFunction(() => document.querySelectorAll('.tabbar button')[4].getAttribute('aria-current') === 'page'); await p.getByRole('button', { name: 'Modo Business' }).click(); await audit(p, tag('business (gate)'));
  await p.close();
}
await browser.close();
const bad = results.flatMap((r) => (r.violations || []).filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => ({ screen: r.screen, ...v })));
const minor = results.flatMap((r) => (r.violations || []).filter((v) => v.impact !== 'critical' && v.impact !== 'serious').map((v) => ({ screen: r.screen, ...v })));
const kbBad0 = kb.flatMap((k) => k.problems);
const summary = { axe: JSON.parse(readFileSync(join(root, 'node_modules/axe-core/package.json'), 'utf8')).version, keyboardScreens: kb.length, keyboardProblems: kbBad0.length, tags: TAGS, screens: results.length, critical: bad.filter((v) => v.impact === 'critical').length, serious: bad.filter((v) => v.impact === 'serious').length, moderateOrMinor: minor.length, pageErrors: consoleErrors.length };
console.log(JSON.stringify(summary)); for (const v of bad) console.log(`[${v.impact}] ${v.screen} · ${v.id} (${v.nodes}) ${v.help} → ${v.targets.join(' | ')}`);
for (const v of minor) console.log(`[${v.impact}] ${v.screen} · ${v.id} (${v.nodes})`);
const kbBad = kb.flatMap((k) => k.problems.map((x) => ({ screen: k.screen, ...x })));
for (const k of kb) console.log(`[teclado] ${k.screen}: ${k.focused} focos (${k.unique} distintos), ${k.problems.length} sem foco visível`);
for (const x of kbBad) console.log(`[teclado-problema] ${x.screen} · ${x.tag} "${x.name}" ring=${x.ring} hidden=${x.hidden}${x.escaped ? " FORA-DA-CAMADA" : ""}`);
if (out) writeFileSync(out, JSON.stringify({ summary: { ...summary, keyboardProblems: kbBad.length }, results, keyboard: kb }, null, 2));
process.exit(bad.length || consoleErrors.length || kbBad.length ? 1 : 0);
