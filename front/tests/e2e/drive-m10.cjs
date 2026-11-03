// Módulo 10 — Insights + Séries + Selo + Live no protótipo: flags OFF = app igual; ON: estimativa rotulada com sugestões, série com 3
// capítulos (continuidade, reordenar, CTA https), selo C2PA com verificação, live B2B com rótulo "IA", aviso, opt-in, consentimento e limites.
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
  const openN = async (i) => { click(tabs()[2]); await wait(900); click(all('.grid3 .thumb')[i]); await until(() => d.querySelector('.overlay'), 3000, 'player'); await wait(150); };
  const biz = async () => { click(tabs()[4]); await wait(200); click(btn('Modo Business')); await wait(250); if (btn('Ativar Business')) { click(btn('Ativar Business')); await wait(250); } };
  try {
    await h.onboard();
    await step('flags OFF', async () => {
      await openPlayer(); ok('OFF: player sem previsão, séries e selo', !d.querySelector('#in-open') && !d.querySelector('#se-open') && !d.querySelector('#sl-card')); await closeAll();
      await biz(); ok('OFF: Business sem aba Live', !all('.seg button').some((b) => b.textContent === 'Live')); await closeAll();
    });
    await step('insights (estimativa)', async () => {
      await debugFlag('ff_insights', true); await openPlayer(); click(d.querySelector('#in-open')); await until(() => d.querySelector('#in-ov'), 2000, 'in-ov');
      ok('rótulo ESTIMATIVA e aviso antes de qualquer número', /ESTIMATIVA/.test(d.querySelector('#in-badge').textContent) && /Não é garantia/.test(d.querySelector('#in-disclaimer').textContent) && !d.querySelector('#in-scores'));
      click(d.querySelector('#in-run')); await until(() => d.querySelector('#in-scores'), 2000, 'scores');
      const ms = all('#in-scores [role=meter]'); ok('3 notas (retenção, CTR, conversão) 0–100 como medidores acessíveis', ms.length === 3 && ms.every((m) => +m.getAttribute('aria-valuenow') >= 5 && +m.getAttribute('aria-valuenow') <= 95 && /ESTIMATIVA/.test(m.getAttribute('aria-label'))));
      ok('sugestões com texto e efeito estimado', all('#in-sugs [data-sug]').length > 0 && /\+\d+ pts/.test(d.querySelector('#in-sugs').textContent) || /Nada a ajustar/.test(d.querySelector('#in-sugs').textContent));
      click(d.querySelector('#in-run')); await wait(700); ok('histórico guarda as estimativas', /2 estimativa/.test(d.querySelector('#in-hist').textContent));
      await closeAll(); await closeAll();
    });
    await step('séries: 3 capítulos', async () => {
      await debugFlag('ff_series', true); await openN(0); click(d.querySelector('#se-open')); await until(() => d.querySelector('#se-ov'), 2000);
      ok('sem séries: explica e abre o formulário', /Anteriormente/.test(d.querySelector('#se-create').textContent));
      type(d.querySelector('#se-name'), 'Amor na Loja'); await wait(30); click(d.querySelector('#se-create-go')); await wait(80);
      click(d.querySelector('#se-add')); await wait(60); ok('vídeo vira capítulo 1', /já é o capítulo 1/.test(d.querySelector('#se-in').textContent));
      await closeAll(); await closeAll(); await openN(1); click(d.querySelector('#se-open')); await until(() => d.querySelector('#se-ov'), 2000); click(d.querySelector('#se-add')); await wait(60);
      ok('outro vídeo (rascunho) entra pelo seletor', all('#se-pick option').some((o) => /rascunho/.test(o.textContent)));
      const opt = all('#se-pick option').find((o) => /Tênis/.test(o.textContent)); const sp = d.querySelector('#se-pick'); Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(sp, opt.value); sp.dispatchEvent(new w.Event('change', { bubbles: true })); await wait(40);
      click(d.querySelector('#se-pick-add')); await wait(60);
      const eps = all('#se-detail [data-ep]'); ok('3 capítulos em ordem', eps.length === 3 && /3 capítulo/.test(d.querySelector('#se-detail').textContent));
      ok('continuidade: "Anteriormente em Amor na Loja" do 2º em diante', !eps[0].querySelector('[data-recap]') && /^Anteriormente em Amor na Loja: /.test(eps[1].querySelector('[data-recap]').textContent));
      ok('CTA: 1º leva ao capítulo 2; último sem CTA', /Assista ao capítulo 2/.test(eps[0].querySelector('[data-cta]').textContent) && eps[2].querySelector('[data-cta]').getAttribute('data-cta') === 'none');
      const t3 = eps[2].querySelector('b').textContent; click(d.querySelector('[data-up="3"]')); await wait(60);
      ok('reordenar: o 3º sobe e a continuidade é refeita', all('#se-detail [data-ep]')[1].querySelector('b').textContent === t3 && /já é o capítulo 3/.test(d.querySelector('#se-in').textContent) && /Anteriormente em Amor na Loja: /.test(all('#se-detail [data-ep]')[2].querySelector('[data-recap]').textContent));
      const e1 = all('#se-detail [data-ep]')[0]; e1.querySelector('details').open = true; type(e1.querySelector('[data-cta-url]'), 'http://inseguro.com'); await wait(20); click(e1.querySelector('[data-cta-save]')); await wait(60);
      ok('CTA sem https recusado', /precisa começar com https/.test(text()) && e1.querySelector('[data-cta]').getAttribute('data-cta') === 'next');
      type(e1.querySelector('[data-cta-url]'), 'https://loja.example/promo'); type(e1.querySelector('[data-cta-label]'), 'Ver a promoção'); await wait(20); click(e1.querySelector('[data-cta-save]')); await wait(60);
      ok('CTA https salvo no capítulo', all('#se-detail [data-ep]')[0].querySelector('[data-cta]').getAttribute('data-cta') === 'custom' && /Ver a promoção/.test(all('#se-detail [data-ep]')[0].textContent));
      await closeAll(); await closeAll();
    });
    await step('selo C2PA', async () => {
      await debugFlag('ff_seal', true); await openPlayer();
      ok('selo explica o certificado embutido', /certificado C2PA/.test(d.querySelector('#sl-explain').textContent));
      click(d.querySelector('#sl-apply')); await wait(50); ok('assinando (botão ocupado)', d.querySelector('#sl-apply').disabled); await until(() => d.querySelector('#sl-badge'), 3000, 'selo');
      ok('selo "IA com direção humana · C2PA" com quem assinou', /IA com direção humana · C2PA/.test(d.querySelector('#sl-badge').textContent) && /embutido no arquivo · assinado por NexusReel/.test(d.querySelector('#sl-meta').textContent));
      click(d.querySelector('#sl-verify')); await wait(40); ok('verificar: válido', d.querySelector('#sl-result').getAttribute('data-result') === 'ok' && d.querySelector('#sl-result').getAttribute('role') === 'status');
      click(d.querySelector('#sl-tamper')); await wait(40); ok('arquivo alterado: inválido', d.querySelector('#sl-result').getAttribute('data-result') === 'bad' && /alterado depois/.test(d.querySelector('#sl-result').textContent));
      await closeAll();
    });
    await step('live B2B com rótulo IA', async () => {
      await debugFlag('ff_live', true); await biz();
      click(btn('Catálogos', d.querySelector('.seg'))); await wait(150); click(btn('Criar catálogo')); await wait(150);
      type(d.querySelector('#cw-name'), 'Loja Aro 29'); await wait(80); click(btn('Continuar')); await wait(100);
      click(btn('Usar CSV de exemplo')); await wait(150); click(btn('Continuar')); await wait(100); click(btn('Continuar')); await wait(100); click(btn('Gerar vídeos em lote')); await wait(300);
      click(btn('Live', d.querySelector('.seg'))); await until(() => d.querySelector('#lv-dash'), 2000, 'live');
      ok('rótulo "IA" travado ligado (obrigatório)', d.querySelector('#lv-label [role=switch]').getAttribute('aria-checked') === 'true' && d.querySelector('#lv-label [role=switch]').getAttribute('aria-disabled') === 'true');
      type(d.querySelector('#lv-title'), 'Vitrine 24h'); await wait(30); ok('sem opt-in do lojista não cria', d.querySelector('#lv-create').disabled);
      click(d.querySelector('#lv-optin')); await wait(30); click(d.querySelector('[data-av=custom]')); await wait(20); click(d.querySelector('#lv-create')); await wait(80);
      ok('avatar com a própria imagem pede consentimento', !!d.querySelector('#lv-consent') && d.querySelector('#lv-consent').getAttribute('role') === 'alertdialog' && /revogar/.test(d.querySelector('#lv-consent').textContent));
      click(d.querySelector('#lv-consent-ok')); await wait(80); click(d.querySelector('#lv-create')); await wait(80);
      type(d.querySelector('#lv-title'), 'Vitrine Ana'); click(d.querySelector('#lv-optin')); click(d.querySelector('[data-av=ana]')); await wait(30); click(d.querySelector('#lv-create')); await wait(80);
      ok('2 lives prontas', all('[data-live=draft]').length === 2);
      click(all('[data-live=draft] [data-start]')[0]); await until(() => d.querySelector('#lv-go-sheet'), 1500, 'aviso');
      ok('antes de entrar no ar mostra o aviso de IA', /avatar de inteligência artificial \(IA\)/.test(d.querySelector('#lv-disc-preview').textContent) && /Loja Aro 29/.test(d.querySelector('#lv-disc-preview').textContent));
      click(d.querySelector('#lv-go')); await wait(150);
      const live = d.querySelector('[data-live=live]'); ok('no ar: rótulo "IA" visível na tela do cliente e aviso no início', !!live.querySelector('[data-ai-label]') && live.querySelector('[data-ai-label]').textContent === 'IA' && !!live.querySelector('[data-disclosure]'));
      ok('produto do catálogo com fala do apresentador', /Toque no produto para comprar/.test(live.querySelector('[data-prod]').textContent));
      live.querySelector('details').open = true; ok('registro: criada → aviso de IA exibido → no ar', all('[data-ev]', live).map((e) => e.getAttribute('data-ev')).join() === 'created,ai_disclosure_shown,started');
      await wait(3300); ok('exibições do rótulo registradas', +/(\d+) vez/.exec(d.querySelector('[data-live=live] [data-impr]').textContent)[1] >= 1);
      await wait(6200); ok('aviso some depois do início, rótulo continua', !d.querySelector('[data-live=live] [data-disclosure]') && !!d.querySelector('[data-live=live] [data-ai-label]'));
      click(d.querySelector('#lv-revoke')); await wait(120);
      ok('revogar o consentimento encerra a live com avatar próprio (a do avatar pronto segue no ar)', all('[data-live=ended]').length === 1 && !d.querySelector('[data-live=draft]') && !!d.querySelector('[data-live=live]'));
      click(d.querySelector('[data-live=live] [data-stop]')); await wait(80);
      ok('encerrar', all('[data-live=ended]').length === 2);
    });
    await step('limites 5/h e 60/h', async () => {
      for (let i = 0; i < 4 && !/Limite de 5 lives/.test(text()); i++) { type(d.querySelector('#lv-title'), 'Extra ' + i); click(d.querySelector('#lv-optin')); await wait(20); click(d.querySelector('#lv-create')); await wait(60); if (d.querySelector('#lv-optin').getAttribute('aria-checked') === 'true') click(d.querySelector('#lv-optin')); }
      ok('6ª live na hora mostra o limite (5/h)', /Limite de 5 lives/.test(text())); await closeAll();
      await openPlayer(); click(d.querySelector('#in-open')); await until(() => d.querySelector('#in-ov'), 2000);
      for (let i = 0; i < 60 && !/Limite de 60 estimativas/.test(text()); i++) { click(d.querySelector('#in-run')); await wait(540); }
      ok('61ª estimativa na hora mostra o limite (60/h)', /Limite de 60 estimativas/.test(text())); await closeAll(); await closeAll();
    });
    await step('desligar, i18n e paridade', async () => {
      for (const f of ['ff_insights', 'ff_series', 'ff_seal', 'ff_live']) await debugFlag(f, false);
      await openPlayer(); ok('OFF de novo: player igual', !d.querySelector('#in-open') && !d.querySelector('#se-open') && !d.querySelector('#sl-card')); await closeAll();
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 10 (insights + séries + selo + live): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("((?:in|se|sl|lv)\.[a-z._0-9]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.'));
      used.push(...['retention', 'ctr', 'conversion'].map((k) => 'in.' + k), ...['shorten_video', 'lengthen_video', 'shorter_hook', 'hook_question', 'faster_cuts', 'slower_speech', 'add_cta', 'add_music', 'translate', 'title_length'].map((k) => 'in.sg.' + k),
        ...['mininovela', 'tutorial', 'lancamento', 'livre'].flatMap((k) => ['se.tpl.' + k, 'se.recap.' + k, 'se.next.' + k]), ...['draft', 'live', 'ended'].map((k) => 'lv.st.' + k), ...['created', 'ai_disclosure_shown', 'started', 'stopped'].map((k) => 'lv.ev.' + k));
      ok('todas as chaves in/se/sl/lv têm pt-BR, en e es, e toda chave usada existe', Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]));
      const P = vm.runInNewContext(snippet('function inScore(f) {', '\n}') + `; const g = inScore({ durationSec: 24, sceneCount: 6, avgSceneSec: 4, hookWords: 8, hookQuestion: true, hookNumber: false, ctaPresent: true, wordsPerSec: 2.4, hasMusic: true, localizedCount: 1, titleChars: 30, pastPublications: 3, pastSuccessRate: 1 });
        const b = inScore({ durationSec: 90, sceneCount: 5, avgSceneSec: 18, hookWords: 30, hookQuestion: false, hookNumber: false, ctaPresent: false, wordsPerSec: 4.2, hasMusic: false, localizedCount: 0, titleChars: 4, pastPublications: 0, pastSuccessRate: 0 });
        [g.retention, g.ctr, g.conversion, b.retention, b.ctr, b.conversion, b.suggestions.map((s) => s.code)]`);
      ok('modelo da UI igual ao heuristic-v1 do servidor', JSON.stringify(P) === '[95,69,72,15,40,21,["add_cta","shorten_video","hook_question","shorter_hook","slower_speech","faster_cuts"]]');
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
