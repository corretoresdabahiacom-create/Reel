// Módulo 3 — Inserção de elementos no protótipo: flag OFF = igual a antes; ON: inserir pet/objeto/pessoa (só com consentimento), substituir, versões.
const { boot } = require('./h5.cjs');
(async () => {
  const h = boot({ langs: ['pt-BR'] }); const { w, d, wait, click, btn, all, until, type, tabs, log, ok, text, errors } = h;
  const E = (c) => w.eval(c);
  const SRC = require('fs').readFileSync(require('path').join(__dirname, '../../prototype-nexusreel.html'), 'utf8'); const vm = require('vm');
  const snippet = (start, end) => { const i = SRC.indexOf(start); if (i < 0) throw new Error('trecho não achado: ' + start); return SRC.slice(i, SRC.indexOf(end, i) + end.length); };
  const setSel = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { log.push('FAIL ' + name + ' :: ' + e.message.slice(0, 200)); } };
  const openDebug = async (tab) => { E('location.hash="#/__debug"'); w.dispatchEvent(new w.HashChangeEvent('hashchange')); await until(() => d.querySelector('#debug-ov'), 3000, 'debug'); click(all('#debug-ov .seg button')[tab]); await wait(200); };
  const closeDebug = async () => { await h.closeOv(); E('location.hash=""'); await wait(150); };
  const debugFlag = async (key, on) => {
    await openDebug(3);
    const row = all('#dbg-flags .row').find((r) => new RegExp(key + '(?!_)').test(r.textContent)) /* chave exata: ff_live ≠ ff_live_backend */; if (!row) throw new Error('flag ' + key + ' não está no painel');
    setSel(row.querySelector('select'), on ? '100' : '0'); await wait(80);
    const sw = row.querySelector('[role=switch]'); if ((sw.getAttribute('aria-checked') === 'true') !== on) click(sw); await wait(200);
    await closeDebug();
  };
  const providerCallsInLog = async () => { await openDebug(0); const n = (d.querySelector('#debug-ov').textContent.match(/elements\.provider\.call/g) || []).length; await closeDebug(); return n; };
  const openSceneEditor = async () => { click(all('.tl-item')[0], 'timeline'); await until(() => d.querySelector('.sheet'), 3000, 'sheet'); };
  const closeSheet = async () => { const s = d.querySelector('.sheet'); if (s) { click(all('.iconbtn', s).pop()); await wait(150); } };
  const openEditor = async () => { click(tabs()[1]); await wait(250); await openSceneEditor(); click(d.querySelector('#el-open')); await until(() => d.querySelector('#el-ov'), 3000, 'el ov'); };
  const cur = () => d.querySelector('#el-versions [aria-checked=true]');
  const applyAndWait = async (n) => { click(d.querySelector('#el-apply'));
    try { await until(() => new RegExp('Versão ' + n).test((cur() || {}).textContent || ''), 4000, 'v' + n); } catch (e) { throw new Error(e.message + ' | atual: ' + ((cur() || {}).textContent || '-') + ' | toast: ' + ((d.querySelector('.toast') || {}).textContent || '-')); } };
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
    await step('flag OFF', async () => { await openSceneEditor(); ok('OFF: editor de cena sem "Inserir elemento"', !d.querySelector('#el-open')); await closeSheet(); });
    await step('ligar ff_elements', async () => {
      await debugFlag('ff_elements', true); await openEditor();
      ok('ON: editor de elementos abre com aviso de processamento', /não são usadas para treinar/.test(d.querySelector('#el-notice').textContent));
      ok('com ff_background desligada, "Editar fundo" continua oculto', (await (async () => { await h.closeOv(); await openSceneEditor(); const r = !d.querySelector('#bg-open'); await closeSheet(); return r; })()));
      await openEditor();
    });
    await step('inserir pet e objeto', async () => {
      click(d.querySelector('#el-apply')); await wait(120); ok('sem foto de referência não aplica', /Escolha a foto de referência/.test(text()) && cur().dataset.elver === 'orig');
      click(all('#el-refs button')[1]); await wait(40); click(all('#el-presets button')[0]); await wait(60);
      ok('preset de descrição (pet)', d.querySelector('#el-desc').value === 'pet ao lado do produto');
      click(all('#el-pos button')[8]); await wait(40); ok('posição pela grade 3×3 (botões de 44 px)', all('#el-pos button')[8].getAttribute('aria-pressed') === 'true');
      ok('prévia mostra o elemento na posição', /78%/.test(d.querySelector('#el-stage .el-item').getAttribute('style') || ''));
      await applyAndWait(2); ok('inserir animal cria a versão 2', /Versão 2 · Inserir · pet ao lado do produto/.test(cur().textContent));
      click(d.querySelector('[data-type=object]')); await wait(40);
      click(all('#el-presets button')[0]); await wait(40); click(all('#el-pos button')[0]); await wait(40);
      await applyAndWait(3); ok('inserir objeto cria a versão 3 (acumula sobre a 2)', /Versão 3 · Inserir · celular na mão/.test(cur().textContent) && all('.el-item', cur()).length === 2);
    });
    await step('pessoa sem consentimento', async () => {
      const before = await providerCallsInLog(); await openEditor();
      click(d.querySelector('[data-type=person]')); await wait(60); click(all('#el-refs button')[0]);
      ok('pessoa mostra o bloco de consentimento', /exige consentimento/.test(d.querySelector('#el-consent').textContent));
      click(d.querySelector('#el-apply')); await wait(150);
      ok('sem consentimento: bloqueia e não cria versão', /confirme o consentimento/.test(text()) && /Versão 3/.test(cur().textContent));
      click(d.querySelector('#el-consent-start')); await wait(60); click(d.querySelector('#el-apply')); await wait(150);
      ok('consentimento pedido mas não confirmado também bloqueia', /Versão 3/.test(cur().textContent));
      await h.closeOv(); ok('log: nenhuma chamada ao provedor nas tentativas bloqueadas', (await providerCallsInLog()) === before);
    });
    await step('pessoa com consentimento', async () => {
      await openEditor(); click(d.querySelector('[data-type=person]')); await wait(60); click(all('#el-refs button')[0]);
      const phrase = d.querySelector('#el-consent-phrase').textContent; ok('frase única com código', /Código \d{6}/.test(phrase));
      type(d.querySelector('#el-consent-input'), 'uma frase qualquer que não confere'); await wait(40); click(d.querySelector('#el-consent-confirm')); await wait(80);
      ok('frase errada é recusada', /não confere/.test(text()) && !d.querySelector('#el-consent-revoke'));
      type(d.querySelector('#el-consent-input'), phrase.toUpperCase()); await wait(40); click(d.querySelector('#el-consent-evidence')); await wait(40);
      click(d.querySelector('#el-consent-confirm')); await wait(80); ok('frase correta confirma (com autorização anexada)', !!d.querySelector('#el-consent-revoke'));
      const before = await providerCallsInLog(); await openEditor(); click(d.querySelector('[data-type=person]')); await wait(60); click(all('#el-refs button')[0]); await wait(40); click(all('#el-presets button')[0]); await wait(40);
      await applyAndWait(4); ok('pessoa inserida (versão 4)', /Versão 4 · Inserir · eu segurando o produto/.test(cur().textContent));
      await h.closeOv(); ok('log: exatamente 1 chamada ao provedor', (await providerCallsInLog()) === before + 1);
      await openEditor(); click(d.querySelector('[data-type=person]')); await wait(60); click(d.querySelector('#el-consent-revoke')); await wait(60);
      ok('revogar volta a bloquear a pessoa', !!d.querySelector('#el-consent-start'));
    });
    await step('substituir', async () => {
      click(d.querySelector('[data-action=replace]')); await wait(60);
      click(all('#el-region button')[4]); await wait(40); click(all('#el-hues button')[3]); await wait(40);
      ok('cores com rótulo (aria-label) e alvo de 44 px', all('#el-hues button').every((b) => /Nova cor/.test(b.getAttribute('aria-label'))));
      await applyAndWait(5); ok('mudar cor cria a versão 5', /Versão 5 · Mudar cor/.test(cur().textContent) && !!d.querySelector('#el-stage .el-tint'));
      click(d.querySelector('[data-mode=remove]')); await wait(40); click(all('#el-region button')[2]); await wait(40);
      await applyAndWait(6); ok('remover objeto cria a versão 6', /Versão 6 · Remover objeto/.test(cur().textContent) && !!d.querySelector('#el-stage .el-erase'));
    });
    await step('versões', async () => {
      click(d.querySelector('#el-revert')); await wait(80); ok('voltar para a original', cur().dataset.elver === 'orig');
      ok('original + 5 versões preservadas', all('#el-versions [data-elver]').length === 6);
      click(btn('Usar esta', all('#el-versions [data-elver]').find((x) => /Versão 2/.test(x.textContent)))); await wait(80); ok('usar a versão 2', /Versão 2/.test(cur().textContent));
    });
    await step('i18n e acessibilidade', async () => {
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 3 (elementos): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("(el\.[a-z._]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.'));
      used.push(...['insert', 'replace'].map((x) => 'el.action.' + x), ...['person', 'animal', 'object'].map((x) => 'el.type.' + x), ...['me', 'pet', 'phone', 'sneaker'].map((x) => 'el.preset.' + x), ...['recolor', 'remove'].map((x) => 'el.mode.' + x), 'bg.op.insert', 'bg.op.recolor', 'bg.op.erase');
      ok('todas as chaves el.* têm pt-BR, en e es, e toda chave usada existe', Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]));
      ok('alvos de toque de 44 px (grade e cores)', /\.el-grid button\{width:44px;height:44px/.test(SRC) && /\.el-swatch\{width:44px;height:44px/.test(SRC));
    });
    await step('desligar ff_elements', async () => {
      await h.closeOv(); await debugFlag('ff_elements', false); click(tabs()[1]); await wait(300); await openSceneEditor();
      ok('OFF de novo: botão some', !d.querySelector('#el-open')); await closeSheet();
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
