// Módulo 7 — Envio por e-mail no protótipo: flag OFF = app igual; ON: destinatários (até 20, sem descartáveis), cópia para si,
// mensagem sem links, senha opcional, link de 7 dias, limite de 10 envios/min, cancelar link, lote do catálogo (ZIP ou por produto).
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
  const sheet = () => d.querySelector('#em-sheet');
  const addTo = async (e, enter = false) => { type(d.querySelector('#em-to'), e); await wait(30); if (enter) d.querySelector('#em-to').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); else click(d.querySelector('#em-add')); await wait(50); };
  const sendBtn = () => d.querySelector('#em-send');
  const DOM = '@destino-teste.com.br';
  try {
    await h.onboard();
    await step('flag OFF', async () => { await openPlayer(); ok('OFF: player sem "Enviar por e-mail"', !d.querySelector('#email-open')); await closeAll(); });
    await step('ligar e abrir', async () => {
      await debugFlag('ff_email', true); await openPlayer(); ok('ON: botão no player', !!d.querySelector('#email-open'));
      click(d.querySelector('#email-open')); await until(() => sheet(), 3000, 'sheet');
      ok('link válido por 7 dias explicado e "Enviar" bloqueado sem destinatário', /link válido por 7 dias/.test(sheet().textContent) && sendBtn().disabled);
    });
    await step('destinatários', async () => {
      await addTo('ana@'); ok('e-mail incompleto → aviso', /parece incompleto/.test(d.querySelector('#em-err').textContent));
      await addTo('x@mailinator.com'); ok('descartável → bloqueado', /e-mails temporários/.test(d.querySelector('#em-err').textContent));
      await addTo('ana' + DOM); await addTo('BRUNO' + DOM, true); await addTo('ana' + DOM);
      ok('adiciona (botão e Enter), ignora repetido e normaliza', all('#em-list .em-chip').length === 2 && /2 de 20 destinatários/.test(d.querySelector('#em-count').textContent) && d.querySelector('#em-list').textContent.includes('bruno' + DOM));
      click(d.querySelector(`[data-rm="bruno${DOM}"]`)); await wait(40); ok('remover destinatário (alvo ≥ 32 px com rótulo)', all('#em-list .em-chip').length === 1 && !!d.querySelector('#em-list [aria-label^="Remover"]'));
      click(sheet().querySelectorAll('[role=switch]')[0]); await wait(40); ok('cópia para mim conta no total', /2 de 20/.test(d.querySelector('#em-count').textContent));
      for (let i = 0; i < 18; i++) await addTo(`p${i}${DOM}`);
      ok('20 no total (19 + cópia)', /20 de 20/.test(d.querySelector('#em-count').textContent));
      await addTo('extra' + DOM); ok('21º → bloqueado (máx. 20 por envio)', /No máximo 20 pessoas/.test(d.querySelector('#em-err').textContent) && /20 de 20/.test(d.querySelector('#em-count').textContent));
      for (let i = 0; i < 18; i++) { click(d.querySelector(`[data-rm="p${i}${DOM}"]`)); await wait(30); }
    });
    await step('mensagem e senha', async () => {
      type(d.querySelector('#em-msg'), 'Veja em bit.ly/oferta'); await wait(40); ok('mensagem com link bloqueia o envio', sendBtn().disabled && /Tire o link/.test(d.querySelector('#em-msg-hint').textContent));
      type(d.querySelector('#em-msg'), 'Olha a bike nova!'); await wait(40); ok('mensagem sem link libera', !sendBtn().disabled);
      click(sheet().querySelectorAll('[role=switch]')[1]); await wait(40); type(d.querySelector('#em-pw'), '12'); await wait(30); ok('senha curta bloqueia', sendBtn().disabled);
      type(d.querySelector('#em-pw'), 'segredo'); await wait(30); ok('a tela avisa que a senha não vai no e-mail', !sendBtn().disabled && /não vai no e-mail/.test(sheet().textContent));
    });
    await step('enviar, copiar, histórico e cancelar', async () => {
      click(sendBtn()); await until(() => d.querySelector('#em-done'), 2000, 'enviado');
      ok('enviado para 2 pessoas, com validade', /Enviado para 2 pessoa/.test(d.querySelector('#em-done').textContent) && /vale até/.test(d.querySelector('#em-done').textContent));
      ok('histórico mostra só quantos, "com senha" e nenhum endereço', /2 destinatário\(s\) · com senha/.test(d.querySelector('#em-history').textContent) && !d.querySelector('#em-history').textContent.includes('@'));
      click(d.querySelector('[data-revoke-share]')); await wait(80); ok('cancelar link', /link cancelado/.test(d.querySelector('#em-history').textContent));
    });
    await step('nenhum endereço guardado nem logado', async () => {
      await closeAll(); await closeAll();
      const ls = Object.keys(w.localStorage).map((k) => w.localStorage.getItem(k)).join('|'); ok('armazenamento local sem os e-mails dos destinatários', !ls.includes(DOM.slice(1)));
      await openDebug(0); const lg = d.querySelector('#debug-ov').textContent; await closeDebug(); ok('log com email_share.send e sem e-mail', /email_share\.send/.test(lg) && !lg.includes(DOM.slice(1)));
    });
    await step('lote do catálogo', async () => {
      click(tabs()[4]); await wait(200); click(btn('Modo Business')); await wait(250); click(btn('Ativar Business')); await wait(250);
      click(btn('Catálogos', d.querySelector('.seg'))); await wait(150); click(btn('Criar catálogo')); await wait(150);
      type(d.querySelector('#cw-name'), 'Loja Esportes Verão'); await wait(80); click(btn('Continuar')); await wait(100);
      click(btn('Usar CSV de exemplo')); await wait(150); click(btn('Continuar')); await wait(100); click(btn('Continuar')); await wait(100);
      click(btn('Gerar vídeos em lote')); await until(() => text().replace(/ /g, ' ').includes('4 ok · 1 falhas'), 40000, 'lote');
      ok('catálogo com "Enviar por e-mail"', !!d.querySelector('#cat-email')); click(d.querySelector('#cat-email')); await until(() => sheet(), 2000, 'sheet lote');
      ok('modos: um ZIP ou um e-mail por produto (4)', !!d.querySelector('[data-em-mode=zip]') && /Um e-mail por produto \(4\)/.test(d.querySelector('[data-em-mode=per_item]').textContent));
      click(d.querySelector('[data-em-mode=per_item]')); await wait(40); await addTo('compras' + DOM); click(sendBtn()); await until(() => d.querySelector('#em-done'), 2000);
      ok('por produto: 4 e-mails por pessoa', /4 e-mails por pessoa/.test(d.querySelector('#em-done').textContent));
      await closeAll(); await closeAll();
    });
    await step('limite de envios por minuto', async () => {
      await openPlayer(); click(d.querySelector('#email-open')); await until(() => sheet(), 3000);
      let blocked = false;
      for (let i = 0; i < 11 && !blocked; i++) {
        if (d.querySelector('#em-again')) { click(d.querySelector('#em-again')); await wait(40); }
        await addTo(`r${i}${DOM}`); click(sendBtn()); await wait(60); blocked = !!d.querySelector('#em-err') && /Muitos envios/.test(d.querySelector('#em-err').textContent);
      }
      ok('11º envio no mesmo minuto → bloqueado com aviso claro', blocked);
    });
    await step('desligar', async () => { await debugFlag('ff_email', false); await openPlayer(); ok('OFF de novo: botão some', !d.querySelector('#email-open')); await closeAll(); });
    await step('i18n e regras', async () => {
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 7 (e-mail): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("(em\.[a-z._]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.'));
      ok('todas as chaves em.* têm pt-BR, en e es, e toda chave usada existe', Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]) && used.length > 35);
      const f = vm.runInNewContext(snippet('const EM_DISPOSABLE', '\nfunction EmailShareSheet').replace(/\nfunction EmailShareSheet$/, '') + '; [emDisposable("a@x.mailinator.com"), emDisposable("a@gmail.com"), emHasLink("veja www.x.com"), emHasLink("oi, tudo bem?"), emValid("a@b.co"), emValid("a@b")]');
      ok('regras iguais às do backend (descartável com subdomínio, link na mensagem, formato)', JSON.stringify(f) === JSON.stringify([true, false, true, false, true, false]));
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
