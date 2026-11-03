// Módulo 1 — Áudio no protótipo: com ff_audio DESLIGADA nada muda; ligada, a aba de áudio funciona de ponta a ponta.
const { boot } = require('./h5.cjs');
(async () => {
  const h = boot({ langs: ['pt-BR'] }); const { w, d, wait, click, btn, all, until, type, tabs, log, ok, text, errors } = h;
  const E = (c) => w.eval(c);
  // O app roda num escopo fechado; verificações estáticas leem o próprio HTML e avaliam o trecho isolado num vm.
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
      const seed = vm.runInNewContext('const SEED_FLAGS = []; const nowISO = () => ""; ' + snippet('SEED_FLAGS.push(', '})));') + '; SEED_FLAGS');
      ok('OFF: as 17 flags ff_* dos módulos (+ ff_live_backend da P0-1, ff_voice_studio e ff_sections) existem e estão desligadas', seed.filter((f) => f.key !== 'ff_live_backend' && f.key !== 'ff_voice_studio' && f.key !== 'ff_sections').length === 17 && seed.some((f) => f.key === 'ff_sections') && seed.every((f) => f.key.startsWith('ff_') && !f.value && f.rolloutPercent === 0));
      ok('OFF: preview final sem botão de áudio (igual a antes)', !d.querySelector('#audio-open') && !!d.querySelector('#dub-open'));
      const ffOn = vm.runInNewContext('const flagOn = () => true; ' + snippet('const ffOn =', ';\n') + ' ffOn');
      ok('OFF: flag desconhecida conta como desligada (mesmo com o flagOn legado tratando ausente como ligada)', ffOn({ flags: [] }, 'ff_inexistente') === false && ffOn({ flags: [{ key: 'ff_audio' }] }, 'ff_audio') === true);
    });
    await step('ligar ff_audio', async () => {
      await debugFlag('ff_audio', true); click(tabs()[1]); await wait(300);
      ok('ON: botão "Áudio" aparece no preview final', !!d.querySelector('#audio-open'));
      click(d.querySelector('#audio-open')); await until(() => d.querySelector('#audio-ov'), 3000, 'audio ov');
      ok('ON: banner "Seu áudio será processado por…"', /processado/.test(d.querySelector('#aud-notice').textContent) && d.querySelector('#aud-notice').getAttribute('role') === 'note');
    });
    await step('biblioteca e trilha', async () => {
      const titles = all('#aud-tracks [data-track]').map((b) => b.textContent);
      ok('biblioteca por região: LATAM vê Lo-fi e não vê faixa só US/EU', titles.some((t) => /Lo-fi/.test(t)) && !titles.some((t) => /Grande Final/.test(t)));
      click(all('#audio-ov .chips button').find((b) => /Calma/.test(b.textContent))); await wait(120);
      ok('filtro por humor', all('#aud-tracks [data-track]').length >= 2 && all('#aud-tracks [data-track]').every((b) => /Calma/.test(b.textContent)));
      click(all('#aud-tracks [data-track]')[0]); await wait(80);
      ok('faixa selecionada (radio aria-checked)', all('#aud-tracks [aria-checked=true]').length === 1);
      type(d.querySelector('#aud-prompt'), 'trilha calma para spa'); await wait(60); click(d.querySelector('#aud-gen'));
      await until(() => all('#aud-tracks [data-track]').some((b) => /Trilha gerada/.test(b.textContent)), 4000, 'gerada');
      ok('gerar trilha por prompt cria e seleciona a faixa', /Trilha gerada/.test(d.querySelector('#aud-tracks [aria-checked=true]').textContent));
    });
    await step('volumes, ducking, prévia', async () => {
      setRange(d.querySelector('#aud-vol-music'), 35); await wait(60);
      ok('volume por faixa (slider nativo, valor e aria-valuetext)', d.querySelector('#aud-vol-music').value === '35' && d.querySelector('#aud-vol-music').getAttribute('aria-valuetext') === '35%' && /35%/.test(d.querySelector('#aud-vol-music').closest('label').textContent));
      ok('3 sliders rotulados (voz, trilha, efeitos)', all('#audio-ov input[type=range]').length === 3 && all('#audio-ov input[type=range]').every((r) => r.closest('label')));
      const duck = d.querySelector('#aud-duck'); ok('ducking ligado por padrão (role=switch)', duck.checked && duck.getAttribute('role') === 'switch');
      click(duck); await wait(60); ok('ducking desliga', !d.querySelector('#aud-duck').checked); click(d.querySelector('#aud-duck')); await wait(60);
      click(d.querySelector('#aud-play')); await wait(120);
      ok('prévia sem Web Audio (jsdom) avisa sem quebrar', /indisponível/.test(text()) && errors.length === 0);
    });
    await step('SFX', async () => {
      click(d.querySelector('#aud-sfx-suggest')); await wait(120);
      const sw = all('#aud-sfx input[type=checkbox]'); const lbl = d.querySelector('#aud-sfx').textContent;
      ok('SFX sugeridos: abertura, cortes de cena e fechamento', sw.length >= 3 && /Brilho/.test(lbl) && /Whoosh/.test(lbl) && /Impacto/.test(lbl));
      click(sw[0]); await wait(60); ok('cada SFX pode ser desligado', !all('#aud-sfx input[type=checkbox]')[0].checked);
    });
    await step('voz clonada', async () => {
      click(d.querySelector('[data-voice=clone]')); await wait(120);
      ok('sem consentimento verificado a voz clonada é bloqueada', /consentimento verificado/.test(text()) && !!d.querySelector('#aud-clone'));
      click(d.querySelector('#aud-apply')); await wait(120); ok('aplicar com voz clonada sem consentimento não mixa', !d.querySelector('#aud-progress'));
      click(d.querySelector('#aud-agree')); await wait(120);
      ok('frase única com código para ler', /Código \d{6}/.test(d.querySelector('#aud-phrase').textContent));
      click(d.querySelector('#aud-rec')); await until(() => d.querySelector('#aud-verify'), 4000, 'gravar');
      click(d.querySelector('#aud-verify')); await until(() => d.querySelector('#aud-create'), 4000, 'verificar');
      click(d.querySelector('#aud-create')); await until(() => /Sua voz está pronta/.test(d.querySelector('#aud-clone').textContent), 4000, 'criar');
      ok('fluxo consentimento → amostra → verificação → voz pronta', !!d.querySelector('#aud-revoke'));
    });
    await step('mixagem e versões', async () => {
      click(d.querySelector('#aud-apply')); await until(() => d.querySelector('#aud-progress'), 2000, 'progresso');
      ok('progresso com etapas (voz, ducking, −14 LUFS, stems)', all('#aud-progress .pill2').length === 4 && /LUFS/.test(d.querySelector('#aud-progress').textContent));
      await until(() => all('[data-aversion^=av-]').length === 1 && !d.querySelector('#aud-progress'), 6000, 'versão');
      const v = d.querySelector('[data-aversion^=av-]');
      ok('nova versão com áudio mixado, em uso, -14.0 LUFS', /Em uso/.test(v.textContent) && /-14\.0 LUFS/.test(v.textContent));
      ok('stems separados: voz, trilha e efeitos', all('[data-stem]', v).map((x) => x.dataset.stem).join(',') === 'voice,music,sfx');
      ok('player mostra que está tocando a mixagem', /mixagem/.test(d.querySelector('#aud-current').textContent));
      click(d.querySelector('#aud-revert')); await wait(120);
      ok('reverter para áudio original', /Em uso/.test(d.querySelector('[data-aversion=original]').textContent) && /original/.test(d.querySelector('#aud-current').textContent) && d.querySelector('#aud-revert').disabled);
      click(btn('Usar esta', v)); await wait(120); ok('ativar de novo a versão', /Em uso/.test(d.querySelector('[data-aversion^=av-]').textContent));
      click(d.querySelector('#aud-revoke')); await wait(120);
      ok('revogar apaga a voz e volta para "Original"', d.querySelector('[data-voice=original]').getAttribute('aria-checked') === 'true' && /revogado/.test(text()));
    });
    await step('i18n e acessibilidade', async () => {
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 1 (áudio): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("(aud\.[a-z._]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.')); // prefixos dinâmicos ("aud.mood." + m) conferidos abaixo
      const dyn = ['all', 'upbeat', 'corporate', 'energetic', 'calm', 'emotional', 'fun', 'epic'].map((m) => 'aud.mood.' + m).concat(['original', 'clone', 'none'].map((v) => 'aud.voice.' + v), ['voice', 'duck', 'lufs', 'stems'].map((k) => 'aud.step.' + k), ['sparkle', 'whoosh', 'impact'].map((k) => 'aud.sfx.' + k), ['voice', 'music', 'sfx'].map((k) => 'aud.vol.' + k));
      used.push(...dyn);
      ok('todas as chaves aud.* têm pt-BR, en e es, e toda chave usada existe', Object.keys(keyed).length > 50 && Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]));
      const css = snippet('.aud-range{', '}') + snippet('.aud-sw{', '}') + snippet('.aud-track{', '}');
      ok('alvos de toque ≥ 44 px (sliders, switches, faixas)', (css.match(/min-height:(44|52)px/g) || []).length === 3);
    });
    await step('desligar ff_audio', async () => {
      await h.closeOv(); await debugFlag('ff_audio', false); click(tabs()[1]); await wait(300);
      ok('OFF de novo: botão some e o preview segue igual', !d.querySelector('#audio-open') && !!d.querySelector('#dub-open'));
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
