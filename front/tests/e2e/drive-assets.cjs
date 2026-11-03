// Módulo 6 — Assets derivados no protótipo: flag OFF = player igual a antes; ON: GIF, figurinha, papel de parede, central do carro
// e protetor de tela a partir do vídeo pronto, com cache por usuário e nomes sem título.
const { boot } = require('./h5.cjs');
(async () => {
  const h = boot({ langs: ['pt-BR'] }); const { w, d, wait, click, btn, all, until, tabs, log, ok, text, errors } = h;
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
  const sheet = () => d.querySelector('#as-sheet');
  const gen = async () => { click(d.querySelector('#as-go')); await until(() => !d.querySelector('#as-done') && d.querySelector('#as-go').disabled, 2000, 'gerando'); await until(() => d.querySelector('#as-done'), 4000, 'pronto'); await wait(30); return d.querySelector('#as-done').textContent; };
  try {
    await h.onboard();
    let title;
    await step('flag OFF', async () => { await openPlayer(); title = d.querySelector('.overlay .h2').textContent; ok('OFF: player sem "GIF, figurinha e papel de parede"', !d.querySelector('#assets-open') && !!btn('Publicar este vídeo')); await closeAll(); });
    await step('ligar ff_assets', async () => {
      await debugFlag('ff_assets', true); await openPlayer(); ok('ON: botão no player', !!d.querySelector('#assets-open'));
      click(d.querySelector('#assets-open')); await until(() => sheet(), 3000, 'sheet');
      ok('5 tipos: GIF, figurinha, papel de parede, central do carro, protetor de tela', ['gif', 'sticker', 'wallpaper', 'car', 'screensaver'].every((k) => sheet().querySelector(`[data-as=${k}]`)) && all('#as-sheet [data-as]').length === 5);
      ok('GIF selecionado por padrão, com limite explicado', sheet().querySelector('[data-as=gif]').getAttribute('aria-checked') === 'true' && /até 10 s e até 10 MB/.test(d.querySelector('#as-hint').textContent));
    });
    await step('GIF e cache', async () => {
      click(sheet().querySelector('[data-as-opt="10"]')); await wait(40);
      const t1 = await gen(); const name = d.querySelector('#as-done b').textContent;
      ok('GIF pronto, nome padronizado sem o título do vídeo', /^nexusreel-gif-[a-z0-9]{1,8}\.gif$/.test(name) && !name.includes(title.split(' ')[0]) && !/reaproveitado/.test(t1));
      const t2 = await gen(); ok('mesmo pedido de novo: reaproveitado na hora (cache do próprio usuário)', /reaproveitado na hora/.test(t2));
      click(sheet().querySelector('[data-as-opt="3"]')); await wait(40); const t3 = await gen(); ok('outra duração: novo arquivo (configuração entra na chave)', !/reaproveitado/.test(t3));
    });
    await step('figurinha', async () => { click(sheet().querySelector('[data-as=sticker]')); await wait(40); ok('explica 512×512 transparente', /512×512 com fundo transparente/.test(d.querySelector('#as-hint').textContent)); ok('gera .webp', /\.webp/.test(await gen())); });
    await step('papel de parede', async () => {
      click(sheet().querySelector('[data-as=wallpaper]')); await wait(40);
      ok('5 aparelhos (iPhone Live Photo, Android, PC 1080p/1440p/4K)', all('#as-opts [data-as-opt]').length === 5 && /Live Photo de 3 s/.test(d.querySelector('#as-hint').textContent));
      ok('Live Photo sai como pacote .zip', /nexusreel-wallpaper-iphone-live-.+\.zip/.test(await gen()));
      click(sheet().querySelector('[data-as-opt=pc_4k]')); await wait(40); ok('PC mostra escolha MP4/WebM', !!sheet().querySelector('[data-as-opt=webm]'));
      click(sheet().querySelector('[data-as-opt=webm]')); await wait(40); ok('PC 4K em WebM', /nexusreel-wallpaper-pc-4k-.+\.webm/.test(await gen()));
    });
    await step('central do carro', async () => {
      click(sheet().querySelector('[data-as=car]')); await wait(40);
      ok('6 opções de marca e aviso de H.264 Baseline + carro parado', all('#as-opts [data-as-opt]').length === 6 && /H\.264 Baseline/.test(d.querySelector('#as-hint').textContent) && /carro parado/.test(d.querySelector('#as-hint').textContent));
      click(sheet().querySelector('[data-as-opt=toyota]')); await wait(40); ok('Toyota → MP4', /nexusreel-car-toyota-.+\.mp4/.test(await gen()));
    });
    await step('protetor de tela', async () => {
      click(sheet().querySelector('[data-as=screensaver]')); await wait(40);
      ok('explica que nada é instalado', /Nada é instalado|não se instala|Nothing gets installed/i.test(d.querySelector('#as-hint').textContent));
      ok('Windows → pacote .zip', /nexusreel-screensaver-windows-.+\.zip/.test(await gen()));
      ok('lista os gerados deste vídeo', all('#as-list [data-asset]').length === 5);
      ok('aviso de 30 dias e nome sem título', /30 dias/.test(sheet().textContent));
    });
    await step('fechar e desligar', async () => {
      click(d.querySelector('#as-sheet [aria-label=Fechar]')); await wait(200); ok('fechar volta ao player', !sheet() && !!d.querySelector('#assets-open'));
      await closeAll(); await debugFlag('ff_assets', false); await openPlayer(); ok('OFF de novo: botão some', !d.querySelector('#assets-open')); await closeAll();
    });
    await step('i18n, regras e acessibilidade', async () => {
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 6 (assets): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("(as\.[a-z._]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.'));
      used.push(...['gif', 'sticker', 'wallpaper', 'car', 'screensaver'].map((x) => 'as.type.' + x), ...['gif', 'sticker', 'live', 'android', 'pc', 'car', 'ss'].map((x) => 'as.hint.' + x));
      ok('todas as chaves as.* têm pt-BR, en e es, e toda chave usada existe', Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]));
      const cfg = vm.runInNewContext(snippet('function asConfig(t, o) {', '\n}') + '; [asConfig("gif", { dur: 60 }), asConfig("wallpaper", { wall: "iphone_live" }), asConfig("wallpaper", { wall: "pc_4k", fmt: "webm" })]');
      ok('normalização igual à do backend (GIF ≤10 s; Live Photo 3 s em zip; PC WebM)', cfg[0].durationSec === 10 && cfg[1].format === 'live_zip' && cfg[1].durationSec === 3 && cfg[2].format === 'webm');
      ok('chave do cache inclui o usuário', /const key = JSON\.stringify\(\[state\.user\.id, p\.id, c\]\)/.test(SRC));
      ok('alvos de toque ≥ 44 px (tipos com 72 px)', /\.as-type\{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:72px/.test(SRC));
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
