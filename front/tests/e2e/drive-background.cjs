// Módulo 2 — Edição de fundo no protótipo: com ff_background DESLIGADA nada muda; ligada, o editor funciona de ponta a ponta.
const { boot } = require('./h5.cjs');
(async () => {
  const h = boot({ langs: ['pt-BR'] }); const { w, d, wait, click, btn, all, until, type, tabs, log, ok, text, errors } = h;
  const E = (c) => w.eval(c);
  const SRC = require('fs').readFileSync(require('path').join(__dirname, '../../prototype-nexusreel.html'), 'utf8'); const vm = require('vm');
  const snippet = (start, end) => { const i = SRC.indexOf(start); if (i < 0) throw new Error('trecho não achado: ' + start); return SRC.slice(i, SRC.indexOf(end, i) + end.length); };
  const setSel = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const setRange = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, String(v)); el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { log.push('FAIL ' + name + ' :: ' + e.message.slice(0, 200)); } };
  const debugFlag = async (key, on) => {
    E('location.hash="#/__debug"'); w.dispatchEvent(new w.HashChangeEvent('hashchange')); await until(() => d.querySelector('#debug-ov'), 3000, 'debug');
    click(all('#debug-ov .seg button')[3]); await wait(200);
    const row = all('#dbg-flags .row').find((r) => new RegExp(key + '(?!_)').test(r.textContent)) /* chave exata: ff_live ≠ ff_live_backend */; if (!row) throw new Error('flag ' + key + ' não está no painel');
    setSel(row.querySelector('select'), on ? '100' : '0'); await wait(80);
    const sw = row.querySelector('[role=switch]'); if ((sw.getAttribute('aria-checked') === 'true') !== on) click(sw); await wait(200);
    await h.closeOv(); E('location.hash=""'); await wait(150);
  };
  const openSceneEditor = async () => { click(all('.tl-item')[0], 'timeline'); await until(() => d.querySelector('.sheet'), 3000, 'sheet'); };
  const closeSheet = async () => { const s = d.querySelector('.sheet'); if (s) { click(all('.iconbtn', s).pop()); await wait(150); } };
  const currentVer = () => d.querySelector('#bg-versions [aria-checked=true]');
  try {
    await h.onboard();
    await step('gerar vídeo', async () => {
      click(tabs()[1]); await wait(250);
      click(btn('Usar fotos de exemplo')); await wait(100); click(btn('Exemplo 1')); await wait(100);
      click(btn('Gerar storyboard')); await until(() => /Cena 1/.test(text()), 15000, 'storyboard');
      click(all('button').find((b) => /^Continuar$/.test(b.textContent.trim()))); await wait(250);
      click(all('button').find((b) => /Gerar vídeo de 60s/.test(b.textContent)));
      await until(() => all('button').some((b) => /Tentar novamente/.test(b.textContent)) || d.querySelector('#dub-open'), 70000, 'falha/preview');
      if (!d.querySelector('#dub-open')) { click(all('button').find((b) => /Tentar novamente/.test(b.textContent))); await until(() => d.querySelector('#dub-open'), 90000, 'preview'); }
      ok('vídeo pronto (preview final)', !!d.querySelector('#dub-open'));
    });
    await step('flag OFF', async () => {
      await openSceneEditor();
      ok('OFF: editor de cena sem "Editar fundo" (igual a antes)', !d.querySelector('#bg-open') && /Refazer esta cena/.test(d.querySelector('.sheet').textContent));
      await closeSheet();
    });
    await step('ligar ff_background', async () => {
      await debugFlag('ff_background', true); click(tabs()[1]); await wait(300); await openSceneEditor();
      ok('ON: botão "Editar fundo" no editor da cena', !!d.querySelector('#bg-open'));
      click(d.querySelector('#bg-open')); await until(() => d.querySelector('#bg-ov'), 3000, 'bg ov');
      ok('ON: editor abre com aviso de processamento e "não treina modelos"', /não é usada para treinar/.test(d.querySelector('#bg-notice').textContent));
      ok('versão original em uso no início', currentVer() && currentVer().dataset.bgver === 'orig' && d.querySelector('#bg-revert').disabled);
    });
    await step('antes/depois', async () => {
      const r = d.querySelector('#bg-cmp');
      ok('comparação antes/depois com slider nativo rotulado', r && r.type === 'range' && r.getAttribute('aria-label') === 'Comparar antes e depois');
      setRange(r, 20); await wait(60); ok('slider move a divisão (aria-valuetext)', d.querySelector('#bg-cmp').getAttribute('aria-valuetext') === '20%');
    });
    await step('remover fundo (vídeo e foto)', async () => {
      click(d.querySelector('#bg-apply')); await until(() => d.querySelector('#bg-progress'), 2000, 'progresso');
      ok('aplicar mostra progresso', !!d.querySelector('#bg-progress'));
      await until(() => currentVer() && currentVer().dataset.bgver !== 'orig', 4000, 'versão');
      ok('remover fundo do vídeo cria a versão 2 em uso', /Versão 2 · Remover/.test(currentVer().textContent));
      click(all('#bg-target button').find((b) => /Foto/.test(b.textContent))); await wait(60);
      click(d.querySelector('#bg-apply')); await until(() => /Versão 3/.test((currentVer() || {}).textContent || ''), 4000, 'v3');
      ok('remover fundo da foto cria a versão 3', /Versão 3 · Remover/.test(currentVer().textContent));
    });
    await step('trocar fundo', async () => {
      click(d.querySelector('[data-op=replace]')); await wait(80);
      click(d.querySelector('#bg-apply')); await wait(120);
      ok('trocar sem prompt nem foto avisa e não cria versão', /Descreva o fundo ou escolha uma foto/.test(text()) && /Versão 3/.test(currentVer().textContent));
      click(all('#bg-presets button').find((b) => /Cozinha moderna/.test(b.textContent))); await wait(60);
      ok('preset preenche o prompt', d.querySelector('#bg-prompt').value === 'cozinha moderna');
      click(d.querySelector('#bg-apply')); await until(() => /Versão 4/.test((currentVer() || {}).textContent || ''), 4000, 'v4');
      ok('trocar por prompt cria a versão 4 com o prompt', /Versão 4 · Trocar · cozinha moderna/.test(currentVer().textContent));
      click(all('#bg-photos button')[1]); await wait(60); ok('escolher foto limpa o prompt', d.querySelector('#bg-prompt').value === '');
      click(d.querySelector('#bg-apply')); await until(() => /Versão 5/.test((currentVer() || {}).textContent || ''), 4000, 'v5');
      ok('trocar por foto enviada cria a versão 5', /Versão 5 · Trocar/.test(currentVer().textContent));
    });
    await step('expandir 9:16 → 16:9', async () => {
      click(d.querySelector('[data-op=outpaint]')); await wait(80);
      ok('formato atual (9:16) fica desabilitado', all('#bg-aspect button').find((b) => b.textContent === '9:16').disabled);
      click(d.querySelector('#bg-apply')); await until(() => /Versão 6/.test((currentVer() || {}).textContent || ''), 4000, 'v6');
      ok('expandir cria a versão 6 em 16:9', /Versão 6 · Expandir · 16:9/.test(currentVer().textContent));
      const box = d.querySelector('#bg-compare .bg-box'); ok('prévia passa a 16:9', /16\s*\/\s*9/.test(box.getAttribute('style') || ''));
    });
    await step('seletor de versões', async () => {
      click(d.querySelector('#bg-revert')); await wait(100);
      ok('voltar para a original', currentVer().dataset.bgver === 'orig' && /voltou para a versão original/.test(text()));
      ok('a original e as 5 versões editadas continuam na lista (nada apagado)', all('#bg-versions [data-bgver]').length === 6);
      const v4 = all('#bg-versions [data-bgver]').find((x) => /Versão 4/.test(x.textContent)); click(btn('Usar esta', v4)); await wait(100);
      ok('usar uma versão anterior (v4)', /Versão 4/.test(currentVer().textContent));
      await h.closeOv(); await openSceneEditor();
      ok('o editor de cena mostra a versão em uso (Editar fundo · v4)', /Editar fundo · v4/.test(d.querySelector('#bg-open').textContent));
      await closeSheet();
    });
    await step('i18n e acessibilidade', async () => {
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 2 (fundo): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("(bg\.[a-z._]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.'));
      used.push(...['remove', 'replace', 'outpaint'].map((x) => 'bg.op.' + x), ...['video', 'photo'].map((x) => 'bg.target.' + x), ...['kitchen', 'office', 'beach', 'studio'].map((x) => 'bg.preset.' + x));
      ok('todas as chaves bg.* têm pt-BR, en e es, e toda chave usada existe', Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]));
      const css = snippet('.bg-compare{', '}') + snippet('.bg-ver{', '}');
      ok('alvos de toque ≥ 44 px (slider e versões)', (css.match(/min-height:(44|56)px/g) || []).length === 2);
      const pal = vm.runInNewContext(snippet('const BG_PALETTES =', ']]];') + snippet('function bgPalette(', '\n}') + '; [bgPalette("Cozinha moderna clara"), bgPalette("cozinha")]');
      ok('paleta por tema igual à do backend (cozinha)', JSON.stringify(pal[0]) === JSON.stringify(pal[1]) && pal[0][0] === '#f5e6d3');
    });
    await step('desligar ff_background', async () => {
      await debugFlag('ff_background', false); click(tabs()[1]); await wait(300); await openSceneEditor();
      ok('OFF de novo: botão some', !d.querySelector('#bg-open')); await closeSheet();
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
