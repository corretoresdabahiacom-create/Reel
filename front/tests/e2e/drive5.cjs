const { boot } = require('./h5.cjs');
(async () => {
  const h = boot({ langs: ['pt-BR'] }); const { w, d, wait, click, btn, all, until, type, tabs, log, ok, text, errors } = h;
  const E = (c) => w.eval(c);
  const setSel = (el, v) => { Object.getOwnPropertyDescriptor(w.HTMLSelectElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
  const closeOv = async () => { if (d.querySelector('.overlay')) await h.closeOv(); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { log.push('FAIL ' + name + ' :: ' + e.message.slice(0, 160)); } };
  const goProfile = async () => { click(tabs()[4]); await wait(250); };
  const openSettings = async () => { await goProfile(); click(btn('Configurações e privacidade')); await wait(300); };
  const settingsView = async (i) => { click(all('#settings-ov .card.row.tap')[i]); await wait(250); };
  const settingsBack = async () => { click(all('.top .iconbtn', d.querySelector('#settings-ov'))[0]); await wait(150); };
  try {
    // ---------- Passo 5a: consentimento granular no onboarding
    await wait(300);
    await step('5a consentimento no onboarding', async () => {
      click(btn('Pular')); await wait(120); click(all('button').find((b) => /Google/.test(b.textContent)));
      await until(() => d.querySelector('#consent-step'), 5000, 'consent');
      ok('5a onboarding mostra consentimento granular (4 caixas)', all('#consent-step [role=checkbox]').length >= 4);
      type(d.querySelector('#birth'), '1990-01-01'); await wait(80);
      const cbs = all('#consent-step [role=checkbox]'); click(cbs[0]); click(cbs[1]); await wait(80); // termos + IA (cookies/marketing ficam off)
      click(all('#consent-step button').filter((b) => !b.hasAttribute('role')).pop()); await until(() => d.querySelector('.tabbar'), 4000, 'tabbar');
      ok('5a segue para o app após aceitar termos', true);
    });
    // ---------- Passo 1: idioma
    await step('1 idioma', async () => {
      await openSettings(); await settingsView(0); await wait(200);
      const langBtns = all('#settings-ov [role=radio], #settings-ov button').filter((b) => /English|Español/.test(b.textContent));
      const en = langBtns.find((b) => /English/.test(b.textContent)); click(en); await wait(400);
      ok('1 UI muda para inglês sem recarregar', E('document.documentElement.lang') === 'en' && /Language|Settings/.test(text()));
      await settingsBack(); await h.closeOv(); click(tabs()[1]); await wait(300);
      ok('1 Criar traduzido (en)', /Photo|Script|Generate/.test(text()) && !/Roteiro/.test(text().slice(0, 4000)));
      click(tabs()[4]); await wait(300);
      ok('1 Perfil traduzido (en)', /Settings and privacy/.test(text()) && /Connected accounts/.test(text()));
      click(tabs()[3]); await wait(300); ok('1 Publicar renderiza (en)', /Platforms|Publish/.test(text()) || /No videos|ready/i.test(text()));
      click(btn('Settings and privacy') || tabs()[4]); // no-op safety
      click(tabs()[4]); await wait(250); click(btn('Settings and privacy')); await wait(300); await settingsView(0); await wait(150);
      const es = all('#settings-ov button').find((b) => /Español/.test(b.textContent) && b.getAttribute('role') !== 'tab'); click(es); await wait(400);
      ok('1 UI muda para espanhol', E('document.documentElement.lang') === 'es' && /Idioma|Ajustes/.test(text()));
      const pt = all('#settings-ov button').find((b) => /Português/.test(b.textContent)); click(pt); await wait(400);
      ok('1 volta para pt-BR', E('document.documentElement.lang') === 'pt-BR' && /Idioma/.test(text()));
      await settingsBack(); await h.closeOv();
      ok('1 persiste preferência (localStorage nx.locale)', E('localStorage.getItem("nx.locale")') === 'pt-BR');
    });
    // ---------- Passo 2: gerar vídeo, dublar, publicar por idioma
    await step('2 gerar', async () => {
      click(tabs()[1]); await wait(250);
      click(btn('Usar fotos de exemplo')); await wait(100); click(btn('Exemplo 1')); await wait(100);
      click(btn('Gerar storyboard')); await until(() => /Cena 1/.test(text()), 15000, 'storyboard');
      click(all('button').find((b) => /^Continuar$/.test(b.textContent.trim()))); await wait(250);
      click(all('button').find((b) => /Gerar vídeo de 60s/.test(b.textContent)));
      await until(() => all('button').some((b) => /Tentar novamente/.test(b.textContent)) || d.querySelector('#dub-open'), 70000, 'falha/preview');
      if (!d.querySelector('#dub-open')) { click(all('button').find((b) => /Tentar novamente/.test(b.textContent))); await until(() => d.querySelector('#dub-open'), 90000, 'preview'); }
      ok('2 vídeo gerado e botão "Dublar e legendar" visível', !!d.querySelector('#dub-open'));
    });
    await step('2 dublar', async () => {
      click(d.querySelector('#dub-open')); await wait(300);
      ok('2 custo total = 10 créditos (2 idiomas × 5)', /10/.test(d.querySelector('#dub-total').textContent));
      click(d.querySelector('#dub-start')); await until(() => d.querySelector('#dub-progress'), 3000, 'progresso');
      await wait(300); ok('2 progresso por idioma (en e es)', !!d.querySelector('[data-lang=en]') && !!d.querySelector('[data-lang=es]'));
      await until(() => d.querySelector('[data-version=en]') && d.querySelector('[data-version=es]'), 60000, 'versões');
      ok('2 3 versões (original + en + es)', all('[data-version]').length === 2 && /Original/i.test(d.querySelector('#dub-ov').textContent));
      await h.closeOv();
    });
    await step('2 publicar', async () => {
      click(tabs()[2]); await wait(300); // salva rascunho/biblioteca não necessário; vai para Publicar
      click(tabs()[3]); await wait(400);
      click(tabs()[4]); await wait(250); click(btn('Contas conectadas')); await wait(400);
      for (let k = 0; k < 2; k++) { const c = all('.overlay button').find((x) => /^Conectar$/.test(x.textContent.trim())); click(c); await wait(300); const au = btn('Autorizar'); if (au) { click(au); await wait(2500); } }
      await closeOv(); click(tabs()[3]); await wait(400);
      const plat = (name) => all('.pf').find((e) => e.textContent.includes(name));
      const covers = all('.pcover');
      for (const c of covers) { click(c); await wait(250); const tt = plat('TikTok'); if (tt && !tt.classList.contains('on')) click(all('button', tt).find((b) => b.hasAttribute('aria-pressed'))); await wait(150); if (plat('TikTok').querySelector('select[id$=-version]')) break; click(all('button', plat('TikTok')).find((b) => b.hasAttribute('aria-pressed'))); await wait(100); }
      if (!plat('TikTok').classList.contains('on')) click(all('button', plat('TikTok')).find((b) => b.hasAttribute('aria-pressed'))); await wait(150);
      if (!plat('YouTube').classList.contains('on')) click(all('button', plat('YouTube')).find((b) => b.hasAttribute('aria-pressed'))); await wait(150);
      const selT = plat('TikTok').querySelector('select[id$=-version]'), selY = plat('YouTube').querySelector('select[id$=-version]');
      ok('2 seletor de versão por plataforma', !!selT && !!selY);
      setSel(selT, 'en'); setSel(selY, 'es'); await wait(200);
      const fill = (pf, kinds) => kinds.forEach(([k, v]) => { const el = plat(pf).querySelector('[id$=-' + k + ']'); if (el) type(el, v); });
      fill('TikTok', [['caption', 'Check this out #nexus'], ['hashtags', '#nexus']]); fill('YouTube', [['title', 'Video en español'], ['desc', 'Descripción del video']]); await wait(200);

      click(all('button').find((b) => /Publicar em/.test(b.textContent))); await wait(600);
      await until(() => !all('.pf .spin').length && /Publicado em \d+ plataformas/.test(text()), 60000, 'publicado');
      click(all('.seg button').find((b) => /Histórico/.test(b.textContent))); await wait(300);
      const hist = d.body.textContent;  ok('2 histórico: TikTok · EN', /TikTok · EN/.test(hist)); ok('2 histórico: YouTube · ES', /YouTube Shorts · ES/.test(hist));
    });
    // ---------- Passo 3: CDN
    await step('3 cdn', async () => {
      click(tabs()[2]); await wait(1200);
      const thumbs = all('button.thumb'); const prj = thumbs.find((b) => /Anúncio de 60s/.test(b.getAttribute('aria-label'))) || thumbs[0];
      click(prj); await wait(600);
      const tg = d.querySelector('#cdn-toggle'); if (tg) { click(tg); await wait(300); }
      ok('3 cartão de entrega CDN visível', !!d.querySelector('#cdn-card'));
      ok('3 URL assinada com validade', /assin|expira|min/i.test((d.querySelector('#cdn-signed') || {}).textContent || ''));
      ok('3 thumbnail otimizada (WebP/AVIF)', /WebP|AVIF|webp/i.test((d.querySelector('#cdn-thumb') || {}).textContent || '') || /webp/i.test(d.querySelector('#cdn-card').textContent));
      await until(() => /HLS/.test((d.querySelector('#cdn-mode') || {}).textContent || ''), 8000, 'HLS pronto').catch(() => {});
      ok('3 modo HLS quando disponível (LATAM)', /HLS/.test((d.querySelector('#cdn-mode') || {}).textContent || ''));
    });
    // ---------- Passo 4: debug + kill switch
    await step('4 debug', async () => {
      await closeOv(); await wait(100);
      E('location.hash="#/__debug"'); w.dispatchEvent(new w.HashChangeEvent('hashchange')); await until(() => d.querySelector('#debug-ov'), 3000, 'debug ov');
      ok('4 /__debug abre', !!d.querySelector('#debug-ov'));
      ok('4 logs de geração/dublagem', all('#debug-ov').some((o) => /gener|dub|publish/i.test(o.textContent)));
      click(all('#debug-ov .seg button')[1]); await wait(200); const mt = d.querySelector('#dbg-metrics').textContent;
      ok('4 métricas generation_duration_ms e publication_success_total', /generation_duration_ms/.test(mt) && /publication_success_total/.test(mt));
      click(all('#debug-ov .seg button')[2]); await wait(200); ok('4 trace da geração', !!d.querySelector('#dbg-traces') && /gen/i.test(d.querySelector('#dbg-traces').textContent));
      click(all('#debug-ov .seg button')[3]); await wait(200);
      const rowGen = all('#dbg-flags .row').find((r) => /generation_enabled|geração|Geração/.test(r.textContent)); const sw = rowGen.querySelector('[role=switch]'); click(sw); await wait(250);
      await h.closeOv(); E('location.hash=""');
      click(tabs()[1]); await wait(300); if (btn('Criar outro')) { click(btn('Criar outro')); await wait(300); }
      ok('4 geração desligada → estado de manutenção amigável', !!d.querySelector('#maint-card'));
      ok('4 manutenção não quebra a tela (sem erros)', errors.length === 0);
      E('location.hash="#/__debug"'); w.dispatchEvent(new w.HashChangeEvent('hashchange')); await until(() => d.querySelector('#debug-ov'), 3000);
      click(all('#debug-ov .seg button')[3]); await wait(200);
      const row2 = all('#dbg-flags .row').find((r) => /generation_enabled|geração|Geração/.test(r.textContent)); click(row2.querySelector('[role=switch]')); await wait(250);
      await h.closeOv(); E('location.hash=""'); click(tabs()[1]); await wait(300); if (btn('Criar outro')) { click(btn('Criar outro')); await wait(300); }
      ok('4 religar flag remove a manutenção', !d.querySelector('#maint-card'));
    });

    // ---------- Região: EU desliga HLS (flag por região) e preços em EUR
    await step('3b região', async () => {
      await openSettings(); await settingsView(1); await wait(250);
      const eu = all('#settings-ov button').find((b) => /Europa/.test(b.textContent)); click(eu); await wait(400);
      ok('3b preço Pro em EUR (€)', /€/.test(d.querySelector('#settings-ov').textContent));
      await settingsBack(); await closeOv();
      click(tabs()[2]); await wait(1200); const prj = all('button.thumb').find((b) => /Anúncio de 60s/.test(b.getAttribute('aria-label'))) || all('button.thumb')[0]; click(prj); await wait(600);
      const tg = d.querySelector('#cdn-toggle'); if (tg) { click(tg); await wait(300); }
      ok('3b região EU: sem HLS (MP4 fallback)', /MP4/i.test((d.querySelector('#cdn-mode') || {}).textContent || ''));
      await closeOv(); await openSettings(); await settingsView(1); await wait(250);
      click(all('#settings-ov button').find((b) => /América Latina/.test(b.textContent))); await wait(300); await settingsBack(); await closeOv();
    });
    // ---------- Resiliência: circuit breaker da dublagem via injeção de falha
    await step('7 breaker', async () => {
      E('location.hash="#/__debug"'); w.dispatchEvent(new w.HashChangeEvent('hashchange')); await until(() => d.querySelector('#debug-ov'), 3000);
      click(all('#debug-ov .seg button')[4]); await wait(200);
      const swf = all('#dbg-res [role=switch]')[0]; click(swf); await wait(200); await closeOv(); E('location.hash=""');
      click(tabs()[2]); await wait(1200); const prj = all('button.thumb').find((b) => /Anúncio de 60s/.test(b.getAttribute('aria-label'))) || all('button.thumb')[0]; click(prj); await wait(600);
      click(d.querySelector('#dub-open') || btn('Dublar')); await wait(300);
      for (let i = 0; i < 4; i++) { click(d.querySelector('#dub-start')); await wait(200); await until(() => !d.querySelector('#dub-start').disabled, 40000, 'dub fim ' + i); await wait(150); }

      ok('7 falhas de dublagem permitem tentar de novo', all('#dub-progress button').some((b) => /de novo/i.test(b.textContent)));
      ok('7 circuito aberto mostra mensagem amigável', /indispon|aguarde|instável|circuit|pausad/i.test(d.querySelector('#dub-ov').textContent + text()));
      await closeOv();
    });
    // ---------- Passo 5: export + exclusão
    await step('5 lgpd', async () => {
      await openSettings(); await settingsView(3); await wait(250); // dados
      const exp = btn('Exportar'); click(exp); await until(() => d.querySelector('#export-preview'), 8000, 'export');
      const pv = d.querySelector('#export-preview').textContent; ok('5 export JSON sem tokens', /consent/i.test(pv) && !/accessToken|refreshToken|password/i.test(pv));
      const del = all('button').find((b) => /Excluir (minha )?conta/i.test(b.textContent)); click(del); await wait(300);
      const conf = all('.sheet button, .overlay button, button').reverse().find((b) => /Confirmar|Sim, excluir|Excluir/i.test(b.textContent) && b !== del); click(conf); await wait(500);
      ok('5 exclusão agendada (+30 dias) com banner', !!d.querySelector('#del-banner'));
      click(d.querySelector('#del-banner button')); await wait(400);
      ok('5 cancelar exclusão remove o banner', !d.querySelector('#del-banner'));
      await settingsBack(); await h.closeOv();
    });
    // ---------- Passo 6: offline
    await step('6 offline', async () => {
      click(tabs()[1]); await wait(200);
      w.dispatchEvent(new w.Event('offline')); await wait(300);
      ok('6 banner offline', !!d.querySelector('#offline-banner'));
      w.dispatchEvent(new w.Event('online')); await wait(1500);
      ok('6 reconexão remove o banner', !d.querySelector('#offline-banner'));
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
