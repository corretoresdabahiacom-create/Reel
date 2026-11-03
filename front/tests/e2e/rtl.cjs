const { boot } = require('./h5.cjs');
(async () => {
  const h = boot({ langs: ['pt-BR'] }); const { d, wait, click, all, tabs, ok, log, errors, text } = h;
  try {
    await h.onboard(); click(tabs()[4]); await wait(250); click(h.btn('Configurações e privacidade')); await wait(300);
    click(all('#settings-ov .card.row.tap')[6]); await wait(250);
    const sw = all('#settings-ov [role=switch]').find((s) => /RTL|direita|esquerda|Direção/i.test((s.getAttribute('aria-label') || '') + (s.closest('.row') || { textContent: '' }).textContent));
    ok('RTL: existe opção de teste', !!sw); click(sw); await wait(300);
    ok('RTL: dir=rtl no documento', h.w.document.documentElement.dir === 'rtl');
    click(all('.top .iconbtn', d.querySelector('#settings-ov'))[0]); await h.closeOv();
    for (let i = 0; i < 5; i++) { click(tabs()[i]); await wait(300); }
    ok('RTL: 5 abas navegam sem erro', errors.length === 0);
    click(tabs()[4]); await wait(200); click(h.btn('Configurações e privacidade')); await wait(300); click(all('#settings-ov .card.row.tap')[6]); await wait(250); click(sw && all('#settings-ov [role=switch]').find((s) => s.getAttribute('aria-checked') === 'true')); await wait(300);
    ok('RTL: volta para ltr', h.w.document.documentElement.dir === 'ltr');
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 3).join('\n')); process.exit(0);
})();
