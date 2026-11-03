const { JSDOM } = require('jsdom'); const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '../../prototype-nexusreel.html'), 'utf8');
const app = src.slice(src.lastIndexOf('<script>') + 8, src.lastIndexOf('</script>'));
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x.test/', beforeParse(win) { Object.defineProperty(win.navigator, 'languages', { get: () => ['pt-BR'] }); Object.defineProperty(win.navigator, 'language', { get: () => 'pt-BR' }); } });
const w = dom.window, errors = [];
w.console.error = (...a) => errors.push('ERR ' + a.map(String).join(' ').slice(0, 300));
w.console.warn = (...a) => errors.push('WARN ' + a.map(String).join(' ').slice(0, 300));
w.addEventListener('error', (e) => errors.push('UNCAUGHT ' + e.message));
w.eval(fs.readFileSync(require('path').join(__dirname, '../../web/vendor/react.production.min.js'), 'utf8'));
w.eval(fs.readFileSync(require('path').join(__dirname, '../../web/vendor/react-dom.production.min.js'), 'utf8'));
w.eval(fs.readFileSync(require('path').join(__dirname, '../../web/vendor/htm.js'), 'utf8'));
w.eval(app);
const d = w.document, wait = (ms) => new Promise((r) => setTimeout(r, ms));
const all = (sel) => Array.from(d.querySelectorAll(sel));
const btn = (t, root = d) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent.trim().includes(t));
let ci=0; const click = (el) => { ci++; if (!el) throw new Error('click #'+ci);  el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
const until = async (fn, ms = 40000, label = '') => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await wait(100); } throw new Error('timeout: ' + label); };
const type = (el, v) => { const proto = el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v); el.dispatchEvent(new w.Event('input', { bubbles: true })); };
const log = [];
const ok = (k, v) => log.push((v ? 'OK   ' : 'FAIL ') + k);
const card = (name) => all('.pf').find((c) => c.textContent.includes(name));
const toggle = (name) => click(card(name).querySelector('button'));
const connect = async (name) => { const c = card(name); click(btn('Conectar', c)); await until(() => d.querySelector('.sheet'), 2000, 'sheet ' + name); click(btn('Autorizar', d.querySelector('.sheet'))); await until(() => d.querySelector('.bigcheck'), 4000, 'check ' + name); await until(() => !d.querySelector('.sheet'), 4000, 'fecha ' + name); };
const tabs = () => all('.tabbar button');
const allDone = (names) => names.every((n) => card(n) && /Publicado/.test(card(n).textContent));
(async () => {
  try {
    await wait(300);
    click(btn('Pular')); await wait(100); click(btn('Continuar com Google')); await until(() => d.querySelector('#consent-step'), 5000, 'consent');
    { const inp = d.querySelector('#birth'); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(inp, '1990-01-01'); inp.dispatchEvent(new w.Event('input', { bubbles: true })); inp.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(100);
      const cbs = Array.from(d.querySelectorAll('#consent-step [role=checkbox]')); click(cbs[0]); click(cbs[1]); await wait(100);
      click(Array.from(d.querySelectorAll('#consent-step button')).filter((b) => !b.hasAttribute('role')).pop()); }
    await until(() => d.querySelector('.tabbar'), 5000, 'login');
    // 1. conectar contas
    click(tabs()[4]); await wait(150);
    click(btn('Contas conectadas')); await until(() => d.querySelector('.overlay'), 2000, 'contas');
    ok('Contas: 7 plataformas desconectadas', all('.overlay .pf').length === 7 && d.body.textContent.includes('0 de 7'));
    for (const n of ['TikTok', 'YouTube', 'Mercado Livre', 'Shopee', 'Temu', 'OLX']) await connect(n);
    ok('1. >=2 contas conectadas (6)', d.body.textContent.includes('6 de 7') && d.body.textContent.includes('Última sincronização'));
    ok('badge verde conectado', d.body.textContent.includes('Conectado · @marina.costa'));
    click(d.querySelector('.overlay .iconbtn:last-child')); await wait(150);
    // dev: revogar e reconectar TikTok
    click(d.querySelector('.switch')); await wait(100);
    click(btn('Contas conectadas')); await until(() => d.querySelector('.overlay'), 2000, 'contas2');
    click(btn('Revogar sessão', all('.overlay .pf')[0])); await wait(100);
    ok('sessão expirada + Reconectar', d.body.textContent.includes('Sessão expirada') && !!btn('Reconectar'));
    click(btn('Reconectar')); await until(() => d.querySelector('.sheet'), 2000, 'reconectar'); click(btn('Autorizar', d.querySelector('.sheet'))); await until(() => !d.querySelector('.sheet') && !d.body.textContent.includes('Sessão expirada'), 6000, 'reconectado');
    ok('reconectou TikTok', true);
    click(btn('Expirar token', all('.overlay .pf')[1])); await wait(50);
    click(d.querySelector('.overlay .iconbtn:last-child')); await wait(150);
    // 2/3. publicar TikTok + YouTube + ML (YouTube com access token expirado => refresh automático)
    click(tabs()[3]); await wait(200);
    ok('2. vídeo da Biblioteca na tela Publicar', !!d.querySelector('.pcover') && d.body.textContent.includes('Plataformas'));
    toggle('Mercado Livre'); await wait(50);
    type(d.querySelector('#mercadolivre-listing'), 'MLB123456789'); type(d.querySelector('#mercadolivre-price'), '1999.90'); await wait(100);
    ok('pré-validação mostra aviso TikTok não auditado', card('TikTok').textContent.includes('app não auditado') || card('TikTok').textContent.includes('App não auditado') || card('TikTok').textContent.includes('não auditado'));
    ok('TikTok privacidade travada em Só eu', card('TikTok').textContent.includes('Só eu'));
    click(btn('Publicar em 3 plataformas'));
    let sawBar = false;
    await until(() => { if (all('.pf [role=progressbar]').length >= 2) sawBar = true; return allDone(['TikTok', 'YouTube', 'Mercado Livre']); }, 30000, 'publicar 3');
    ok('3. progresso individual visto', sawBar);
    ok('3. publicado nas 3', allDone(['TikTok', 'YouTube', 'Mercado Livre']));
    ok('links externos', all('.pf a[target=_blank]').length === 3);
    await wait(200); ok('confete ao concluir todas', !!d.querySelector('.confetti'));
    ok('cota YouTube incrementou', d.body.textContent.includes('2/100'));
    // 4/6. Temu falha, Shopee ok com adaptação, retry isolado
    toggle('Shopee'); toggle('Temu'); await wait(50);
    for (const id of ['shopee', 'temu']) { type(d.querySelector('#' + id + '-listing'), 'ID-' + id); type(d.querySelector('#' + id + '-price'), '49.90'); }
    await wait(100);
    ok('6. Shopee mostra adaptação para ≤30 MB', /Comprimir de \d+ MB para até 30 MB/.test(card('Shopee').textContent));
    click(btn('Publicar em todas') || btn('Publicar em 5 plataformas'));
    await until(() => /Publicado/.test(card('Shopee').textContent) && btn('Tentar de novo'), 30000, 'temu falha');
    ok('4. Temu falhou e Shopee publicou', /503/.test(card('Temu').textContent) && /Publicado/.test(card('Shopee').textContent));
    ok('4. TikTok/YouTube/ML intactos', allDone(['TikTok', 'YouTube', 'Mercado Livre']));
    click(btn('Tentar de novo')); await until(() => /Publicado/.test(card('Temu').textContent), 20000, 'retry temu');
    ok('4. retry só da Temu funcionou', allDone(['TikTok', 'YouTube', 'Mercado Livre', 'Shopee', 'Temu']) && /tentativa 2/.test(card('Temu').textContent) === false);
    // validação: campos vazios
    await wait(3500);
    // 5. OLX com envio automático ao YouTube (2º projeto)
    click(all('.pcover')[1]); await wait(150);
    ok('2º projeto sem jobs', !/Publicado/.test(d.querySelector('.pf').textContent));
    for (const n of ['TikTok', 'YouTube', 'Mercado Livre', 'Shopee', 'Temu']) toggle(n);
    toggle('OLX'); await wait(50);
    click(btn('Publicar em 1 plataforma')); await wait(300);
    ok('validação bloqueia OLX sem ID/preço', /Informe o ID do anúncio/.test(card('OLX').textContent) || d.body.textContent.includes('Informe o ID'));
    type(d.querySelector('#olx-listing'), 'OLX-998'); type(d.querySelector('#olx-price'), '800'); await wait(100);
    click(btn('Publicar em 1 plataforma'));
    await until(() => /Publicado/.test(card('OLX').textContent), 30000, 'olx');
    toggle('YouTube'); await wait(50);
    ok('5. YouTube auto-enviado para a OLX', /Enviado automaticamente/.test(card('YouTube').textContent));
    // Biblioteca Publicados
    click(tabs()[2]); await wait(300); await until(() => !d.querySelector('.skeleton'), 4000, 'lib');
    click(btn('Publicados')); await wait(100);
    ok('Biblioteca: filtro Publicados com 2 projetos e bolinhas', all('.thumb').length === 2 && all('.pubdots i').length >= 6);
    // Perfil
    click(tabs()[4]); await wait(150);
    ok('Perfil: card Contas conectadas', d.body.textContent.includes('6 conectada'));
  } catch (e) { log.push('EXCEÇÃO: ' + e.message); all('.pf').forEach((c) => log.push('  CARD ' + c.textContent.replace(/\s+/g, ' ').slice(0, 400))); }
  console.log(log.join('\n')); console.log('console errors/warnings:', errors.length); errors.slice(0, 8).forEach((e) => console.log(e)); process.exit(0);
})();
