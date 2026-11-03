// Módulo 5 — Salvamento no protótipo: flag OFF = app igual a antes; ON: folha "Salvar em…", nuvens com escopo mínimo,
// Nuvem NexusReel com retenção por plano, revogação (também com a flag desligada) e ZIP por produto no B2B.
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
  const debugLog = async () => { await openDebug(0); const t = d.querySelector('#debug-ov').textContent; await closeDebug(); return t; };
  const library = async () => { click(tabs()[2]); await wait(900); };
  const openPlayer = async () => { await library(); click(all('.grid3 .thumb')[0]); await until(() => d.querySelector('.overlay'), 3000, 'player'); await wait(150); };
  const closeAll = async () => { for (let i = 0; i < 3 && (d.querySelector('.sheet') || d.querySelector('.overlay')); i++) { const c = d.querySelector('.sheet [aria-label=Fechar]') || all('.top .iconbtn', d.querySelector('.overlay')).pop(); click(c); await wait(200); } };
  const privacy = async () => { click(tabs()[4]); await wait(250); click(btn('Configurações e privacidade')); await wait(300); click(all('#settings-ov .card.row.tap').find((b) => /Privacidade/.test(b.textContent))); await wait(250); };
  const sheet = () => d.querySelector('#sv-sheet');
  try {
    await h.onboard();
    await step('flag OFF', async () => {
      await openPlayer();
      ok('OFF: player sem "Salvar em…"', !d.querySelector('#save-open') && !!btn('Publicar este vídeo'));
      await closeAll(); await privacy();
      ok('OFF: Privacidade sem "Nuvens conectadas"', !d.querySelector('#cloud-conns'));
      await closeAll();
    });
    await step('ligar ff_save e abrir a folha', async () => {
      await debugFlag('ff_save', true); await openPlayer();
      ok('ON: player com "Salvar em…"', !!d.querySelector('#save-open'));
      click(d.querySelector('#save-open')); await until(() => sheet(), 3000, 'sheet');
      ok('7 destinos: galeria, pasta, iCloud, Drive, Dropbox, OneDrive, Nuvem NexusReel', ['device', 'local_folder', 'icloud', 'google_drive', 'dropbox', 'onedrive', 'nexus_cloud'].every((k) => sheet().querySelector(`[data-sv=${k}]`)));
      ok('avisa que o original não muda e mostra o nome do arquivo', /\.mp4 · o original não muda/.test(sheet().textContent));
      ok('pasta no computador explica o que acontece sem a File System Access API', /pasta de downloads/.test(sheet().querySelector('[data-sv=local_folder]').textContent));
      ok('iCloud explica o caminho do iPhone', /Compartilhar → Salvar em Arquivos/.test(sheet().querySelector('[data-sv=icloud]').textContent));
    });
    await step('aparelho', async () => {
      click(sheet().querySelector('[data-sv=device]')); await wait(120);
      ok('galeria: instrução de "Salvar vídeo"', /Salvar vídeo/.test(text()));
    });
    await step('Google Drive: consentimento com escopo mínimo → conecta → salva', async () => {
      click(sheet().querySelector('[data-sv=google_drive]')); await until(() => d.querySelector('#sv-consent'), 2000, 'consent');
      const c = d.querySelector('#sv-consent').textContent;
      ok('consentimento diz o escopo (drive.file), "nunca o Drive inteiro" e que desconectar apaga as chaves', /drive\.file/.test(c) && /Nunca pedimos acesso ao seu Google Drive inteiro/.test(c) && /chaves de acesso são apagadas/.test(c));
      click(d.querySelector('#sv-consent-cancel')); await wait(80); ok('"Agora não" volta sem conectar', !d.querySelector('#sv-consent') && /Conectar/.test(sheet().querySelector('[data-sv=google_drive]').textContent));
      click(sheet().querySelector('[data-sv=google_drive]')); await wait(60); click(d.querySelector('#sv-consent-ok'));
      await until(() => d.querySelector('#sv-status'), 3000, 'status'); ok('progresso visível (role=status)', d.querySelector('#sv-status').getAttribute('role') === 'status');
      await until(() => d.querySelector('#sv-open'), 4000, 'pronto');
      ok('salvo no Google Drive com link para abrir (nova aba, sem opener)', /Salvo em Google Drive/.test(d.querySelector('#sv-status').textContent) && /mock\.google_drive\.example\/NexusReel\//.test(d.querySelector('#sv-open').href) && d.querySelector('#sv-open').rel.includes('noopener'));
      ok('Drive agora mostra "Salvar" (conectado)', /Salvar/.test(sheet().querySelector('[data-sv=google_drive] .pill2').textContent));
    });
    await step('Nuvem NexusReel', async () => {
      ok('retenção do plano Free explicada (90 dias; 365 no Pro) e cota', /90 dias no plano Free \(365 dias no Pro\)/.test(d.querySelector('#sv-nexus').textContent) && /^0 MB de 2 GB usados/.test(d.querySelector('#sv-quota').textContent));
      click(sheet().querySelector('[data-sv=nexus_cloud]')); await until(() => d.querySelector('#sv-nexus-list'), 4000, 'nexus');
      ok('item guardado com data de validade', /guardado até/.test(d.querySelector('#sv-nexus-list').textContent) && all('#sv-nexus-list [data-del]').length === 1);
      click(d.querySelector('#sv-nexus-list [data-del]')); await wait(120); ok('apagar antes do prazo', !d.querySelector('#sv-nexus-list'));
    });
    await step('fechar volta ao player', async () => {
      click(d.querySelector('#sv-sheet [aria-label=Fechar]')); await wait(200);
      ok('fechar a folha volta ao player', !sheet() && !!d.querySelector('#save-open'));
      await closeAll();
    });
    await step('revogar em Privacidade', async () => {
      await privacy();
      const card = d.querySelector('#cloud-conns'); ok('Privacidade lista o Google Drive com o escopo', !!card && /Google Drive/.test(card.textContent) && /drive\.file/.test(card.textContent));
      click(card.querySelector('[data-revoke=google_drive]')); await wait(150);
      ok('desconectar remove a conexão e avisa que as chaves foram apagadas', !d.querySelector('#cloud-conns') && /chaves de acesso apagadas/.test(text()));
      await closeAll();
      const lg = await debugLog(); ok('log registra cloud.connect, save.done e cloud.revoke (sem token)', /cloud\.connect/.test(lg) && /save\.done/.test(lg) && /cloud\.revoke/.test(lg) && !/token|secret|Bearer/i.test(lg.match(/cloud\.[a-z]+[^\n]{0,200}/g).join(' ')));
    });
    await step('LGPD: revogar com a flag desligada', async () => {
      await openPlayer(); click(d.querySelector('#save-open')); await until(() => sheet(), 3000);
      click(sheet().querySelector('[data-sv=onedrive]')); await wait(60); click(d.querySelector('#sv-consent-ok')); await until(() => d.querySelector('#sv-open'), 4000, 'onedrive');
      await closeAll(); await closeAll();
      await debugFlag('ff_save', false); await privacy();
      const card = d.querySelector('#cloud-conns');
      ok('flag OFF: a conexão existente continua visível para revogar, com o aviso da Microsoft', !!card && /OneDrive/.test(card.textContent) && /account\.live\.com/.test(card.textContent));
      click(card.querySelector('[data-revoke=onedrive]')); await wait(150); ok('revogada com a flag desligada', !d.querySelector('#cloud-conns'));
      await closeAll(); await openPlayer(); ok('flag OFF: player volta a não ter "Salvar em…"', !d.querySelector('#save-open')); await closeAll();
    });
    await step('B2B: ZIP por produto', async () => {
      await debugFlag('ff_save', true);
      click(tabs()[4]); await wait(200); click(btn('Modo Business')); await wait(250); click(btn('Ativar Business')); await wait(250);
      click(btn('Catálogos', d.querySelector('.seg'))); await wait(150); click(btn('Criar catálogo')); await wait(150);
      type(d.querySelector('#cw-name'), 'Loja Esportes Verão'); await wait(80); click(btn('Continuar')); await wait(100);
      click(btn('Usar CSV de exemplo')); await wait(150); click(btn('Continuar')); await wait(100); click(btn('Continuar')); await wait(100);
      click(btn('Gerar vídeos em lote')); await until(() => text().replace(/ /g, ' ').includes('4 ok · 1 falhas'), 40000, 'lote');
      ok('ON: catálogo troca "Baixar todos" por "Exportar ZIP por produto"', !!d.querySelector('#zip-open') && !btn('Baixar todos'));
      click(d.querySelector('#zip-open')); await until(() => d.querySelector('#zip-sheet'), 2000, 'zip');
      ok('conta 4 produtos prontos e avisa 1 sem vídeo', /4 produto\(s\) com vídeo pronto/.test(d.querySelector('#zip-count').textContent) && /1 sem vídeo pronto/.test(d.querySelector('#zip-skip').textContent));
      ok('explica o conteúdo do ZIP (vídeo + ficha.json + legenda.txt)', /ficha\.json/.test(d.querySelector('#zip-sheet').textContent) && /legenda\.txt/.test(d.querySelector('#zip-sheet').textContent));
      click(d.querySelector('[data-zd=nexus_cloud]')); await wait(60); ok('destino escolhido (radio)', d.querySelector('[data-zd=nexus_cloud]').getAttribute('aria-checked') === 'true');
      click(d.querySelector('#zip-go')); await until(() => d.querySelector('#zip-done'), 4000, 'zip pronto');
      const names = all('#zip-done [data-zip]').map((r) => r.textContent);
      ok('4 ZIPs, um por produto, com nome catálogo-SKU', names.length === 4 && names.every((n) => /^Loja Esportes Verao-.+\.zip/.test(n.trim())));
      ok('tudo salvo na Nuvem NexusReel', /Tudo salvo em Nuvem NexusReel/.test(d.querySelector('#zip-done').textContent));
      click(d.querySelector('#zip-sheet [aria-label=Fechar]')); await wait(150);
      await closeAll(); await debugFlag('ff_save', false);
      click(tabs()[4]); await wait(200); click(btn('Modo Business')); await wait(300); click(btn('Catálogos', d.querySelector('.seg'))); await wait(150);
      click(btn('Loja Esportes Verão')); await wait(200);
      ok('OFF: catálogo volta a "Baixar todos" (sem ZIP por produto)', !!btn('Baixar todos') && !d.querySelector('#zip-open'));
      await closeAll();
    });
    await step('i18n, acessibilidade e LGPD', async () => {
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 5 (salvamento): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("(sv\.[a-z._]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.'));
      used.push(...['device', 'local_folder', 'icloud', 'nexus_cloud'].map((x) => 'sv.dest.' + x));
      ok('todas as chaves sv.* têm pt-BR, en e es, e toda chave usada existe', Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]) && used.length > 40);
      ok('alvos de toque ≥ 44 px (opções com 56 px)', /\.sv-opt\{display:flex;align-items:center;gap:12px;min-height:56px/.test(SRC));
      ok('o cliente nunca guarda token de nuvem (só data e escopo)', !/cloud: \{[^}]*token/i.test(snippet('function SaveSheet', '\nfunction CloudConnections')));
      ok('exportação LGPD só ganha campos quando há conexão/salvamento', /Object\.keys\(s\.cloud \|\| \{\}\)\.length \? \{ cloudConnections/.test(SRC));
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
