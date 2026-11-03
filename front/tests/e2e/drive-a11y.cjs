// Módulo 11 — Acessibilidade + Teleprompter no protótipo: flags OFF = player igual; ON: abas por teclado, estilos com contraste,
// prévia karaokê, legendas pt-BR/en, audiodescrição filtrada e só exportável após revisão, transcrição SRT/VTT assinada, teleprompter
// com câmera só após permissão explícita, gravação local até opt-in, atalhos de teclado e espelhamento.
const { boot } = require('./h5.cjs');
(async () => {
  const h = boot({ langs: ['pt-BR'] }); const { w, d, wait, click, btn, all, until, tabs, type, log, ok, text, errors } = h;
  const E = (c) => w.eval(c);
  const SRC = require('fs').readFileSync(require('path').join(__dirname, '../../prototype-nexusreel.html'), 'utf8'); const vm = require('vm');
  const snippet = (start, end) => { const i = SRC.indexOf(start); if (i < 0) throw new Error('trecho não achado: ' + start); return SRC.slice(i, SRC.indexOf(end, i) + end.length); };
  const setSel = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { log.push('FAIL ' + name + ' :: ' + e.message.slice(0, 200)); } };
  const openDebug = async (tab) => { E('location.hash="#/__debug"'); w.dispatchEvent(new w.HashChangeEvent('hashchange')); await until(() => d.querySelector('#debug-ov'), 3000, 'debug'); click(all('#debug-ov .seg button')[tab]); await wait(200); };
  const closeDebug = async () => { await h.closeOv(); E('location.hash=""'); await wait(150); };
  const debugFlag = async (key, on) => {
    await openDebug(3); const row = all('#dbg-flags .row').find((r) => new RegExp(key + '(?!_)').test(r.textContent)) /* chave exata: ff_live ≠ ff_live_backend */; if (!row) throw new Error('flag ' + key + ' não está no painel');
    setSel(row.querySelector('select'), on ? '100' : '0'); await wait(80); const sw = row.querySelector('[role=switch]'); if ((sw.getAttribute('aria-checked') === 'true') !== on) click(sw); await wait(200); await closeDebug();
  };
  const openPlayer = async () => { click(tabs()[2]); await wait(900); click(all('.grid3 .thumb')[0]); await until(() => d.querySelector('.overlay'), 3000, 'player'); await wait(150); };
  const closeAll = async () => { for (let i = 0; i < 3 && (d.querySelector('.sheet') || d.querySelector('.overlay')); i++) { const c = d.querySelector('.sheet [aria-label=Fechar]') || all('.top .iconbtn', d.querySelector('.overlay')).pop(); click(c); await wait(200); } };
  const key = (el, k) => el.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));
  try {
    await h.onboard();
    await step('flags OFF', async () => { await openPlayer(); ok('OFF: player sem acessibilidade e teleprompter', !d.querySelector('#a11y-open') && !d.querySelector('#tp-open')); await closeAll(); });
    await step('acessibilidade: abas, estilos e prévia', async () => {
      await debugFlag('ff_accessibility', true); await openPlayer(); click(d.querySelector('#a11y-open')); await until(() => d.querySelector('#a11y-ov'), 2000, 'a11y');
      const tabsEl = all('#a11y-ov [role=tab]'); ok('3 abas WAI-ARIA (tablist/tab/tabpanel; só a ativa no Tab)', tabsEl.length === 3 && d.querySelector('#a11y-ov [role=tablist]') && tabsEl[0].getAttribute('aria-selected') === 'true' && tabsEl[1].tabIndex === -1 && !!d.querySelector('[role=tabpanel][aria-labelledby=a11y-tab-captions]'));
      key(tabsEl[0], 'ArrowRight'); await wait(60); ok('seta → muda para Audiodescrição', d.querySelector('#a11y-tab-ad').getAttribute('aria-selected') === 'true'); key(d.querySelector('#a11y-tab-ad'), 'ArrowLeft'); await wait(60);
      ok('todos os estilos com contraste ≥ 4,5:1', ['padrao', 'alto_contraste', 'grande', 'dislexia'].every((s) => { click(d.querySelector(`[data-style=${s}]`)); const r = +/Contraste ([\d,]+):1/.exec(d.querySelector('#a11y-ratio').textContent)[1].replace(',', '.'); return r >= 4.5; }));
      click(d.querySelector('[data-style=alto_contraste]')); await wait(30); ok('alto contraste 15,3:1 ou mais', +/Contraste ([\d,]+):1/.exec(d.querySelector('#a11y-ratio').textContent)[1].replace(',', '.') >= 15);
      click(d.querySelector('#a11y-play')); await wait(900); ok('prévia karaokê: palavra falada acesa', all('#a11y-cap-preview [data-on=true]').length >= 1 && d.querySelector('#a11y-play').getAttribute('aria-pressed') === 'true'); click(d.querySelector('#a11y-play'));
    });
    await step('legendas pt-BR e en', async () => {
      ok('pt-BR e en marcados por padrão (checkbox)', d.querySelector('[data-lang="pt-BR"]').getAttribute('aria-checked') === 'true' && d.querySelector('[data-lang=en]').getAttribute('aria-checked') === 'true');
      click(d.querySelector('#a11y-cap-gen')); await wait(30); ok('gerando (ocupado)', d.querySelector('#a11y-cap-gen').disabled); await until(() => d.querySelector('#a11y-cap-done'), 2000, 'caps');
      ok('legendas prontas em 2 idiomas, original guardado', /2 idioma/.test(d.querySelector('#a11y-cap-done').textContent) && /original/.test(d.querySelector('#a11y-cap-done').textContent));
    });
    await step('audiodescrição com revisão', async () => {
      click(d.querySelector('#a11y-tab-ad')); await wait(60); click(d.querySelector('#ad-gen')); await until(() => d.querySelector('#ad-list'), 2000, 'ad');
      ok('aguardando revisão; exportar bloqueado', /Aguardando sua revisão/.test(d.querySelector('#ad-status').textContent) && d.querySelector('#ad-export').disabled && /depois da revisão/.test(d.querySelector('#ad-lock').textContent));
      const t0 = d.querySelector('[data-ad="0"]'); type(t0, 'Mulher grávida mostra a bike; contato ana@x.com'); await wait(40);
      click(d.querySelector('#ad-approve')); await wait(60); const txt = d.querySelector('[data-ad="0"]').value;
      ok('aprovar passa o texto revisado pelo filtro (sem dado sensível)', !/grávida|ana@x\.com/.test(txt) && /mostra a bike/.test(txt) && !!d.querySelector('[data-redacted]'));
      ok('aprovada: exportação liberada e texto travado', !d.querySelector('#ad-export').disabled && d.querySelector('[data-ad="0"]').readOnly && /aprovada/.test(d.querySelector('#ad-status').textContent));
    });
    await step('transcrição SRT/VTT assinada', async () => {
      click(d.querySelector('#a11y-tab-transcript')); await wait(60); click(d.querySelector('[data-export=srt]')); await wait(60);
      ok('SRT válido e assinado', /^1\n00:00:00,\d{3} --> 00:00:0\d,\d{3}\n/.test(d.querySelector('#tr-out pre').textContent) && /Assinado \(HMAC-SHA256\) · SRT/.test(d.querySelector('#tr-signed').textContent));
      click(d.querySelector('[data-export=vtt]')); await wait(60); ok('VTT válido', /^WEBVTT\n\n1\n00:00:00\.\d{3} --> /.test(d.querySelector('#tr-out pre').textContent));
      ok('prévia rolável por teclado (tabindex)', d.querySelector('#tr-out pre').tabIndex === 0);
      await closeAll(); await closeAll();
    });
    await step('teleprompter: permissão explícita e gravação local', async () => {
      let asked = 0, uploads = 0; const tracks = [];
      Object.defineProperty(w.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { asked++; const tr = { stopped: false, stop() { this.stopped = true; } }; tracks.push(tr); return { getTracks: () => [tr] }; } } });
      w.MediaRecorder = class { constructor() { this.state = 'inactive'; } start() { this.state = 'recording'; setTimeout(() => this.ondataavailable && this.ondataavailable({ data: new w.Blob(['x'.repeat(4096)]) }), 40); } stop() { this.state = 'inactive'; setTimeout(() => this.onstop && this.onstop(), 10); } };
      const origFetch = w.fetch; w.fetch = (...x) => { uploads++; return origFetch ? origFetch(...x) : Promise.reject(new Error('sem rede')); };
      await debugFlag('ff_teleprompter', true); await openPlayer(); click(d.querySelector('#tp-open')); await until(() => d.querySelector('#tp-ov'), 2000, 'tp');
      ok('roteiro do projeto carregado com estimativa', d.querySelector('#tp-script').value.length > 20 && /palavras · cerca de \d+:\d{2}/.test(d.querySelector('#tp-est').textContent));
      ok('abrir o teleprompter NÃO pede câmera', asked === 0);
      click(d.querySelector('#tp-rec-ask')); await wait(60); ok('antes de pedir: explica (câmera, microfone, fica no aparelho)', /fica só neste aparelho/.test(d.querySelector('#tp-perm').textContent) && d.querySelector('#tp-perm').getAttribute('role') === 'alertdialog' && asked === 0);
      click(d.querySelector('#tp-perm-no')); await wait(60); ok('"Agora não" não pede câmera', asked === 0 && !d.querySelector('#tp-stage'));
      const sel = d.querySelector('#tp-count'); Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(sel, '0'); sel.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(30);
      click(d.querySelector('#tp-mirror')); await wait(20);
      click(d.querySelector('#tp-rec-ask')); await wait(40); click(d.querySelector('#tp-perm-ok')); await until(() => d.querySelector('#tp-stage'), 2000, 'stage');
      ok('só depois de "Permitir" o app pede câmera e microfone (1 vez)', asked === 1 && !!d.querySelector('#tp-recording'));
      ok('texto espelhado no palco', d.querySelector('#tp-text').getAttribute('data-mirror') === 'true');
      const stg = d.querySelector('#tp-stage'); ok('palco é um diálogo com foco', stg.getAttribute('role') === 'dialog' && stg.getAttribute('aria-modal') === 'true');
      key(stg, ' '); await wait(40); ok('Espaço pausa', d.querySelector('#tp-pause').getAttribute('aria-pressed') === 'true');
      key(stg, 'ArrowUp'); await wait(40); ok('↑ acelera (140 ppm)', /140 ppm/.test(d.querySelector('#tp-wpm').textContent)); key(stg, 'ArrowDown'); key(stg, 'ArrowDown'); await wait(40); ok('↓ desacelera (120 ppm)', /120 ppm/.test(d.querySelector('#tp-wpm').textContent));
      await wait(120); key(stg, 'Escape'); await until(() => d.querySelector('#tp-local'), 2000, 'local');
      ok('Esc para: câmera desligada e gravação salva SÓ no aparelho', !d.querySelector('#tp-stage') && tracks.every((t) => t.stopped) && /salva neste aparelho/.test(d.querySelector('#tp-local').textContent) && /Nada foi enviado/.test(d.querySelector('#tp-local').textContent));
      ok('nenhuma chamada de rede ao gravar', uploads === 0);
      click(d.querySelector('#tp-send')); await wait(60); ok('enviar pede opt-in explícito (desmarcado, botão bloqueado)', d.querySelector('#tp-optin').getAttribute('aria-checked') === 'false' && d.querySelector('#tp-send-go').disabled);
      click(d.querySelector('#tp-optin')); await wait(20); click(d.querySelector('#tp-send-go')); await wait(80); ok('com opt-in: enviado ao projeto', /Gravação enviada ao projeto/.test(d.querySelector('#tp-local').textContent));
      Object.defineProperty(w.navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => { throw new Error('NotAllowedError'); } } });
      click(d.querySelector('#tp-rec-ask')); await wait(40); click(d.querySelector('#tp-perm-ok')); await wait(120); ok('permissão negada: aviso claro, sem gravar', d.querySelector('#tp-denied').getAttribute('role') === 'alert' && !d.querySelector('#tp-stage'));
      w.fetch = origFetch; await closeAll(); await closeAll();
    });
    await step('log, desligar e i18n', async () => {
      await openDebug(0); const t = d.querySelector('#debug-ov').textContent; await closeDebug();
      ok('log com eventos do módulo, sem roteiro nem descrições', /a11y\.captions/.test(t) && /teleprompter\.upload/.test(t) && !/grávida|ana@x\.com|bicicleta elétrica/i.test(t));
      await debugFlag('ff_accessibility', false); await debugFlag('ff_teleprompter', false); await openPlayer(); ok('OFF de novo: player igual', !d.querySelector('#a11y-open') && !d.querySelector('#tp-open')); await closeAll();
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 11 (acessibilidade + teleprompter): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("((?:a11y|tp)\.[a-z._0-9]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.'));
      used.push(...['padrao', 'alto_contraste', 'grande', 'dislexia'].map((k) => 'a11y.st.' + k), 'a11y.pos.bottom', 'a11y.pos.top');
      ok('todas as chaves a11y/tp têm pt-BR, en e es, e toda chave usada existe', Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]));
      ok('alvos de toque ≥ 44 px no teleprompter e nas abas', /\.tp-bar button\{min-height:44px;min-width:44px\}/.test(SRC) && /\.a11y-tabs \[role=tab\]\{min-height:44px/.test(SRC));
      ok('respeita "reduzir movimento"', /prefers-reduced-motion:reduce\)\{\.cap-prev span\{transition:none\}/.test(SRC));
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
