const { boot } = require('./h5.cjs');
const LOC = process.argv[2] || 'en';
const langs = { en: ['en-US'], es: ['es-MX'], 'pt-BR': ['pt-BR'] }[LOC];
const T = (pt, en, es) => ({ 'pt-BR': pt, en, es }[LOC]);
const PTISH = /[áéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]|\b(de|para|com|seu|sua|uma|não|que|você|nos|dos|das|ainda|aqui|mais|este|esta|sem|ou|em|no|na|ao)\b/i;
(async () => {
  const h = boot({ langs }); const { d, wait, click, btn, all, until, type, tabs, log, errors } = h;
  const screens = {};
  const grab = (name) => {
    const out = new Set(); const w = d.createTreeWalker(d.body, 4);
    for (let n; (n = w.nextNode());) { const t = n.data.trim(); if (!/[A-Za-zÀ-ú]{3}/.test(t)) continue; let p = n.parentNode, skip = false; for (; p && p !== d.body; p = p.parentNode) if (p.nodeType === 1 && (p.hasAttribute('data-notr') || p.tagName === 'SCRIPT' || p.tagName === 'STYLE' || p.tagName === 'PRE')) { skip = true; break; } if (!skip) out.add(t); }
    all('[placeholder],[aria-label]').forEach((e) => { ['placeholder', 'aria-label'].forEach((a) => { const t = (e.getAttribute(a) || '').trim(); if (/[A-Za-zÀ-ú]{3}/.test(t)) out.add(t); }); });
    screens[name] = Array.from(out);
  };
  try {
    await wait(300); grab('onboarding-slide');
    click(btn(T('Pular', 'Skip', 'Omitir'))); await wait(120); grab('login');
    click(all('button').find((b) => /Google/.test(b.textContent))); await until(() => d.querySelector('#consent-step'), 5000); grab('consent');
    h.type(d.querySelector('#birth'), '1990-01-01'); await wait(80); const cbs = all('#consent-step [role=checkbox]'); click(cbs[0]); click(cbs[1]); await wait(80);
    click(all('#consent-step button').filter((b) => !b.hasAttribute('role')).pop()); await until(() => d.querySelector('.tabbar'), 4000);
    await wait(200); grab('home');
    click(tabs()[1]); await wait(200); grab('criar-1');
    click(btn(T('Fotos do produto', 'Product photos', 'Fotos del producto'))); await wait(500); grab('photocoach-produto'); await h.closeOv();
    click(btn(T('Minhas fotos', 'My photos', 'Mis fotos'))); await wait(500); grab('photocoach-pessoa'); await h.closeOv();
    click(btn(T('Usar fotos de exemplo', 'Use sample photos', 'Usar fotos de ejemplo'))); await wait(100);
    click(btn(T('Exemplo 1', 'Example 1', 'Ejemplo 1'))); await wait(100);
    click(btn(T('Gerar storyboard', 'Generate storyboard', 'Generar storyboard'))); await until(() => /(Cena 1|Scene 1|Escena 1)/.test(h.text()), 12000, 'storyboard'); await wait(300); grab('criar-2-storyboard');
    click(all('button').find((b) => /^(Continuar|Continue)$/.test(b.textContent.trim()))); await wait(300); grab('criar-3-ajustes');
    const go = all('button').find((b) => /(Gerar vídeo de 60s|Generate 60s video|Generar video de 60 s)/.test(b.textContent)); click(go);
    await wait(900); grab('criar-4-geracao');
    await until(() => all('button').some((b) => /(Tentar novamente|Try again|Intentar de nuevo)/.test(b.textContent)), 60000, 'falha cena');
    grab('criar-4-erro'); click(all('button').find((b) => /(Tentar novamente|Try again|Intentar de nuevo)/.test(b.textContent)));
    await until(() => d.querySelector('#dub-open'), 90000, 'preview'); await wait(300); grab('criar-5-preview');
    click(d.querySelector('#dub-open')); await wait(300); grab('dublagem'); await h.closeOv();
    click(tabs()[2]); await wait(900); grab('biblioteca');
    click(tabs()[3]); await wait(300); grab('publicar');
    click(tabs()[4]); await wait(300); grab('perfil');
    click(btn(T('Configurações e privacidade', 'Settings and privacy', 'Ajustes y privacidad'))); await wait(300); grab('settings-home');
    const views = ['language', 'region', 'privacy', 'data', 'security', 'help', 'about'];
    const navs = all('#settings-ov .card.row.tap');
    for (let i = 0; i < views.length; i++) { const cs = all('#settings-ov .card.row.tap'); click(cs[i]); await wait(250); grab('settings-' + views[i]); click(all('.top .iconbtn', d.querySelector('#settings-ov'))[0]); await wait(150); }
    await h.closeOv();
    click(btn(T('Assinar Pro', 'Subscribe to Pro', 'Suscribirse a Pro'))); await wait(300); grab('paywall'); await h.closeOv();
    click(btn(T('Templates', 'Templates', 'Plantillas'))); await wait(500); grab('templates'); await h.closeOv();
    click(btn(T('Afiliados', 'Affiliates', 'Afiliados'))); await wait(400); grab('afiliados'); await h.closeOv();
    click(btn(T('Contas conectadas', 'Connected accounts', 'Cuentas conectadas'))); await wait(300); grab('contas'); await h.closeOv();
    click(btn(T('Modo Business', 'Business mode', 'Modo Business'))); await wait(400); grab('b2b-gate');
    click(btn(T('Ativar Business', 'Enable Business', 'Activar Business'))); await wait(400); grab('b2b-dashboard');
    click(btn(T('Catálogos', 'Catalogs', 'Catálogos'), d.querySelector('.seg'))); await wait(200); grab('b2b-catalogos');
    click(btn(T('Criar catálogo', 'Create catalog', 'Crear catálogo'))); await wait(200); grab('b2b-wizard');
    await h.closeOv();
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  let tot = 0, bad = 0; const rows = [];
  for (const [k, v] of Object.entries(screens)) { const b = LOC === 'pt-BR' ? [] : v.filter((t) => PTISH.test(t)); tot += v.length; bad += b.length; rows.push([k, v.length, b]); }
  rows.forEach(([k, n, b]) => console.log(k.padEnd(24), String(n).padStart(3), 'nós; PT restante:', b.length, b.length ? '\n    - ' + b.join('\n    - ') : ''));
  console.log('TOTAL', tot, 'PT-like', bad, 'cobertura ~', (100 - (100 * bad) / tot).toFixed(1) + '%');
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
