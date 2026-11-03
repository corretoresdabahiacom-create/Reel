import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';
import { app, boot, shutdown, http, signup, auth, waitFor, pool, type Session } from './helpers.js';
import { asSystem } from '../src/db/pool.js';
import { env } from '../src/config/env.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { getQueue, Q } from '../src/queues/index.js';
import { emailHash } from '../src/modules/emails/email.service.js';
import { MATRIX } from '../src/modules/collaboration/permissions.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';

/**
 * Módulo 8 — Colaboração + Timeline (Postgres/Redis reais, WebSocket real numa porta local).
 * Checkpoint 8: viewer tentando editar PELO WEBSOCKET é bloqueado no servidor; a matriz de permissões está implementada e documentada.
 */
let owner: Session, editor: Session, viewer: Session, outsider: Session; let pid = ''; let port = 0;
const setFlags = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key IN ('ff_collaboration','ff_timeline')`, [on, on ? 100 : 0])); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `co-${randomUUID()}` });
type Msg = Record<string, any>;
async function sock(s: Session, projectId: string, o: { query?: boolean; ticket?: string; auth?: boolean } = {}) {
  const ticket = o.ticket ?? (await http.post('/api/v1/collab/ws-ticket').set(auth(s)).send({ projectId })).body.ticket as string;
  const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/collab/ws${o.query ? `?token=${encodeURIComponent(ticket)}` : ''}`);
  const msgs: Msg[] = []; const state: { closed: { code: number; reason: string } | null } = { closed: null };
  ws.on('message', (d) => msgs.push(JSON.parse(d.toString())));
  const closed = new Promise<{ code: number; reason: string }>((r) => ws.on('close', (code, reason) => { state.closed = { code, reason: reason.toString() }; r(state.closed); }));
  await new Promise((ok, ko) => { ws.once('open', ok); ws.once('error', ko); });
  const c = { ws, msgs, closed, state, ticket, send: (m: Msg) => ws.send(JSON.stringify(m)), wait: (pred: (m: Msg) => boolean, ms = 6000) => waitFor(async () => msgs.find(pred), ms, 15) };
  if (o.auth !== false && !o.query) { c.send({ type: 'auth', token: ticket }); await c.wait((m) => m.type === 'ready' || m.type === 'rejected'); }
  return c;
}
const tl = async (s: Session) => (await http.get(`/api/v1/projects/${pid}/timeline`).set(auth(s))).body;
const op = (s: Session, o: Msg) => http.post(`/api/v1/projects/${pid}/timeline/ops`).set(auth(s)).send({ op: o });
const inviteTok = (link: string) => decodeURIComponent(link.split('token=')[1]!);

beforeAll(async () => {
  await boot(); await app.listen({ port: 0, host: '127.0.0.1' }); port = (app.server.address() as { port: number }).port;
  owner = await signup({ plan: 'pro', credits: 10 }); editor = await signup({ plan: 'pro', credits: 10 }); viewer = await signup({ plan: 'free', credits: 10 }); outsider = await signup({ plan: 'pro', credits: 10 });
  pid = (await asSystem((db) => db.query(`INSERT INTO projects (user_id, title, script, status, duration_sec, final_video_url) VALUES ($1,'Bike Aro 29','Roteiro','ready',24,'projects/x/final.mp4') RETURNING id`, [owner.id]))).rows[0].id;
  for (const [i, t] of ['Abertura com a bike', 'Detalhe do câmbio', 'Preço e chamada'].entries()) await asSystem((db) => db.query(`INSERT INTO scenes (project_id, index, text, duration_sec, status) VALUES ($1,$2,$3,8,'done')`, [pid, i, t]));
}, 60_000);
afterAll(async () => { await setFlags(false); await shutdown(); });

describe('Módulo 8 — matriz de permissões', () => {
  it('a tabela de docs/modules/COLLABORATION.md é igual à MATRIX do código', () => {
    const doc = readFileSync('docs/modules/COLLABORATION.md', 'utf8'); const block = doc.split('<!-- matriz:inicio -->')[1]!.split('<!-- matriz:fim -->')[0]!;
    const rows = block.trim().split('\n').slice(2).map((l) => l.split('|').map((x) => x.trim()).filter(Boolean));
    const fromDoc = Object.fromEntries(rows.map((r) => [r[0]!.match(/`([a-z_.]+)`/)![1], ['owner', 'editor', 'viewer'].filter((_, i) => r[i + 1] === '✅')]));
    expect(fromDoc).toEqual(Object.fromEntries(Object.entries(MATRIX).map(([k, v]) => [k, [...v]])));
    for (const k of ['timeline.edit', 'comment.create', 'collaborator.invite', 'collaborator.remove', 'project.delete']) expect(fromDoc).toHaveProperty([k]); // as 5 linhas exigidas pelo spec
  });
});

describe('Módulo 8 — flags desligadas = modo de um usuário só', () => {
  it('rotas 404, socket recusa, projeto igual', async () => {
    await setFlags(false);
    const before = (await http.get(`/api/v1/projects/${pid}`).set(auth(owner))).body;
    for (const c of [() => http.get(`/api/v1/projects/${pid}/timeline`), () => http.get(`/api/v1/projects/${pid}/collaborators`), () => http.get(`/api/v1/projects/${pid}/comments`), () => http.post('/api/v1/collab/ws-ticket').send({ projectId: pid }),
      () => http.post(`/api/v1/projects/${pid}/collaborators`).set(idem()).send({ email: 'x@exemplo.com', role: 'editor' }), () => http.get('/api/v1/collab/projects')]) {
      const r = await c().set(auth(owner)); expect(r.status).toBe(404); expect(r.body.code).toBe('not_found');
    }
    const s = await sock(owner, pid, { ticket: 'qualquer', auth: false }); s.send({ type: 'auth', token: 'qualquer' }); expect((await s.closed).code).toBe(4401);
    const after = (await http.get(`/api/v1/projects/${pid}`).set(auth(owner))).body; const nosig = (o: { finalVideoUrl?: string }) => ({ ...o, finalVideoUrl: o.finalVideoUrl?.split('?')[0] });
    expect(nosig(after)).toEqual(nosig(before));
    expect((await pool.query('SELECT (SELECT count(*) FROM timeline_tracks WHERE project_id=$1)::int + (SELECT count(*) FROM project_collaborators WHERE project_id=$1)::int AS n', [pid])).rows[0].n).toBe(0);
  });
});

describe('Módulo 8 — com as flags LIGADAS', () => {
  beforeAll(async () => { await setFlags(true); });
  const S: Record<string, Awaited<ReturnType<typeof sock>>> = {};

  it('convidar 2 colaboradores: token de 7 dias, preso ao e-mail, uso único; só o dono convida', async () => {
    const ie = await http.post(`/api/v1/projects/${pid}/collaborators`).set(auth(owner)).set(idem()).send({ email: editor.email, role: 'editor' });
    const iv = await http.post(`/api/v1/projects/${pid}/collaborators`).set(auth(owner)).set(idem()).send({ email: viewer.email, role: 'viewer' });
    expect(ie.status).toBe(201); expect(iv.status).toBe(201);
    const days = (new Date(ie.body.expiresAt).getTime() - Date.now()) / 86400_000; expect(days).toBeGreaterThan(6.99); expect(days).toBeLessThanOrEqual(7);
    const row = (await pool.query('SELECT * FROM project_collaborators WHERE id=$1', [ie.body.inviteId])).rows[0];
    expect(row.invited_email_hash).toBe(emailHash(editor.email)); expect(JSON.stringify(row)).not.toContain('@'); expect(row.token_hash).toMatch(/^[0-9a-f]{64}$/);
    const jobs = (await getQueue(Q.emails).getJobs(['completed', 'waiting', 'active', 'delayed'])).filter((j) => j.name === 'collab-invite').map((j) => j.data.data); // (os e-mails de boas-vindas do cadastro são outro fluxo)
    expect(jobs.length).toBeGreaterThanOrEqual(2); expect(JSON.stringify(jobs)).not.toContain(editor.email); expect(jobs.every((j) => typeof j.toEnc === 'string' && !j.to && j.logAs === 'hash')).toBe(true);
    // link encaminhado para outra conta não serve
    expect((await http.post('/api/v1/collab/invites/accept').set(auth(outsider)).send({ token: inviteTok(ie.body.link) })).status).toBe(403);
    const ok = await http.post('/api/v1/collab/invites/accept').set(auth(editor)).send({ token: inviteTok(ie.body.link) }); expect(ok.status).toBe(200); expect(ok.body).toEqual({ projectId: pid, role: 'editor' });
    expect((await http.post('/api/v1/collab/invites/accept').set(auth(editor)).send({ token: inviteTok(ie.body.link) })).status).toBe(404); // uso único
    expect((await pool.query('SELECT token_hash FROM project_collaborators WHERE id=$1', [ie.body.inviteId])).rows[0].token_hash).toBeNull();
    expect((await http.post('/api/v1/collab/invites/accept').set(auth(viewer)).send({ token: inviteTok(iv.body.link) })).status).toBe(200);
    // validade e regras
    const ix = await http.post(`/api/v1/projects/${pid}/collaborators`).set(auth(owner)).set(idem()).send({ email: outsider.email, role: 'viewer' });
    await pool.query(`UPDATE project_collaborators SET expires_at = now() - interval '1 minute' WHERE id=$1`, [ix.body.inviteId]);
    expect((await http.post('/api/v1/collab/invites/accept').set(auth(outsider)).send({ token: inviteTok(ix.body.link) })).status).toBe(404);
    expect((await http.post(`/api/v1/projects/${pid}/collaborators`).set(auth(owner)).set(idem()).send({ email: owner.email, role: 'editor' })).status).toBe(422);
    expect((await http.post(`/api/v1/projects/${pid}/collaborators`).set(auth(owner)).set(idem()).send({ email: 'a@mailinator.com', role: 'editor' })).status).toBe(422);
    expect((await http.post(`/api/v1/projects/${pid}/collaborators`).set(auth(owner)).set(idem()).send({ email: editor.email, role: 'viewer' })).status).toBe(409);
    const byEditor = await http.post(`/api/v1/projects/${pid}/collaborators`).set(auth(editor)).set(idem()).send({ email: 'novo@exemplo.com', role: 'viewer' }); expect(byEditor.status).toBe(403); expect(byEditor.body.code).toBe('forbidden_role');
    const list = (await http.get(`/api/v1/projects/${pid}/collaborators`).set(auth(viewer))).body; expect(list.members.map((m: { role: string }) => m.role)).toEqual(['owner', 'editor', 'viewer']); expect(list.pendingInvites).toEqual([]);
    expect(JSON.stringify(list)).not.toContain('@');
    expect((await http.get('/api/v1/collab/projects').set(auth(editor))).body.items).toEqual([expect.objectContaining({ projectId: pid, role: 'editor', title: 'Bike Aro 29' })]);
    expect((await http.get(`/api/v1/projects/${pid}/timeline`).set(auth(outsider))).status).toBe(404); // sem papel = 404
  });

  it('timeline multi-track montado das cenas (vídeo, áudio, legendas, efeitos)', async () => {
    const t = await tl(viewer);
    expect(t.role).toBe('viewer'); expect(t.tracks.map((x: { kind: string }) => x.kind)).toEqual(['video', 'audio', 'text', 'effect']);
    expect(t.tracks[0].clips.map((c: { startMs: number; durationMs: number }) => [c.startMs, c.durationMs])).toEqual([[0, 8000], [8000, 8000], [16000, 8000]]);
    expect(t.tracks[2].clips.map((c: { props: { text: string } }) => c.props.text)).toEqual(['Abertura com a bike', 'Detalhe do câmbio', 'Preço e chamada']);
    expect(t.durationMs).toBe(24000);
  });

  it('tempo real: 3 pessoas na sala, presença, a edição do editor chega ao dono e ao viewer; cursor e comentário ancorado', async () => {
    S.owner = await sock(owner, pid); S.editor = await sock(editor, pid); S.viewer = await sock(viewer, pid);
    expect(S.owner.msgs[0]).toMatchObject({ type: 'ready', role: 'owner' }); expect(S.editor.msgs[0]).toMatchObject({ type: 'ready', role: 'editor' }); expect(S.viewer.msgs[0]).toMatchObject({ type: 'ready', role: 'viewer' });
    await S.owner.wait((m) => m.type === 'presence' && m.event === 'join' && m.user.userId === viewer.id);
    expect(S.viewer.msgs[0].presence.map((p: { role: string }) => p.role).sort()).toEqual(['editor', 'owner', 'viewer']);
    const t = await tl(editor); const clip = t.tracks[0].clips[0];
    S.editor.send({ type: 'op', id: 'e1', op: { kind: 'updateClip', clipId: clip.id, baseVersion: clip.version, patch: { props: { label: 'Abertura (nova)' } } } });
    const ack = await S.editor.wait((m) => m.type === 'ack' && m.id === 'e1'); expect(ack.conflict).toBeNull();
    for (const s of [S.owner, S.viewer]) { const ev = await s.wait((m) => m.type === 'op' && m.rev === ack.rev); expect(ev.by.userId).toBe(editor.id); expect(ev.entity.props.label).toBe('Abertura (nova)'); }
    S.editor.send({ type: 'cursor', timeMs: 9500 });
    expect((await S.owner.wait((m) => m.type === 'cursor')).timeMs).toBe(9500); await S.viewer.wait((m) => m.type === 'cursor'); expect(S.editor.msgs.some((m) => m.type === 'cursor')).toBe(false);
    S.viewer.send({ type: 'comment', id: 'v1', timeMs: 9500, clipId: t.tracks[0].clips[1].id, body: 'Aqui o câmbio aparece rápido demais' });
    await S.viewer.wait((m) => m.type === 'ack' && m.id === 'v1');
    const ce = await S.owner.wait((m) => m.type === 'comment' && m.event === 'created'); expect(ce.comment).toMatchObject({ timeMs: 9500, clipId: t.tracks[0].clips[1].id, authorId: viewer.id });
  });

  it('VIEWER NÃO EDITA PELO WEBSOCKET: o servidor recusa (403), não grava e ninguém recebe a operação', async () => {
    const before = await tl(owner); const clip = before.tracks[0].clips[2]; const ops0 = (await pool.query('SELECT count(*)::int n FROM timeline_ops WHERE project_id=$1', [pid])).rows[0].n;
    const evilOps = [{ kind: 'removeClip', clipId: clip.id, baseVersion: clip.version }, { kind: 'updateClip', clipId: clip.id, baseVersion: clip.version, patch: { durationMs: 100 } },
      { kind: 'addTrack', trackKind: 'effect' }, { kind: 'setTrackProperty', trackId: before.tracks[0].id, baseVersion: before.tracks[0].version, prop: 'muted', value: true }];
    for (const [i, o] of evilOps.entries()) {
      S.viewer.send({ type: 'op', id: `v-evil-${i}`, op: o });
      const r = await S.viewer.wait((m) => m.id === `v-evil-${i}`); expect(r).toMatchObject({ type: 'rejected', status: 403, code: 'forbidden_role' }); expect(r.details).toEqual({ role: 'viewer', action: 'timeline.edit' });
    }
    const after = await tl(owner); expect(after.rev).toBe(before.rev); expect(after.tracks).toEqual(before.tracks);
    expect((await pool.query('SELECT count(*)::int n FROM timeline_ops WHERE project_id=$1', [pid])).rows[0].n).toBe(ops0);
    expect((await pool.query('SELECT count(*)::int n FROM timeline_ops WHERE project_id=$1 AND user_id=$2', [pid, viewer.id])).rows[0].n).toBe(0);
    await new Promise((r) => setTimeout(r, 150)); expect(S.owner.msgs.some((m) => m.type === 'op' && m.rev > before.rev)).toBe(false);
    // e pela API REST também
    const rest = await op(viewer, evilOps[0]!); expect(rest.status).toBe(403); expect(rest.body.code).toBe('forbidden_role');
  });

  it('login do socket: token na URL é ignorado (4401); ticket é de uso único; sem login → 4401', async () => {
    const t = (env as { COLLAB_WS_AUTH_TIMEOUT_MS: number }).COLLAB_WS_AUTH_TIMEOUT_MS; (env as { COLLAB_WS_AUTH_TIMEOUT_MS: number }).COLLAB_WS_AUTH_TIMEOUT_MS = 300;
    try {
      const q = await sock(editor, pid, { query: true }); expect((await q.closed).code).toBe(4401); expect(q.msgs.some((m) => m.type === 'ready')).toBe(false);
      const used = S.editor.ticket; const again = await sock(editor, pid, { ticket: used, auth: false }); again.send({ type: 'auth', token: used }); expect((await again.closed)).toEqual({ code: 4401, reason: 'invalid_ticket' }); // jti já usado
      const silent = await sock(editor, pid, { auth: false }); expect((await silent.closed)).toEqual({ code: 4401, reason: 'auth_timeout' });
      const junk = await sock(editor, pid, { auth: false }); junk.send({ type: 'op', op: {} }); expect((await junk.closed).code).toBe(4401);
    } finally { (env as { COLLAB_WS_AUTH_TIMEOUT_MS: number }).COLLAB_WS_AUTH_TIMEOUT_MS = t; }
    expect((await http.post('/api/v1/collab/ws-ticket').set(auth(outsider)).send({ projectId: pid })).status).toBe(404); // sem papel nem ticket
  });

  it('conflito de propriedade: last-write-wins com o valor sobrescrito registrado', async () => {
    const c = (await tl(owner)).tracks[0].clips[1];
    const a = await op(owner, { kind: 'updateClip', clipId: c.id, baseVersion: c.version, patch: { props: { label: 'Do dono' } } });
    const b = await op(editor, { kind: 'updateClip', clipId: c.id, baseVersion: c.version, patch: { props: { label: 'Do editor' } } }); // versão velha
    expect(a.body.conflict).toBeNull(); expect(b.status).toBe(200); expect(b.body).toMatchObject({ conflict: 'lww', overwritten: { 'props.label': 'Do dono' } });
    expect((await tl(viewer)).tracks[0].clips[1].props.label).toBe('Do editor');
    expect((await pool.query(`SELECT overwritten FROM timeline_ops WHERE project_id=$1 AND conflict='lww' ORDER BY id DESC LIMIT 1`, [pid])).rows[0].overwritten).toEqual({ 'props.label': 'Do dono' });
  });

  it('conflito crítico: mover um trecho que o editor acabou de apagar → 409 com fork; o fork vira versão restaurável e todos recebem reload', async () => {
    const t = await tl(owner); const c = t.tracks[0].clips[2]; const audioTrack = t.tracks[1];
    expect((await op(editor, { kind: 'removeClip', clipId: c.id, baseVersion: c.version })).status).toBe(200);
    const mv = await op(owner, { kind: 'moveClip', clipId: c.id, baseVersion: c.version, toTrackId: t.tracks[0].id, startMs: 20000 });
    expect(mv.status).toBe(409); expect(mv.body.code).toBe('conflict_critical'); expect(mv.body.details).toMatchObject({ conflict: 'critical', forkable: true, current: null });
    expect((await pool.query(`SELECT count(*)::int n FROM timeline_ops WHERE project_id=$1 AND conflict='critical'`, [pid])).rows[0].n).toBe(1);
    const reorder = await op(owner, { kind: 'reorderClips', trackId: audioTrack.id, baseVersion: audioTrack.version + 5, clipIds: audioTrack.clips.map((x: { id: string }) => x.id) }); expect(reorder.status).toBe(409);
    const fork = await http.post(`/api/v1/projects/${pid}/timeline/fork`).set(auth(owner)).send({ op: { kind: 'moveClip', clipId: c.id, baseVersion: c.version, toTrackId: t.tracks[0].id, startMs: 20000 }, restore: c, label: 'Minha versão' });
    expect(fork.status).toBe(201); expect(fork.body.kind).toBe('fork');
    const snaps = (await http.get(`/api/v1/projects/${pid}/timeline/snapshots`).set(auth(editor))).body.items; expect(snaps.find((s: { snapshotId: string }) => s.snapshotId === fork.body.snapshotId)).toMatchObject({ kind: 'fork', label: 'Minha versão' });
    expect((await http.post(`/api/v1/projects/${pid}/timeline/snapshots/${fork.body.snapshotId}/restore`).set(auth(viewer))).status).toBe(403);
    const rs = await http.post(`/api/v1/projects/${pid}/timeline/snapshots/${fork.body.snapshotId}/restore`).set(auth(owner)); expect(rs.status).toBe(200);
    for (const s of [S.editor, S.viewer]) expect((await s.wait((m) => m.type === 'reload')).rev).toBe(rs.body.rev);
    const back = (await tl(owner)).tracks[0].clips.find((x: { id: string }) => x.id === c.id); expect(back).toMatchObject({ startMs: 20000 }); // o trecho voltou como na versão do dono
    expect((await http.get(`/api/v1/projects/${pid}/timeline/snapshots`).set(auth(owner))).body.items.some((s: { kind: string }) => s.kind === 'restore')).toBe(true); // dá para desfazer
  });

  it('trilha travada recusa edição (423); snapshot automático a cada N edições; reordenar encosta os trechos do vídeo', async () => {
    let t = await tl(editor); const fx = t.tracks[3];
    const lock = await op(editor, { kind: 'setTrackProperty', trackId: fx.id, baseVersion: fx.version, prop: 'locked', value: true }); expect(lock.status).toBe(200);
    expect((await op(editor, { kind: 'addClip', trackId: fx.id, startMs: 0, durationMs: 1000, props: { effect: 'zoom' } })).status).toBe(423);
    const every = env.TIMELINE_SNAPSHOT_EVERY; (env as { TIMELINE_SNAPSHOT_EVERY: number }).TIMELINE_SNAPSHOT_EVERY = 2;
    try {
      const n0 = (await pool.query(`SELECT count(*)::int n FROM timeline_snapshots WHERE project_id=$1 AND kind='auto'`, [pid])).rows[0].n;
      t = await tl(editor); const v = t.tracks[0]; const ids = v.clips.map((x: { id: string }) => x.id).reverse();
      const ro = await op(editor, { kind: 'reorderClips', trackId: v.id, baseVersion: v.version, clipIds: ids }); expect(ro.status).toBe(200);
      expect(ro.body.entity.clips.map((x: { startMs: number }) => x.startMs)).toEqual([0, 8000, 16000]);
      await op(editor, { kind: 'addTrack', trackKind: 'text', name: 'Preço' });
      expect((await pool.query(`SELECT count(*)::int n FROM timeline_snapshots WHERE project_id=$1 AND kind='auto'`, [pid])).rows[0].n).toBeGreaterThan(n0);
    } finally { (env as { TIMELINE_SNAPSHOT_EVERY: number }).TIMELINE_SNAPSHOT_EVERY = every; }
    expect((await op(editor, { kind: 'addClip', trackId: t.tracks[1].id, startMs: 119_000, durationMs: 5000 })).status).toBe(422); // passaria de 120 s
  });

  it('comentários: todos comentam; resolver só dono/editor; editar só o autor; apagar de outro só o dono', async () => {
    const c = await http.post(`/api/v1/projects/${pid}/comments`).set(auth(viewer)).send({ timeMs: 3000, body: 'Legenda cobrindo o produto' }); expect(c.status).toBe(201);
    const id = c.body.commentId;
    expect((await http.patch(`/api/v1/projects/${pid}/comments/${id}`).set(auth(viewer)).send({ resolved: true })).status).toBe(403);
    expect((await http.patch(`/api/v1/projects/${pid}/comments/${id}`).set(auth(editor)).send({ body: 'mudando o texto alheio' })).status).toBe(403);
    expect((await http.patch(`/api/v1/projects/${pid}/comments/${id}`).set(auth(viewer)).send({ body: 'Legenda cobrindo a bike' })).body.body).toBe('Legenda cobrindo a bike');
    expect((await http.patch(`/api/v1/projects/${pid}/comments/${id}`).set(auth(editor)).send({ resolved: true })).body.resolved).toBe(true);
    expect((await http.delete(`/api/v1/projects/${pid}/comments/${id}`).set(auth(editor))).status).toBe(403);
    expect((await http.delete(`/api/v1/projects/${pid}/comments/${id}`).set(auth(owner))).status).toBe(204);
    const list = (await http.get(`/api/v1/projects/${pid}/comments`).set(auth(editor))).body.items; expect(list.every((x: { timeMs: number }) => typeof x.timeMs === 'number')).toBe(true);
  });

  it('matriz no servidor: editor não convida, não remove, não exclui o projeto; viewer não salva nem restaura versão', async () => {
    expect((await http.delete(`/api/v1/projects/${pid}/collaborators/${viewer.id}`).set(auth(editor))).status).toBe(403);
    expect((await http.delete(`/api/v1/projects/${pid}`).set(auth(editor))).status).toBe(404); // rota original: só o dono (RLS)
    expect((await pool.query('SELECT deleted_at FROM projects WHERE id=$1', [pid])).rows[0].deleted_at).toBeNull();
    expect((await http.post(`/api/v1/projects/${pid}/timeline/snapshots`).set(auth(viewer)).send({ label: 'x' })).status).toBe(403);
    expect((await http.post(`/api/v1/projects/${pid}/timeline/snapshots`).set(auth(editor)).send({ label: 'Antes da revisão' })).status).toBe(201);
  });

  it('dono remove o viewer: socket dele cai na hora (4403) e ele perde o acesso; editor sai sozinho (LGPD)', async () => {
    expect((await http.delete(`/api/v1/projects/${pid}/collaborators/${viewer.id}`).set(auth(owner))).status).toBe(204);
    expect((await S.viewer.closed).code).toBe(4403); expect((await http.get(`/api/v1/projects/${pid}/timeline`).set(auth(viewer))).status).toBe(404);
    expect((await http.delete(`/api/v1/projects/${pid}/collaborators/me`).set(auth(editor))).status).toBe(204);
    expect((await S.editor.closed).code).toBe(4403); expect((await http.get(`/api/v1/projects/${pid}/timeline`).set(auth(editor))).status).toBe(404);
    await S.owner.wait((m) => m.type === 'presence' && m.event === 'leave' && m.user.userId === editor.id);
    const acts = (await pool.query(`SELECT action FROM audit_logs WHERE action LIKE 'collab.%' AND target_id=$1`, [pid])).rows.map((r) => r.action);
    for (const a of ['collab.invite', 'collab.accept', 'collab.remove', 'collab.leave', 'collab.comment']) expect(acts).toContain(a);
  });

  it('LGPD: anonimizar os próprios comentários; exclusão da conta anonimiza os comentários em projetos alheios', async () => {
    expect((await pool.query('SELECT count(*)::int n FROM comments WHERE author_id=$1', [viewer.id])).rows[0].n).toBeGreaterThan(0);
    expect((await http.post('/api/v1/collab/me/comments/anonymize').set(auth(viewer)).send({})).body.anonymized).toBeGreaterThan(0);
    const items = (await http.get(`/api/v1/projects/${pid}/comments`).set(auth(owner))).body.items; expect(items.every((x: { authorName: string | null; anonymized: boolean }) => x.anonymized && x.authorName === null)).toBe(true);
    await http.post(`/api/v1/projects/${pid}/comments`).set(auth(owner)).send({ timeMs: 1000, body: 'nota do dono' });
    const ix = await http.post(`/api/v1/projects/${pid}/collaborators`).set(auth(owner)).set(idem()).send({ email: outsider.email, role: 'editor' });
    await http.post('/api/v1/collab/invites/accept').set(auth(outsider)).send({ token: inviteTok(ix.body.link) });
    await http.post(`/api/v1/projects/${pid}/comments`).set(auth(outsider)).send({ timeMs: 2000, body: 'nota do convidado' });
    await complianceService.hardDelete(outsider.id);
    const c = (await pool.query(`SELECT author_id, anonymized FROM comments WHERE body='nota do convidado'`)).rows[0]; expect(c).toEqual({ author_id: null, anonymized: true });
    expect((await pool.query(`SELECT count(*)::int n FROM project_collaborators WHERE user_id=$1`, [outsider.id])).rows[0].n).toBe(0);
  });

  it('flag desligada derruba o acesso: ticket válido não entra mais (4404) e as rotas voltam a 404', async () => {
    const tk = (await http.post('/api/v1/collab/ws-ticket').set(auth(owner)).send({ projectId: pid })).body.ticket;
    await setFlags(false);
    try { const s = await sock(owner, pid, { ticket: tk, auth: false }); s.send({ type: 'auth', token: tk }); expect((await s.closed).code).toBe(4404); expect((await http.get(`/api/v1/projects/${pid}/timeline`).set(auth(owner))).status).toBe(404); }
    finally { await setFlags(true); }
    S.owner.ws.close();
  });
});
