// Módulo 8 — Colaboração + Timeline no protótipo: flags OFF = player igual; ON: trilhas montadas das cenas, edição por papel
// (leitor não edita), last-write-wins, conflito crítico com fork, versões/restaurar, presença/cursor, convite e comentários no tempo.
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
  const clips = (k) => all(`[data-track=${k}] [data-clip]`);
  const role = async (r) => { click(d.querySelector(`[data-role=${r}]`)); await wait(60); };
  try {
    await h.onboard();
    await step('flags OFF', async () => { await openPlayer(); ok('OFF: player sem "Editar em equipe"', !d.querySelector('#cl-open')); await closeAll(); });
    await step('ligar e abrir', async () => {
      await debugFlag('ff_timeline', true); await debugFlag('ff_collaboration', true); await openPlayer();
      ok('ON: botão no player', !!d.querySelector('#cl-open')); click(d.querySelector('#cl-open')); await until(() => d.querySelector('#cl-ov'), 3000, 'ov');
      ok('4 trilhas (vídeo, áudio, legendas, efeitos) montadas das cenas', ['video', 'audio', 'text', 'effect'].every((k) => d.querySelector(`[data-track=${k}]`)) && clips('video').length >= 3 && clips('text').length >= 1);
      await until(() => d.querySelectorAll('.cl-av.on').length === 2 && d.querySelector('.tl-cursor'), 3000, 'presença');
      ok('presença: 2 online e cursor da colega na trilha', /2 online agora/.test(d.querySelector('#cl-online').textContent) && !!d.querySelector('.tl-cursor'));
      ok('barra de pessoas com dono, editor e leitor', ['owner', 'editor', 'viewer'].every((r) => d.querySelector(`[data-member=${r}]`)));
    });
    await step('editar como dono', async () => {
      const first = clips('video')[0].getAttribute('aria-label'); click(clips('video')[0]); await wait(40);
      ok('selecionar trecho mostra as ferramentas', !!d.querySelector('#tl-tools'));
      click(d.querySelector('#tl-right')); await wait(80); ok('mover troca a ordem dos trechos do vídeo', clips('video')[1].getAttribute('aria-label').startsWith(first.split(' · ')[0]) && clips('video')[0].getAttribute('aria-label').endsWith('0:00'));
      click(d.querySelector('[data-mute=audio]')); await wait(40); ok('silenciar trilha', d.querySelector('[data-mute=audio]').getAttribute('aria-pressed') === 'true');
      click(d.querySelector('[data-add-track=text]')); await wait(40); ok('adicionar trilha de texto', all('[data-track=text]').length === 2);
      click(d.querySelector('[data-lock=effect]')); await wait(40); ok('travar trilha', d.querySelector('[data-lock=effect]').getAttribute('aria-pressed') === 'true');
    });
    await step('leitor não edita', async () => {
      await role('viewer'); ok('como leitor: aviso e botões de edição desligados', !!d.querySelector('#tl-readonly') && d.querySelector('[data-mute=video]').disabled && !d.querySelector('[data-add-track]') && !d.querySelector('#cl-invite'));
      click(clips('video')[0]); await wait(40); ok('ferramentas do trecho desligadas para o leitor', d.querySelector('#tl-left').disabled && d.querySelector('#tl-delete').disabled);
      ok('leitor ainda comenta', !!d.querySelector('#cl-comment'));
      await role('owner');
    });
    await step('conflito crítico e fork', async () => {
      const n0 = clips('video').length; click(clips('video')[2]); await wait(40); click(d.querySelector('#tl-sim')); await wait(40);
      click(d.querySelector('#tl-left')); await until(() => d.querySelector('#tl-conflict'), 2000, 'conflito');
      ok('conflito: explica e oferece salvar minha versão ou ver a atual', /Nada do que você fez se perdeu/.test(d.querySelector('#tl-conflict').textContent) && !!d.querySelector('#tl-fork') && !!d.querySelector('#tl-reload'));
      click(d.querySelector('#tl-fork')); await wait(80); click(d.querySelector('#tl-versions')); await wait(40);
      ok('fork aparece em Versões', !!d.querySelector('[data-version=fork]'));
      await until(() => clips('video').length === n0 - 1, 3000, 'remoto chegou'); ok('a mudança da colega chega à tela', clips('video').length === n0 - 1);
      click(d.querySelector('[data-restore=fork]')); await wait(80); ok('restaurar o fork traz o trecho de volta', clips('video').length === n0);
      click(d.querySelector('#tl-versions')); await wait(40); ok('"Antes de restaurar" fica no histórico (dá para desfazer)', !!d.querySelector('[data-version=restore]'));
    });
    await step('editor salva versão', async () => {
      await role('editor'); ok('editor não convida', !d.querySelector('#cl-invite')); if (!d.querySelector('#tl-ver-list')) { click(d.querySelector('#tl-versions')); await wait(40); }
      click(d.querySelector('#tl-save-ver')); await wait(40); ok('editor salva versão', !!d.querySelector('[data-version=manual]'));
      await role('owner');
    });
    await step('comentários no tempo', async () => {
      const r = d.querySelector('#tl-play'); Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(r, '9500'); r.dispatchEvent(new w.Event('input', { bubbles: true })); await wait(40);
      ok('posição exibida', /Posição: 0:10/.test(text()));
      type(d.querySelector('#cl-comment'), 'O câmbio aparece rápido demais'); await wait(30); click(d.querySelector('#cl-comment-send')); await wait(60);
      ok('comentário ancorado em 0:10', /0:10/.test(d.querySelector('[data-comment=open] [data-seek]').textContent) && /câmbio/.test(d.querySelector('#cl-comments').textContent));
      await role('viewer'); ok('leitor não resolve', !d.querySelector('[data-resolve]')); await role('owner');
      click(d.querySelector('[data-resolve]')); await wait(40); ok('dono resolve', !!d.querySelector('[data-comment=resolved]'));
      click(d.querySelector('[data-seek]')); await wait(40); ok('tocar no horário leva a posição até ele', /Posição: 0:10/.test(text()));
    });
    await step('convite', async () => {
      click(d.querySelector('#cl-invite')); await until(() => d.querySelector('#cl-invite-sheet'), 2000);
      ok('regras do convite (7 dias, só esse e-mail, uma vez)', /7 dias, só para esse e-mail e uma vez/.test(d.querySelector('#cl-invite-sheet').textContent));
      type(d.querySelector('#cl-email'), 'x@mailinator.com'); await wait(30); click(d.querySelector('#cl-invite-send')); await wait(60); ok('descartável recusado', !!d.querySelector('#cl-invite-sheet'));
      type(d.querySelector('#cl-email'), 'dani@estudio.com.br'); click(d.querySelector('[data-invite-role=viewer]')); await wait(30); click(d.querySelector('#cl-invite-send')); await wait(60);
      ok('convite enviado e fechado', !d.querySelector('#cl-invite-sheet') && /Convite enviado/.test(text()));
    });
    await step('só colaboração (sem timeline) e desligar', async () => {
      await closeAll(); await closeAll(); await debugFlag('ff_timeline', false); await openPlayer(); click(d.querySelector('#cl-open')); await until(() => d.querySelector('#cl-ov'), 2000);
      ok('sem ff_timeline: equipe e comentários, sem trilhas', !d.querySelector('#tl-editor') && !!d.querySelector('#cl-comments'));
      await closeAll(); await closeAll(); await debugFlag('ff_collaboration', false); await openPlayer(); ok('OFF de novo: botão some', !d.querySelector('#cl-open')); await closeAll();
    });
    await step('i18n, matriz e regras', async () => {
      const keyed = vm.runInNewContext('const I18N5 = { keyed: {} }; ' + snippet('/* Módulo 8 (colaboração): textos em pt-BR, en e es. */', '});') + ' I18N5.keyed');
      const used = [...new Set([...SRC.matchAll(/tr\("(cl\.[a-z._]+)"/g)].map((m) => m[1]))].filter((k) => !k.endsWith('.'));
      used.push(...['owner', 'editor', 'viewer'].map((r) => 'cl.role.' + r), ...['text', 'effect', 'audio'].map((k) => 'cl.track.' + k), ...['forbidden_role', 'track_locked', 'invalid_op'].map((k) => 'cl.err.' + k));
      ok('todas as chaves cl.* têm pt-BR, en e es, e toda chave usada existe', Object.values(keyed).every((v) => v['pt-BR'] && v.en && v.es) && used.every((k) => keyed[k]));
      const m = vm.runInNewContext(snippet('const CL_MATRIX =', ';\n') + ' CL_MATRIX');
      ok('matriz da UI igual à do servidor (editar: dono/editor; convidar/remover: dono; comentar: todos)', JSON.stringify(m['timeline.edit']) === '["owner","editor"]' && JSON.stringify(m['collaborator.invite']) === '["owner"]' && JSON.stringify(m['collaborator.remove']) === '["owner"]' && m['comment.create'].length === 3);
      const r = vm.runInNewContext(snippet('const clClone =', ';\n') + snippet('function cl8Apply(doc, role, op) {', '\n}') + `; const D = { rev: 0, tracks: [{ id: "t", kind: "video", locked: false, version: 1, clips: [{ id: "a", startMs: 0, durationMs: 1000, version: 2 }, { id: "b", startMs: 1000, durationMs: 1000, version: 1 }] }] };
        const CL_MATRIX = { "timeline.edit": ["owner", "editor"] }; const clCan = (r, a) => (CL_MATRIX[a] || []).includes(r); const nowISO = () => ""; const uid = () => "x";
        [cl8Apply(D, "viewer", { kind: "removeClip", clipId: "a", baseVersion: 2 }).error.status, cl8Apply(D, "editor", { kind: "removeClip", clipId: "a", baseVersion: 1 }).error.status, cl8Apply(D, "editor", { kind: "updateClip", clipId: "a", baseVersion: 1, patch: { durationMs: 500 } }).conflict]`);
      ok('"servidor" do protótipo: leitor 403, estrutural velho 409, propriedade velha = last-write-wins', JSON.stringify(r) === '[403,409,"lww"]');
      ok('alvos de toque: trechos 36 px, botões de trilha 32 px', /\.tl-lane\{position:relative;height:44px/.test(SRC) && /\.tl-tog\{min-width:32px;min-height:32px/.test(SRC));
      ok('sem erros/avisos no console', errors.length === 0);
    });
  } catch (e) { log.push('EXC ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
  console.log(log.join('\n')); console.log('ERRORS', errors.length, errors.slice(0, 6).join('\n')); process.exit(0);
})();
