const { JSDOM } = require('jsdom'); const fs = require('fs');
exports.boot = function boot({ langs = ['pt-BR'], file = require('path').join(__dirname, '../../prototype-nexusreel.html'), storage } = {}) {
  const src = fs.readFileSync(file, 'utf8');
  const app = src.slice(src.lastIndexOf('<script>') + 8, src.lastIndexOf('</script>'));
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x.test/',
    beforeParse(win) { Object.defineProperty(win.navigator, 'languages', { get: () => langs }); Object.defineProperty(win.navigator, 'language', { get: () => langs[0] }); } });
  const w = dom.window, errors = [];
  w.console.error = (...a) => errors.push('ERR ' + a.map(String).join(' ').slice(0, 400));
  w.console.warn = (...a) => errors.push('WARN ' + a.map(String).join(' ').slice(0, 400));
  w.addEventListener('error', (e) => errors.push('UNCAUGHT ' + e.message));
  w.eval(fs.readFileSync(require('path').join(__dirname, '../../web/vendor/react.production.min.js'), 'utf8'));
  w.eval(fs.readFileSync(require('path').join(__dirname, '../../web/vendor/react-dom.production.min.js'), 'utf8'));
  w.eval(fs.readFileSync(require('path').join(__dirname, '../../web/vendor/htm.js'), 'utf8'));
  w.eval(app);
  const d = w.document, wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const all = (sel, root = d) => Array.from(root.querySelectorAll(sel));
  const btn = (t, root = d) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent.trim().includes(t));
  const click = (el, label = '') => { if (!el) throw new Error('click: elemento não encontrado ' + label); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const until = async (fn, ms = 40000, label = '') => { const t = Date.now(); while (Date.now() - t < ms) { let v; try { v = fn(); } catch (e) { v = false; } if (v) return true; await wait(80); } throw new Error('timeout: ' + label); };
  const type = (el, v) => { if (!el) throw new Error('type: sem elemento'); const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const log = []; const ok = (k, v) => log.push((v ? 'OK   ' : 'FAIL ') + k);
  const tabs = () => all('.tabbar button');
  const text = () => d.body.textContent;
  const onboard = async ({ terms = true, ai = true, cookies = false, marketing = false, birth = '1990-05-10', guardian = false } = {}) => {
    await wait(250);
    click(btn('Pular') || btn('Skip') || btn('Omitir'), 'pular'); await wait(120);
    const g = all('button').find((b) => /Google/.test(b.textContent)); click(g, 'google');
    await until(() => d.querySelector('#consent-step'), 5000, 'consent step');
    const cb = (t) => all('#consent-step [role=checkbox]').find((b) => b.getAttribute('aria-checked') != null && b.textContent.length >= 0 && b === all('#consent-step [role=checkbox]')[['terms', 'ai', 'cookies', 'marketing'].indexOf(t)]);
    type(d.querySelector('#birth'), birth); await wait(80);
    if (terms) click(cb('terms')); if (ai) click(cb('ai')); if (cookies) click(cb('cookies')); if (marketing) click(cb('marketing'));
    await wait(80);
    if (guardian) click(all('#consent-step [role=checkbox]').pop());
    const cont = all('#consent-step button').filter((b) => !b.hasAttribute('role')).pop(); click(cont, 'continuar');
    await until(() => d.querySelector('.tabbar'), 4000, 'tabbar');
  };
  const closeOv = async () => { const o = d.querySelector('.overlay'); click(all('.top .iconbtn', o).pop()); await wait(150); };
  return { w, d, errors, wait, all, btn, click, until, type, log, ok, tabs, text, onboard, closeOv };
};
