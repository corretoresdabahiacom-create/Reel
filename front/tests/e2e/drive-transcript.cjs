// Módulo 9 — Transcrição + edição pelo texto + agente no protótipo: flags OFF = player igual; ON: transcrever (privacidade/90 dias),
// selecionar palavras, apagar (vídeo mais curto) e substituir (voz nova), prévia → versão nova, agente com plano/prévia/CONFIRMAÇÃO,
// histórico, transcrição desatualizada, limites 20/h e 10/h, nada da transcrição nem do comando no log.
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
  const words = () => all('#tx-words [data-i]');
  const dur = () => (d.querySelector('#tx-meta') || {}).textContent || '';
  const secOf = (s) => { const m = /(\d+):(\d{2}),(\d)/.exec(s); return m ? Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 10 : NaN; };
  const openTx = async () => { await openPlayer(); click(d.querySelector('#tx-open')); await until(() => d.querySelector('#tx-ov'), 3000, 'tx-ov'); await wait(100); };
  const logsText = async () => { await openDebug(0); const t = d.querySelector('#debug-ov').textContent; await closeDebug(); return t; };
  let secret = [];
  try {
    await h.onboard();
    await step('flags OFF', async () => { await openPlayer(); ok('OFF: player sem "Editar pelo texto"', !d.querySelector('#tx-open')); await closeAll(); });
    await step('transcrever', async () => {
      await debugFlag('ff_transcript', true); await openTx();
      ok('só ff_transcript: editor de transcrição sem barra do agente', !!d.querySelector('#tx-editor') && !d.querySelector('#ag-bar'));
      ok('aviso de privacidade (90 dias, só você, sem treino)', /90 dias/.test(d.querySelector('#tx-privacy').textContent) && /treinar/.test(d.querySelector('#tx-privacy').textContent));
      click(d.querySelector('#tx-run')); await wait(50); ok('estado "Transcrevendo…" com botão bloqueado', d.querySelector('#tx-run').disabled && /Transcrevendo/.test(d.querySelector('#tx-run').textContent));
      await until(() => words().length > 3, 4000, 'palavras'); ok('palavras na tela, tocáveis', words().length > 3 && words().every((b) => b.tagName === 'BUTTON'));
      secret = words().map((b) => b.textContent).filter((w) => w.length >= 5).slice(0, 6);
    });
    await step('apagar trecho → prévia → versão nova', async () => {
      const t0 = secOf(dur()); const n0 = words().length;
      click(words()[1]); await wait(30); click(words()[2]); await wait(30);
      ok('seleção de 2 palavras com ferramentas', /2 palavra/.test(d.querySelector('#tx-tools').textContent) && words()[1].getAttribute('aria-pressed') === 'true');
      click(d.querySelector('#tx-del')); await wait(40);
      ok('palavras apagadas riscadas e duração prevista menor', all('#tx-words .tx-w.cut').length === 2 && /alteraç/.test(d.querySelector('#tx-pending').textContent));
      click(d.querySelector('#tx-preview')); await until(() => d.querySelector('#tx-prev'), 3000, 'prévia');
      ok('prévia pronta com aviso "nada mudou ainda"', /Nada mudou ainda/.test(d.querySelector('#tx-prev').textContent) && secOf(dur()) === t0);
      click(d.querySelector('#tx-apply')); await wait(120);
      ok('aplicado: vídeo mais curto e transcrição acompanha (sem as 2 palavras)', secOf(dur()) < t0 && words().length === n0 - 2 && /Nova versão criada/.test(text()));
    });
    await step('substituir palavra (voz nova)', async () => {
      const t0 = secOf(dur()); click(words()[0]); await wait(30); click(d.querySelector('#tx-rep')); await wait(30);
      type(d.querySelector('#tx-rep-input'), 'Olá'); await wait(20); click(d.querySelector('#tx-rep-ok')); await wait(40);
      ok('palavra trocada aparece ao lado da original riscada', !!d.querySelector('#tx-words [data-new]') && d.querySelector('#tx-words [data-new]').textContent === 'Olá' && all('#tx-words .tx-w.rep').length === 1);
      click(words()[3]); await wait(20); click(words()[3]); await wait(20); click(d.querySelector('#tx-del')); await wait(20);
      click(all('#tx-words .tx-w.cut')[0]); await wait(30); ok('tocar numa alteração desfaz só ela', all('#tx-words .tx-w.cut').length === 0 && !!d.querySelector('#tx-words [data-new]'));
      click(d.querySelector('#tx-preview')); await until(() => d.querySelector('#tx-prev'), 3000); click(d.querySelector('#tx-apply')); await wait(120);
      ok('aplicado: duração igual e "Olá" na transcrição', Math.abs(secOf(dur()) - t0) < 0.25 && words().some((b) => b.textContent === 'Olá'));
    });
    await step('sobreposição e mínimo de 1 s', async () => {
      click(words()[1]); await wait(20); click(words()[1]); await wait(20); click(d.querySelector('#tx-del')); await wait(20);
      click(words()[0]); await wait(20); click(words()[2]); await wait(20); click(d.querySelector('#tx-del')); await wait(40);
      ok('seleção que encosta noutra alteração é recusada', /encosta em outra/.test(text()) && all('#tx-words .tx-w.cut').length === 1);
      click(d.querySelector('#tx-clear')); click(d.querySelector('#tx-undo')); await wait(30);
      click(words()[0]); await wait(20); click(words()[words().length - 1]); await wait(20); click(d.querySelector('#tx-del')); await wait(40);
      const left = secOf(d.querySelector('#tx-pending') ? d.querySelector('#tx-pending').textContent : '');
      ok('apagar todas as falas: o vídeo nunca fica com menos de 1 s (ou é recusado)', (/pelo menos 1 segundo/.test(text()) && all('#tx-words .tx-w.cut').length === 0) || left >= 1);
      if (d.querySelector('#tx-undo')) click(d.querySelector('#tx-undo')); if (d.querySelector('#tx-clear')) click(d.querySelector('#tx-clear')); await wait(20);
    });
    await step('agente: plano → prévia → confirmação → versão nova', async () => {
      await closeAll(); await closeAll(); await debugFlag('ff_agent', true); await openTx();
      ok('ON: barra do agente e editor juntos', !!d.querySelector('#ag-bar') && !!d.querySelector('#tx-editor'));
      const t0 = secOf(dur());
      type(d.querySelector('#ag-cmd'), 'faça um bolo'); await wait(20); click(d.querySelector('#ag-plan')); await wait(40);
      ok('comando não entendido: explica o que dá para pedir, sem prévia', !!d.querySelector('#ag-nu') && !d.querySelector('#ag-exec'));
      click(d.querySelector('[data-ex="1"]')); await wait(40);
      ok('exemplo vira plano em staging com passo e estimativa', d.querySelectorAll('#ag-plan-out [data-step=start]').length === 1 && /Cortar os primeiros 2,0 s/.test(d.querySelector('#ag-plan-out').textContent) && secOf(dur()) === t0);
      click(d.querySelector('#ag-exec')); await until(() => d.querySelector('#ag-prev'), 3000, 'prévia agente'); ok('prévia do agente pronta e nada aplicado', secOf(dur()) === t0);
      click(d.querySelector('#ag-apply')); await wait(60); ok('aplicar pede confirmação (alertdialog)', d.querySelector('#ag-confirm') && d.querySelector('#ag-confirm').getAttribute('role') === 'alertdialog' && /fica guardado/.test(d.querySelector('#ag-confirm').textContent));
      click(d.querySelector('#ag-confirm-no')); await wait(60); ok('"Agora não" não aplica', !d.querySelector('#ag-confirm') && secOf(dur()) === t0 && !!d.querySelector('#ag-prev'));
      click(d.querySelector('#ag-apply')); await wait(60); click(d.querySelector('#ag-confirm-ok')); await wait(150);
      ok('confirmado: versão nova ~2 s mais curta e histórico "aplicado"', Math.abs(t0 - secOf(dur()) - 2) < 0.25 && !!d.querySelector('#ag-hist [data-run=applied]'));
    });
    await step('agente com a transcrição: trocar e remover pausas; descartar', async () => {
      const w0 = words()[2].textContent; type(d.querySelector('#ag-cmd'), `troque "${w0}" por "bike"`); await wait(20); click(d.querySelector('#ag-plan')); await wait(40);
      ok('trocar X por Y vira passo de substituição', d.querySelectorAll('#ag-plan-out [data-step=replace]').length >= 1);
      click(d.querySelector('#ag-exec')); await until(() => d.querySelector('#ag-prev'), 3000); click(d.querySelector('#ag-discard')); await wait(60);
      ok('descartado entra no histórico sem mudar nada', !!d.querySelector('#ag-hist [data-run=discarded]') && !words().some((b) => b.textContent === 'bike'));
      click(d.querySelector('[data-ex="2"]')); await wait(40); ok('remover pausas acha as pausas entre as falas', d.querySelectorAll('#ag-plan-out [data-step=pause]').length >= 1);
    });
    await step('transcrição desatualizada após mudança', async () => {
      ok('agente aplicou → transcrição acompanha (não fica desatualizada)', !d.querySelector('#tx-outdated'));
      await closeAll(); await closeAll(); await debugFlag('ff_transcript', false); await openTx();
      ok('só ff_agent: barra do agente sem editor', !!d.querySelector('#ag-bar') && !d.querySelector('#tx-editor'));
      await closeAll(); await closeAll(); await debugFlag('ff_transcript', true);
    });
    await step('limites 20/h e 10/h', async () => {
      await openTx(); let n = 0;
      for (let i = 0; i < 25 && !/Limite de 20 transcrições/.test(text()); i++) { const b = d.querySelector('#tx-run'); if (!b) { break; } click(b); n++; await wait(950); }
      ok('transcrever além do limite mostra aviso (20/h)', /Limite de 20 transcrições/.test(text()) || n === 0);
      for (let i = 0; i < 12 && !/Limite de 10 execuções/.test(text()); i++) { click(d.querySelector('[data-ex="3"]')); await wait(30); const x = d.querySelector('#ag-exec'); if (!x) break; click(x); await wait(760); const disc = d.querySelector('#ag-discard'); if (disc) { click(disc); await wait(30); } }
      ok('executar o agente além do limite mostra aviso (10/h)', /Limite de 10 execuções/.test(text()));
    });
    await step('nada da transcrição nem do comando no log', async () => {
      await closeAll(); await closeAll(); const t = await logsText();
      ok('log tem eventos do módulo (só contagens)', /transcript\.done/.test(t) && /agent\.plan/.test(t) && /agent\.apply/.test(t));
      ok('nenhuma palavra da transcrição, texto novo ou comando no log', secret.length > 0 && secret.every((w) => !t.includes(w)) && !t.includes('Olá') && !t.includes('primeiros 2') && !t.includes('bolo'));
    });
    await step('desligar e i18n', async () => {
      await debugFlag('ff_transcript', false); await debugFlag('ff_agent', false); await openPlayer(); ok('OFF de novo: botão some', !d.querySelector('#tx-open')); await closeAll();
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 9 (transcrição + agente): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("((?:tx|ag)\.[a-z._0-9]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.'));
      used.push(...[1, 2, 3].map((k) => 'ag.ex.' + k), ...['planned', 'previewed', 'applied', 'discarded'].map((k) => 'ag.st.' + k), ...['start', 'end', 'trim', 'scene', 'pause', 'cut', 'replace'].map((k) => 'ag.step.' + k));
      ok('todas as chaves tx.*/ag.* têm pt-BR, en e es, e toda chave usada existe', Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]));
      const P = vm.runInNewContext(snippet('const AG_REMOVE =', ';\n') + snippet('const AG_SEC =', ';\n') + snippet('const agFold =', ';\n') + snippet('const agQuoted =', ';\n') + snippet('function agFind(words, phrase) {', '\n}') + snippet('function agPlan(command, ctx) {', '\n}') +
        `; const W = "eu gosto muito de café".split(" ").map((w, i) => ({ i, w, start: i * 500, end: i * 500 + 400 })); const C = { durationMs: 12000, scenes: [{ index: 0, startMs: 0, endMs: 4000 }, { index: 1, startMs: 4000, endMs: 8000 }], words: W };
        [agPlan("cut the last 3 seconds", C).steps[0].op.startMs, agPlan("elimina la escena 2", C).steps[0].op.endMs, agPlan("troque 'café' por chá", C).steps[0].op.text, agPlan("remova muito", { ...C, words: null }).message]`);
      ok('planejador da UI igual ao do servidor (en/es/pt, precisa da transcrição)', JSON.stringify(P) === '[9000,8000,"chá","needs_transcript"]');
      ok('alvos de toque: palavras com 40 px', /\.tx-w\{min-height:40px/.test(SRC));
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
