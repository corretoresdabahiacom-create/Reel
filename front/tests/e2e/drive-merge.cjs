// Módulo 4 — União de vídeos no protótipo: flag OFF = Biblioteca igual a antes; ON: assistente une dois vídeos prontos.
const { boot } = require('./h5.cjs');
(async () => {
  const h = boot({ langs: ['pt-BR'] }); const { w, d, wait, click, btn, all, until, type, tabs, log, ok, text, errors } = h;
  const E = (c) => w.eval(c);
  const SRC = require('fs').readFileSync(require('path').join(__dirname, '../../prototype-nexusreel.html'), 'utf8'); const vm = require('vm');
  const snippet = (start, end) => { const i = SRC.indexOf(start); if (i < 0) throw new Error('trecho não achado: ' + start); return SRC.slice(i, SRC.indexOf(end, i) + end.length); };
  const setSel = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { log.push('FAIL ' + name + ' :: ' + e.message.slice(0, 200)); } };
  const debugFlag = async (key, on) => {
    E('location.hash="#/__debug"'); w.dispatchEvent(new w.HashChangeEvent('hashchange')); await until(() => d.querySelector('#debug-ov'), 3000, 'debug');
    click(all('#debug-ov .seg button')[3]); await wait(200);
    const row = all('#dbg-flags .row').find((r) => new RegExp(key + '(?!_)').test(r.textContent)) /* chave exata: ff_live ≠ ff_live_backend */; if (!row) throw new Error('flag ' + key + ' não está no painel');
    setSel(row.querySelector('select'), on ? '100' : '0'); await wait(80);
    const sw = row.querySelector('[role=switch]'); if ((sw.getAttribute('aria-checked') === 'true') !== on) click(sw); await wait(200);
    await h.closeOv(); E('location.hash=""'); await wait(150);
  };
  const library = async () => { click(tabs()[2]); await wait(900); };
  const thumbs = () => all('.grid3 .thumb');
  try {
    await h.onboard();
    let before;
    await step('flag OFF', async () => {
      await library(); before = thumbs().length;
      ok('OFF: Biblioteca sem "Unir dois vídeos" e sem selo "Unido"', !d.querySelector('#merge-open') && !d.querySelector('[data-merged]') && before >= 2);
    });
    await step('ligar ff_merge e abrir o assistente', async () => {
      await debugFlag('ff_merge', true); await library();
      ok('ON: botão "Unir dois vídeos" na Biblioteca', !!d.querySelector('#merge-open'));
      click(d.querySelector('#merge-open')); await until(() => d.querySelector('#mg-ov'), 3000, 'mg ov');
      ok('assistente em 4 etapas', all('#mg-ov .wsteps [role=listitem]').length === 4);
      ok('lista os vídeos prontos com a duração', all('#mg-list-1 [data-mg]').length >= 2 && /\d+ s/.test(d.querySelector('#mg-list-1').textContent));
      ok('"Continuar" só depois de escolher', d.querySelector('#mg-next').disabled);
    });
    let A, B;
    await step('escolher os dois vídeos', async () => {
      const items = all('#mg-list-1 [data-mg]').filter((b) => !b.disabled); A = items[0].dataset.mg; click(items[0]); await wait(60);
      ok('1º escolhido (radio)', items[0].getAttribute('aria-checked') === 'true'); click(d.querySelector('#mg-next')); await wait(80);
      ok('o 1º não aparece na lista do 2º', !all('#mg-list-2 [data-mg]').some((b) => b.dataset.mg === A));
      const second = all('#mg-list-2 [data-mg]').find((b) => !b.disabled); B = second.dataset.mg; click(second); await wait(60); click(d.querySelector('#mg-next')); await wait(80);
      ok('ajustes mostram o par e a ordem', !!d.querySelector('#mg-pair') && /^1\./.test(d.querySelector('#mg-order').textContent));
    });
    await step('ajustes', async () => {
      const total = Number(d.querySelector('#mg-total').textContent.match(/(\d+) s/)[1]);
      ok('total ≤ 120 s e aviso de que os originais não mudam', total <= 120 && /continuam como estão/.test(text()));
      const o1 = d.querySelector('#mg-order').textContent; click(d.querySelector('#mg-swap')); await wait(60);
      ok('inverter a ordem', d.querySelector('#mg-order').textContent !== o1); click(d.querySelector('#mg-swap')); await wait(60);
      ok('transição automática selecionada por padrão (7 opções)', d.querySelector('[data-tr=auto]').getAttribute('aria-checked') === 'true' && all('#mg-tr [data-tr]').length === 7);
      type(d.querySelector('#mg-name'), 'Combo bike + fone'); await wait(40);
    });
    await step('unir', async () => {
      click(d.querySelector('#mg-go')); await until(() => d.querySelector('#mg-progress'), 2000, 'progresso');
      ok('progresso por etapa (5 etapas)', all('#mg-progress [data-stage]').length === 5);
      await until(() => d.querySelector('#mg-done'), 6000, 'pronto');
      ok('resultado com duração, transição e motivo', /s · transição:/.test(d.querySelector('#mg-done').textContent) && /emenda|luz|cores|parecidos|Escolhida/i.test(d.querySelector('#mg-done').textContent));
      click(d.querySelector('#mg-watch')); await wait(300); ok('assistir abre o player do vídeo unido', !!d.querySelector('.overlay') && !d.querySelector('#mg-ov'));
      await h.closeOv(); await library();
      ok('Biblioteca ganha 1 vídeo novo com selo "Unido"', thumbs().length === before + 1 && all('[data-merged]').length === 1);
      ok('originais continuam na Biblioteca', E('1') && thumbs().length - 1 === before);
    });
    await step('transição escolhida pelo usuário', async () => {
      click(d.querySelector('#merge-open')); await until(() => d.querySelector('#mg-ov'), 3000);
      click(all('#mg-list-1 [data-mg]').find((b) => b.dataset.mg === B)); await wait(40); click(d.querySelector('#mg-next')); await wait(60);
      click(all('#mg-list-2 [data-mg]').find((b) => b.dataset.mg === A)); await wait(40); click(d.querySelector('#mg-next')); await wait(60);
      click(d.querySelector('[data-tr=circleopen]')); await wait(40); click(d.querySelector('#mg-go')); await until(() => d.querySelector('#mg-done'), 6000);
      ok('usa a transição escolhida (Círculo) e diz que foi escolha sua', /Círculo/.test(d.querySelector('#mg-done').textContent) && /Escolhida por você/.test(d.querySelector('#mg-done').textContent));
      await h.closeOv();
    });
    await step('i18n e regras', async () => {
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 4 (união): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("(mg\.[a-z._]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.'));
      used.push(...['auto', 'fade', 'fadeblack', 'dissolve', 'slideleft', 'circleopen', 'zoomin'].map((x) => 'mg.tr.' + x), ...['normalize', 'analyze', 'transition', 'audio', 'finalize'].map((x) => 'mg.st.' + x), ...['fadeblack', 'dissolve', 'fade', 'user'].map((x) => 'mg.why.' + x));
      ok('todas as chaves mg.* têm pt-BR, en e es, e toda chave usada existe', Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]));
      const auto = vm.runInNewContext(snippet('const mgHex =', '\nfunction MergeWizard').replace(/function MergeWizard$/, '') +
        '; const P = (a, b) => ({ scenes: [{ referenceImages: ["linear-gradient(160deg," + a + "," + a + ")"] }] }); [mgAuto(P("#fafafa"), { scenes: [{ referenceImages: ["linear-gradient(#0a0a0a,#0a0a0a)"] }] }), mgAuto(P("#808080"), { scenes: [{ referenceImages: ["linear-gradient(#828282,#828282)"] }] })]');
      ok('transição automática igual à regra do backend (luz → passar pelo preto; parecidos → fusão)', auto[0] === 'fadeblack' && auto[1] === 'fade');
      ok('alvos de toque ≥ 44 px (itens da lista)', /\.mg-item\{display:flex;align-items:center;gap:12px;min-height:64px/.test(SRC));
    });
    await step('desligar ff_merge', async () => {
      await debugFlag('ff_merge', false); await library();
      ok('OFF de novo: botão e selo somem (o vídeo unido continua sendo um vídeo normal)', !d.querySelector('#merge-open') && !d.querySelector('[data-merged]') && thumbs().length === before + 2);
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
