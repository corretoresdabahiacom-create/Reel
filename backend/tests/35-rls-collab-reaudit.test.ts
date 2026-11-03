import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, http, signup, auth, type Session } from './helpers.js';
import { asSystem, tx } from '../src/db/pool.js';
import { invalidateFlags } from '../src/modules/flags.service.js';

/**
 * Reauditoria 2026-10-21 (migration 0021) — a RLS da colaboração é a 2ª linha de defesa, não só o app (assertCan).
 * Achados corrigidos: RLS-1 viewer escrevia na timeline pelo banco; RLS-2 histórico (timeline_ops) podia ser reescrito/apagado;
 * RLS-3 colaborador editava/apagava comentário alheio e comentava em nome de outro; RLS-4 editor convidava/removia pelo banco;
 * RLS-5 a role da aplicação lia/alterava schema_migrations.
 * Tudo com SQL DIRETO como nexus_app (o mesmo caminho de uma injeção ou de um bug no serviço).
 */
let owner: Session, editor: Session, viewer: Session, outsider: Session; let pid = '';
const as = <T>(s: Session, fn: Parameters<typeof tx<T>>[1]) => tx<T>({ userId: s.id }, fn);
const denied = async (p: Promise<unknown>) => { try { await p; return false; } catch (e) { return (e as { code?: string }).code === '42501'; } };
const setFlags = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key IN ('ff_collaboration','ff_timeline')`, [on, on ? 100 : 0])); await invalidateFlags(); };

beforeAll(async () => {
  await boot(false);
  owner = await signup({ plan: 'pro', credits: 10 }); editor = await signup({ plan: 'pro', credits: 10 }); viewer = await signup({ plan: 'free', credits: 10 }); outsider = await signup({ plan: 'pro', credits: 10 });
  pid = (await asSystem((db) => db.query(`INSERT INTO projects (user_id, title, script, status, duration_sec, final_video_url) VALUES ($1,'Reauditoria RLS','Roteiro','ready',16,'projects/x/final.mp4') RETURNING id`, [owner.id]))).rows[0].id;
  for (const [i, t] of ['Abertura', 'Fechamento'].entries()) await asSystem((db) => db.query(`INSERT INTO scenes (project_id, index, text, duration_sec, status) VALUES ($1,$2,$3,8,'done')`, [pid, i, t]));
  for (const [s, role] of [[editor, 'editor'], [viewer, 'viewer']] as const) await asSystem((db) => db.query(`INSERT INTO project_collaborators (project_id, user_id, role, status, invited_by, invited_email_hash, expires_at, accepted_at) VALUES ($1,$2,$3,'accepted',$4,$5, now() + interval '7 days', now())`, [pid, s.id, role, owner.id, `h-${s.id}`]));
  await setFlags(true);
}, 60_000);
afterAll(async () => { await setFlags(false); await shutdown(); });

describe('Reauditoria RLS — colaboração (0021)', () => {
  it('primeiro acesso de um VIEWER monta a timeline (como sistema) e ele lê; editor e dono leem a mesma', async () => {
    const r = await http.get(`/api/v1/projects/${pid}/timeline`).set(auth(viewer)); expect(r.status).toBe(200);
    expect(r.body.tracks.length).toBe(4);
    for (const s of [editor, owner]) expect((await http.get(`/api/v1/projects/${pid}/timeline`).set(auth(s))).body.tracks.length).toBe(4);
    expect((await http.get(`/api/v1/projects/${pid}/timeline`).set(auth(outsider))).status).toBe(404);
  });
  it('RLS-1: viewer não escreve em timeline_tracks/clips/meta/snapshots pelo banco; editor escreve', async () => {
    expect(await denied(as(viewer, (db) => db.query(`INSERT INTO timeline_tracks (project_id, kind, name, position) VALUES ($1,'audio','x',9)`, [pid])))).toBe(true);
    expect((await as(viewer, (db) => db.query(`UPDATE timeline_tracks SET name='hack' WHERE project_id=$1`, [pid]))).rowCount).toBe(0);
    expect((await as(viewer, (db) => db.query(`DELETE FROM timeline_clips WHERE project_id=$1`, [pid]))).rowCount).toBe(0);
    expect((await as(viewer, (db) => db.query(`UPDATE timeline_meta SET rev = rev + 100 WHERE project_id=$1`, [pid]))).rowCount).toBe(0);
    expect((await as(viewer, (db) => db.query(`SELECT count(*)::int n FROM timeline_tracks WHERE project_id=$1`, [pid]))).rows[0].n).toBe(4);
    expect((await as(editor, (db) => db.query(`UPDATE timeline_tracks SET muted = muted WHERE project_id=$1`, [pid]))).rowCount).toBe(4);
    expect((await as(outsider, (db) => db.query(`SELECT count(*)::int n FROM timeline_tracks WHERE project_id=$1`, [pid]))).rows[0].n).toBe(0);
  });
  it('RLS-2: timeline_ops é só acréscimo e em nome próprio — ninguém reescreve/apaga; viewer não acrescenta', async () => {
    await as(editor, (db) => db.query(`INSERT INTO timeline_ops (project_id, user_id, rev, op) VALUES ($1,$2,1,'{"kind":"x"}')`, [pid, editor.id]));
    expect(await denied(as(editor, (db) => db.query(`INSERT INTO timeline_ops (project_id, user_id, rev, op) VALUES ($1,$2,1,'{"kind":"x"}')`, [pid, owner.id])))).toBe(true); // em nome do dono
    expect(await denied(as(viewer, (db) => db.query(`INSERT INTO timeline_ops (project_id, user_id, rev, op) VALUES ($1,$2,1,'{"kind":"x"}')`, [pid, viewer.id])))).toBe(true);
    for (const s of [owner, editor]) {
      expect((await as(s, (db) => db.query(`UPDATE timeline_ops SET op='{"kind":"forjado"}' WHERE project_id=$1`, [pid]))).rowCount).toBe(0);
      expect((await as(s, (db) => db.query(`DELETE FROM timeline_ops WHERE project_id=$1`, [pid]))).rowCount).toBe(0);
    }
    expect((await as(viewer, (db) => db.query(`SELECT count(*)::int n FROM timeline_ops WHERE project_id=$1`, [pid]))).rows[0].n).toBeGreaterThan(0); // histórico continua legível
  });
  it('RLS-3: comentário — ninguém comenta em nome de outro; texto só o autor muda; apagar = autor ou dono; resolver = editor/dono', async () => {
    expect(await denied(as(viewer, (db) => db.query(`INSERT INTO comments (project_id, author_id, time_ms, body) VALUES ($1,$2,0,'em nome do dono')`, [pid, owner.id])))).toBe(true);
    const c = (await as(viewer, (db) => db.query(`INSERT INTO comments (project_id, author_id, time_ms, body) VALUES ($1,$2,0,'do viewer') RETURNING id`, [pid, viewer.id]))).rows[0].id;
    expect(await denied(as(editor, (db) => db.query(`UPDATE comments SET body='reescrito' WHERE id=$1`, [c])))).toBe(true);
    expect(await denied(as(editor, (db) => db.query(`UPDATE comments SET author_id=$2 WHERE id=$1`, [c, editor.id])))).toBe(true);
    expect((await as(editor, (db) => db.query(`DELETE FROM comments WHERE id=$1`, [c]))).rowCount).toBe(0);
    expect((await as(editor, (db) => db.query(`UPDATE comments SET resolved_at=now(), resolved_by=$2 WHERE id=$1`, [c, editor.id]))).rowCount).toBe(1); // resolver é legítimo
    const c2 = (await as(editor, (db) => db.query(`INSERT INTO comments (project_id, author_id, time_ms, body) VALUES ($1,$2,0,'do editor') RETURNING id`, [pid, editor.id]))).rows[0].id;
    expect((await as(viewer, (db) => db.query(`UPDATE comments SET resolved_at=now() WHERE id=$1`, [c2]))).rowCount).toBe(0); // viewer não resolve alheio
    expect((await as(viewer, (db) => db.query(`DELETE FROM comments WHERE id=$1`, [c2]))).rowCount).toBe(0);
    expect((await as(viewer, (db) => db.query(`UPDATE comments SET body='editei o meu' WHERE id=$1`, [c]))).rowCount).toBe(1); // o próprio, sim
    expect((await as(owner, (db) => db.query(`DELETE FROM comments WHERE id=$1`, [c2]))).rowCount).toBe(1); // dono apaga qualquer um
    expect((await as(outsider, (db) => db.query(`SELECT count(*)::int n FROM comments WHERE project_id=$1`, [pid]))).rows[0].n).toBe(0);
  });
  it('RLS-3 pela API: viewer comenta, editor resolve, editor não apaga nem edita o texto do viewer', async () => {
    const r = await http.post(`/api/v1/projects/${pid}/comments`).set(auth(viewer)).set('idempotency-key', `rls-${viewer.id}`).send({ timeMs: 1000, body: 'olha o câmbio' });
    expect(r.status).toBe(201); const id = r.body.commentId as string;
    const res = await http.patch(`/api/v1/projects/${pid}/comments/${id}`).set(auth(editor)).send({ resolved: true }); expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await http.patch(`/api/v1/projects/${pid}/comments/${id}`).set(auth(editor)).send({ body: 'outro texto' })).status).toBe(403);
    expect((await http.delete(`/api/v1/projects/${pid}/comments/${id}`).set(auth(editor))).status).toBe(403);
  });
  it('RLS-4: só o dono convida/altera/remove colaborador pelo banco; todos os membros leem a lista', async () => {
    const ins = (s: Session) => as(s, (db) => db.query(`INSERT INTO project_collaborators (project_id, role, invited_by, invited_email_hash, expires_at) VALUES ($1,'editor',$2,'h-x', now() + interval '1 day')`, [pid, s.id]));
    expect(await denied(ins(editor))).toBe(true); expect(await denied(ins(viewer))).toBe(true);
    expect((await as(editor, (db) => db.query(`UPDATE project_collaborators SET role='editor' WHERE project_id=$1 AND user_id=$2`, [pid, viewer.id]))).rowCount).toBe(0); // editor promovendo viewer
    expect((await as(viewer, (db) => db.query(`UPDATE project_collaborators SET role='editor' WHERE project_id=$1 AND user_id=$2`, [pid, viewer.id]))).rowCount).toBe(0); // autopromoção
    expect((await as(editor, (db) => db.query(`DELETE FROM project_collaborators WHERE project_id=$1`, [pid]))).rowCount).toBe(0);
    for (const s of [editor, viewer]) expect((await as(s, (db) => db.query(`SELECT count(*)::int n FROM project_collaborators WHERE project_id=$1`, [pid]))).rows[0].n).toBe(2);
    await ins(owner); // dono pode
  });
  it('RLS-5: a role da aplicação não lê nem altera schema_migrations', async () => {
    expect(await denied(as(owner, (db) => db.query('SELECT count(*) FROM schema_migrations')))).toBe(true);
    expect(await denied(tx({ system: true }, (db) => db.query(`DELETE FROM schema_migrations WHERE name='0001_init'`)))).toBe(true);
  });
});
