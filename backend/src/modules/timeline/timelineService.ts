import { z } from 'zod';
import type pg from 'pg';
import { asSystem, tx } from '../../db/pool.js';
import { audit } from '../../repositories/audit.js';
import { signRef } from '../../providers/storage.js';
import { env } from '../../config/env.js';
import { assertCan, requireFlag, type Role } from '../collaboration/permissions.js';
import { collabError } from '../collaboration/messages.js';
import { camelOut } from '../../utils/case.js';
import { publish } from '../collaboration/realtime.js';
import type { Row } from '../../db/rows.generated.js';

/**
 * Módulo 8 — Timeline multi-track (`ff_timeline`): `addTrack`, `addClip`, `reorderClips`, `setTrackProperty` (+ mover,
 * editar e remover trechos). Toda operação passa por `apply`, que:
 * 1. confere a permissão NO SERVIDOR (`timeline.edit`: dono e editor; viewer → 403) — vale para REST e WebSocket;
 * 2. trava a revisão do projeto (`timeline_meta FOR UPDATE`): operações do mesmo projeto ficam em fila;
 * 3. resolve conflitos pela versão da entidade (`baseVersion`):
 *    - propriedade (editar trecho, propriedade de trilha): **last-write-wins** — aplica, registra o valor sobrescrito;
 *    - estrutural (mover/remover trecho, reordenar, remover trilha) com versão velha, ou alvo apagado: **conflito crítico**
 *      (409) — nada muda e o cliente pode salvar a própria versão como **fork** (snapshot);
 * 4. grava `timeline_ops` (histórico) e, a cada `TIMELINE_SNAPSHOT_EVERY` edições, um snapshot automático.
 */
export const MAX_MS = 120_000;
const TRACK_KINDS = ['video', 'audio', 'text', 'effect'] as const;
const props = z.record(z.string().max(40), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).refine((o) => Object.keys(o).length <= 20, 'props demais');
const ms = z.number().int().min(0).max(MAX_MS);
const dur = z.number().int().min(100).max(MAX_MS);
const v = z.number().int().min(1);
export const opSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('addTrack'), trackKind: z.enum(TRACK_KINDS), name: z.string().trim().max(60).optional() }).strict(),
  z.object({ kind: z.literal('removeTrack'), trackId: z.string().uuid(), baseVersion: v }).strict(),
  z.object({ kind: z.literal('addClip'), trackId: z.string().uuid(), startMs: ms, durationMs: dur, sourceRef: z.string().max(200).optional(), props: props.optional() }).strict(),
  z.object({ kind: z.literal('updateClip'), clipId: z.string().uuid(), baseVersion: v, patch: z.object({ startMs: ms.optional(), durationMs: dur.optional(), props: props.optional() }).strict() }).strict(),
  z.object({ kind: z.literal('moveClip'), clipId: z.string().uuid(), baseVersion: v, toTrackId: z.string().uuid(), startMs: ms }).strict(),
  z.object({ kind: z.literal('removeClip'), clipId: z.string().uuid(), baseVersion: v }).strict(),
  z.object({ kind: z.literal('reorderClips'), trackId: z.string().uuid(), baseVersion: v, clipIds: z.array(z.string().uuid()).min(1).max(200) }).strict(),
  z.object({ kind: z.literal('setTrackProperty'), trackId: z.string().uuid(), baseVersion: v, prop: z.enum(['muted', 'locked', 'hidden', 'volume', 'opacity', 'name']), value: z.union([z.boolean(), z.number(), z.string().max(60)]) }).strict(),
]);
export type Op = z.infer<typeof opSchema>;
interface TrackRow { id: string; project_id: string; kind: string; name: string; position: number; muted: boolean; locked: boolean; hidden: boolean; volume: number; opacity: number; version: number }
interface ClipRow { id: string; track_id: string; project_id: string; position: number; start_ms: number; duration_ms: number; source_ref: string | null; props: Record<string, unknown>; version: number }
export interface TimelineDoc { tracks: Array<TrackRow & { clips: ClipRow[] }> }
export interface ApplyResult { rev: number; conflict: 'lww' | null; overwritten?: Record<string, unknown> | null; entity?: unknown; op: Op }

const PROP_COL: Record<string, string> = { muted: 'muted', locked: 'locked', hidden: 'hidden', volume: 'volume', opacity: 'opacity', name: 'name' };
const critical = (current: unknown, op: Op) => collabError(409, 'conflict_critical', { conflict: 'critical', current, forkable: true, op });

async function readDoc(db: pg.PoolClient, projectId: string): Promise<TimelineDoc> {
  const t = (await db.query<TrackRow>('SELECT id, project_id, kind, name, position, muted, locked, hidden, volume, opacity, version FROM timeline_tracks WHERE project_id=$1 ORDER BY position, created_at', [projectId])).rows;
  const c = (await db.query<ClipRow>('SELECT id, track_id, project_id, position, start_ms, duration_ms, source_ref, props, version FROM timeline_clips WHERE project_id=$1 ORDER BY position, start_ms', [projectId])).rows;
  return { tracks: t.map((x) => ({ ...x, clips: c.filter((k) => k.track_id === x.id) })) };
}
/**
 * Primeiro acesso: monta o timeline a partir das cenas do projeto (vídeo + legendas) e trilhas vazias de áudio e efeitos.
 * A montagem inicial é trabalho do SISTEMA (transação própria, atômica): desde a 0021 só dono/editor escrevem na timeline
 * pela RLS, e o primeiro acesso pode ser de um 'viewer' (só leitura). O chamador já passou por assertCan('timeline.view').
 */
async function ensureSeeded(db: pg.PoolClient, projectId: string): Promise<void> {
  if ((await db.query<{ "?column?": number | null }>('SELECT 1 FROM timeline_meta WHERE project_id=$1', [projectId])).rowCount) return;
  await asSystem((sys) => seedTimeline(sys, projectId));
}
async function seedTimeline(db: pg.PoolClient, projectId: string): Promise<void> {
  const ins = await db.query<{ project_id: string }>(`INSERT INTO timeline_meta (project_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING project_id`, [projectId]);
  if (!ins.rowCount) return;
  const scenes = (await db.query<{ id: string; index: number; text: string; duration_sec: number }>(
    `SELECT DISTINCT ON (index) id, index, text, duration_sec FROM scenes WHERE project_id=$1 ORDER BY index, selected DESC, version DESC`, [projectId])).rows;
  const mk = async (kind: string, name: string, position: number) => (await db.query<{ id: string }>('INSERT INTO timeline_tracks (project_id, kind, name, position) VALUES ($1,$2,$3,$4) RETURNING id', [projectId, kind, name, position])).rows[0]!.id;
  const video = await mk('video', 'Vídeo', 0), audio = await mk('audio', 'Áudio', 1), text = await mk('text', 'Legendas', 2); await mk('effect', 'Efeitos', 3);
  let at = 0;
  for (const s of scenes) {
    const d = Math.min(s.duration_sec * 1000, MAX_MS - at); if (d < 100) break;
    await db.query('INSERT INTO timeline_clips (track_id, project_id, position, start_ms, duration_ms, source_ref, props) VALUES ($1,$2,$3,$4,$5,$6,$7)', [video, projectId, s.index, at, d, `scene:${s.id}`, { label: `Cena ${s.index + 1}` }]);
    if (s.text.trim()) await db.query('INSERT INTO timeline_clips (track_id, project_id, position, start_ms, duration_ms, props) VALUES ($1,$2,$3,$4,$5,$6)', [text, projectId, s.index, at, d, { text: s.text.slice(0, 500) }]);
    at += d;
  }
  if (at > 0) await db.query('INSERT INTO timeline_clips (track_id, project_id, position, start_ms, duration_ms, source_ref, props) VALUES ($1,$2,0,0,$3,$4,$5)', [audio, projectId, at, 'project:audio', { label: 'Narração + trilha' }]);
}
const endOf = (c: { start_ms: number; duration_ms: number }) => c.start_ms + c.duration_ms;
async function assertLength(db: pg.PoolClient, trackId: string) {
  const m = Number((await db.query<{ m: number }>('SELECT COALESCE(MAX(start_ms + duration_ms),0) AS m FROM timeline_clips WHERE track_id=$1', [trackId])).rows[0].m);
  if (m > MAX_MS) throw collabError(422, 'timeline_too_long', { maxMs: MAX_MS });
}
const trackOf = async (db: pg.PoolClient, projectId: string, id: string) => (await db.query<TrackRow>('SELECT * FROM timeline_tracks WHERE id=$1 AND project_id=$2 FOR UPDATE', [id, projectId])).rows[0];
const clipOf = async (db: pg.PoolClient, projectId: string, id: string) => (await db.query<ClipRow>('SELECT * FROM timeline_clips WHERE id=$1 AND project_id=$2 FOR UPDATE', [id, projectId])).rows[0];
const unlocked = (t: TrackRow | undefined, allowLockToggle = false) => { if (t && t.locked && !allowLockToggle) throw collabError(423, 'track_locked'); };

/** Aplica uma operação dentro da transação (já com a revisão do projeto travada). */
async function applyOp(db: pg.PoolClient, userId: string, projectId: string, op: Op): Promise<Omit<ApplyResult, 'rev' | 'op'>> {
  switch (op.kind) {
    case 'addTrack': {
      const pos = Number((await db.query<{ p: number }>('SELECT COALESCE(MAX(position),-1)+1 AS p FROM timeline_tracks WHERE project_id=$1', [projectId])).rows[0].p);
      if (pos >= 12) throw collabError(422, 'invalid_op', { reason: 'max_tracks' });
      const t = (await db.query<TrackRow>('INSERT INTO timeline_tracks (project_id, kind, name, position, updated_by) VALUES ($1,$2,$3,$4,$5) RETURNING *', [projectId, op.trackKind, op.name ?? '', pos, userId])).rows[0];
      return { conflict: null, entity: { ...t, clips: [] } };
    }
    case 'removeTrack': {
      const t = await trackOf(db, projectId, op.trackId); if (!t) throw critical(null, op);
      if (t.version !== op.baseVersion) throw critical(t, op); unlocked(t);
      await db.query('DELETE FROM timeline_tracks WHERE id=$1', [t.id]); return { conflict: null, entity: { id: t.id, removed: true } };
    }
    case 'addClip': {
      const t = await trackOf(db, projectId, op.trackId); if (!t) throw critical(null, op); unlocked(t);
      const pos = Number((await db.query<{ p: number }>('SELECT COALESCE(MAX(position),-1)+1 AS p FROM timeline_clips WHERE track_id=$1', [t.id])).rows[0].p);
      const c = (await db.query<ClipRow>('INSERT INTO timeline_clips (track_id, project_id, position, start_ms, duration_ms, source_ref, props, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
        [t.id, projectId, pos, op.startMs, op.durationMs, op.sourceRef ?? null, op.props ?? {}, userId])).rows[0]!;
      await assertLength(db, t.id); return { conflict: null, entity: c };
    }
    case 'updateClip': { // propriedade → last-write-wins
      const c = await clipOf(db, projectId, op.clipId); if (!c) throw critical(null, op); // apagado por outra pessoa
      unlocked(await trackOf(db, projectId, c.track_id));
      const stale = c.version !== op.baseVersion;
      const overwritten: Record<string, unknown> = {};
      if (stale) { if (op.patch.startMs !== undefined) overwritten.startMs = c.start_ms; if (op.patch.durationMs !== undefined) overwritten.durationMs = c.duration_ms; if (op.patch.props) for (const k of Object.keys(op.patch.props)) overwritten[`props.${k}`] = c.props[k] ?? null; }
      const n = (await db.query<ClipRow>(`UPDATE timeline_clips SET start_ms=COALESCE($2,start_ms), duration_ms=COALESCE($3,duration_ms), props = props || $4::jsonb, version=version+1, updated_by=$5, updated_at=now() WHERE id=$1 RETURNING *`,
        [c.id, op.patch.startMs ?? null, op.patch.durationMs ?? null, JSON.stringify(op.patch.props ?? {}), userId])).rows[0]!;
      await assertLength(db, c.track_id);
      return { conflict: stale ? 'lww' : null, overwritten: stale ? overwritten : null, entity: n };
    }
    case 'moveClip': { // estrutural
      const c = await clipOf(db, projectId, op.clipId); if (!c) throw critical(null, op);
      if (c.version !== op.baseVersion) throw critical(c, op);
      const to = await trackOf(db, projectId, op.toTrackId); if (!to) throw critical(null, op);
      unlocked(await trackOf(db, projectId, c.track_id)); unlocked(to);
      const n = (await db.query<ClipRow>('UPDATE timeline_clips SET track_id=$2, start_ms=$3, version=version+1, updated_by=$4, updated_at=now() WHERE id=$1 RETURNING *', [c.id, to.id, op.startMs, userId])).rows[0]!;
      await assertLength(db, to.id); return { conflict: null, entity: n };
    }
    case 'removeClip': {
      const c = await clipOf(db, projectId, op.clipId); if (!c) throw critical(null, op);
      if (c.version !== op.baseVersion) throw critical(c, op); unlocked(await trackOf(db, projectId, c.track_id));
      await db.query('DELETE FROM timeline_clips WHERE id=$1', [c.id]); return { conflict: null, entity: { id: c.id, removed: true } };
    }
    case 'reorderClips': {
      const t = await trackOf(db, projectId, op.trackId); if (!t) throw critical(null, op);
      if (t.version !== op.baseVersion) throw critical(t, op); unlocked(t);
      const cur = (await db.query<ClipRow>('SELECT * FROM timeline_clips WHERE track_id=$1 ORDER BY position', [t.id])).rows;
      if (cur.length !== op.clipIds.length || !cur.every((c) => op.clipIds.includes(c.id))) throw critical({ ...t, clips: cur }, op); // alguém incluiu/tirou trecho
      let at = 0; const sequential = t.kind === 'video'; // no vídeo, reordenar encosta os trechos um no outro
      for (const [i, id] of op.clipIds.entries()) { const c = cur.find((x) => x.id === id)!;
        await db.query('UPDATE timeline_clips SET position=$2, start_ms=$3, version=version+1, updated_by=$4, updated_at=now() WHERE id=$1', [id, i, sequential ? at : c.start_ms, userId]); at += c.duration_ms; }
      const n = (await db.query<TrackRow>('UPDATE timeline_tracks SET version=version+1, updated_by=$2, updated_at=now() WHERE id=$1 RETURNING *', [t.id, userId])).rows[0]!;
      return { conflict: null, entity: { ...n, clips: (await db.query<ClipRow>('SELECT * FROM timeline_clips WHERE track_id=$1 ORDER BY position', [t.id])).rows } };
    }
    case 'setTrackProperty': { // propriedade → last-write-wins
      const t = await trackOf(db, projectId, op.trackId); if (!t) throw critical(null, op);
      if (op.prop !== 'locked') unlocked(t);
      const valid = ['muted', 'locked', 'hidden'].includes(op.prop) ? typeof op.value === 'boolean' : op.prop === 'name' ? typeof op.value === 'string' : typeof op.value === 'number' && op.value >= 0 && op.value <= (op.prop === 'volume' ? 2 : 1);
      if (!valid) throw collabError(422, 'invalid_op', { prop: op.prop });
      const stale = t.version !== op.baseVersion;
      const n = (await db.query<TrackRow>(`UPDATE timeline_tracks SET ${PROP_COL[op.prop]}=$2, version=version+1, updated_by=$3, updated_at=now() WHERE id=$1 RETURNING *`, [t.id, op.value, userId])).rows[0]!;
      return { conflict: stale ? 'lww' : null, overwritten: stale ? { [op.prop]: (t as unknown as Record<string, unknown>)[op.prop] } : null, entity: n };
    }
  }
}

/** Aplica o `op` em memória (para o fork): o que não existir mais é recriado a partir de `restore`, a cópia local do cliente. */
function applyToDoc(doc: TimelineDoc, op: Op, restore?: Partial<ClipRow>): TimelineDoc {
  const d: TimelineDoc = JSON.parse(JSON.stringify(doc)); const allClips = () => d.tracks.flatMap((t) => t.clips);
  const findClip = (id: string) => allClips().find((c) => c.id === id);
  const revive = (id: string) => { if (!restore || restore.id !== id || !restore.track_id) return undefined; const t = d.tracks.find((x) => x.id === restore.track_id) ?? d.tracks[0]; if (!t) return undefined;
    const c = { ...(restore as ClipRow), track_id: t.id }; t.clips.push(c); return c; };
  if (op.kind === 'updateClip') { const c = findClip(op.clipId) ?? revive(op.clipId); if (c) { if (op.patch.startMs !== undefined) c.start_ms = op.patch.startMs; if (op.patch.durationMs !== undefined) c.duration_ms = op.patch.durationMs; if (op.patch.props) c.props = { ...c.props, ...op.patch.props }; } }
  if (op.kind === 'moveClip') { const c = findClip(op.clipId) ?? revive(op.clipId); const to = d.tracks.find((t) => t.id === op.toTrackId); if (c && to) { for (const t of d.tracks) t.clips = t.clips.filter((x) => x.id !== c.id); c.track_id = to.id; c.start_ms = op.startMs; to.clips.push(c); } }
  if (op.kind === 'removeClip') for (const t of d.tracks) t.clips = t.clips.filter((x) => x.id !== op.clipId);
  if (op.kind === 'reorderClips') { const t = d.tracks.find((x) => x.id === op.trackId); if (t) t.clips = op.clipIds.map((id) => t.clips.find((c) => c.id === id)).filter(Boolean) as ClipRow[]; }
  if (op.kind === 'setTrackProperty') { const t = d.tracks.find((x) => x.id === op.trackId); if (t) (t as unknown as Record<string, unknown>)[op.prop] = op.value; }
  if (op.kind === 'removeTrack') d.tracks = d.tracks.filter((t) => t.id !== op.trackId);
  return d;
}
async function snapshot(db: pg.PoolClient, projectId: string, kind: 'auto' | 'manual' | 'fork' | 'restore', userId: string | null, label: string, rev: number, data?: TimelineDoc) {
  return (await db.query<{ id: string; created_at: string }>('INSERT INTO timeline_snapshots (project_id, kind, label, rev, data, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at',
    [projectId, kind, label.slice(0, 80), rev, data ?? (await readDoc(db, projectId)), userId])).rows[0]!;
}
const userName = async (userId: string) => asSystem(async (db) => (await db.query<{ name: string }>('SELECT name FROM users WHERE id=$1', [userId])).rows.at(0)?.name ?? '');

export const timelineService = {
  /** Timeline do projeto (qualquer papel). Monta na primeira vez a partir das cenas. */
  async get(userId: string, projectId: string) {
    await requireFlag('ff_timeline', userId); const role = await assertCan(userId, projectId, 'timeline.view');
    const r = await tx({ userId }, async (db) => { await ensureSeeded(db, projectId); const rev = Number((await db.query<Pick<Row<'timeline_meta'>, 'rev'>>('SELECT rev FROM timeline_meta WHERE project_id=$1', [projectId])).rows[0].rev); return { rev, doc: await readDoc(db, projectId) }; });
    const p = await asSystem(async (db) => (await db.query<{ final_video_url: string | null; title: string }>('SELECT final_video_url, title FROM projects WHERE id=$1', [projectId])).rows[0]);
    const durationMs = Math.max(0, ...r.doc.tracks.flatMap((t) => t.clips.map(endOf)));
    return { projectId, title: p?.title ?? '', role, rev: r.rev, durationMs, maxMs: MAX_MS, tracks: r.doc.tracks, previewUrl: p?.final_video_url ? await signRef(p.final_video_url, 86400) : null };
  },
  /** Ponto único de escrita (REST e WebSocket). `role` vem da checagem no servidor, nunca do cliente. */
  async apply(userId: string, projectId: string, rawOp: unknown): Promise<ApplyResult & { role: Role }> {
    await requireFlag('ff_timeline', userId);
    const role = await assertCan(userId, projectId, 'timeline.edit'); // viewer → 403 aqui, antes de qualquer escrita
    const op = opSchema.parse(rawOp);
    try {
      const res = await tx({ userId }, async (db) => {
        await ensureSeeded(db, projectId);
        const meta = (await db.query<{ rev: string; edits_since_snapshot: number }>('SELECT rev, edits_since_snapshot FROM timeline_meta WHERE project_id=$1 FOR UPDATE', [projectId])).rows[0]!;
        const r = await applyOp(db, userId, projectId, op); const rev = Number(meta.rev) + 1; const every = env.TIMELINE_SNAPSHOT_EVERY;
        const auto = meta.edits_since_snapshot + 1 >= every;
        await db.query('UPDATE timeline_meta SET rev=$2, edits_since_snapshot=$3, updated_at=now() WHERE project_id=$1', [projectId, rev, auto ? 0 : meta.edits_since_snapshot + 1]);
        await db.query('INSERT INTO timeline_ops (project_id, user_id, rev, op, conflict, overwritten) VALUES ($1,$2,$3,$4,$5,$6)', [projectId, userId, rev, op, r.conflict, r.overwritten ?? null]);
        if (auto) await snapshot(db, projectId, 'auto', null, `Automático (${every} edições)`, rev);
        return { ...r, rev };
      });
      await publish(projectId, { type: 'op', rev: res.rev, op, entity: camelOut(res.entity), conflict: res.conflict, by: { userId, name: await userName(userId) } });
      return { ...res, op, role };
    } catch (e) {
      if (e instanceof Error && (e as { code?: string }).code === 'conflict_critical') {
        await asSystem((db) => db.query(`INSERT INTO timeline_ops (project_id, user_id, rev, op, conflict) SELECT $1,$2,COALESCE((SELECT rev FROM timeline_meta WHERE project_id=$1),0),$3,'critical'`, [projectId, userId, op])).catch(() => undefined);
      }
      throw e;
    }
  },
  addTrack: (userId: string, projectId: string, trackKind: (typeof TRACK_KINDS)[number], name?: string) => timelineService.apply(userId, projectId, { kind: 'addTrack', trackKind, name }),
  addClip: (userId: string, projectId: string, c: { trackId: string; startMs: number; durationMs: number; sourceRef?: string; props?: Record<string, string | number | boolean | null> }) => timelineService.apply(userId, projectId, { kind: 'addClip', ...c }),
  reorderClips: (userId: string, projectId: string, trackId: string, baseVersion: number, clipIds: string[]) => timelineService.apply(userId, projectId, { kind: 'reorderClips', trackId, baseVersion, clipIds }),
  setTrackProperty: (userId: string, projectId: string, trackId: string, baseVersion: number, prop: 'muted' | 'locked' | 'hidden' | 'volume' | 'opacity' | 'name', value: boolean | number | string) =>
    timelineService.apply(userId, projectId, { kind: 'setTrackProperty', trackId, baseVersion, prop, value }),
  /** Fork em conflito crítico: guarda a versão de quem perdeu a corrida como snapshot (nada se perde; dá para restaurar). */
  async fork(userId: string, projectId: string, rawOp: unknown, restore?: Partial<ClipRow>, label?: string) {
    await requireFlag('ff_timeline', userId); await assertCan(userId, projectId, 'snapshot.create');
    const op = opSchema.parse(rawOp);
    const s = await tx({ userId }, async (db) => {
      const rev = Number((await db.query<Pick<Row<'timeline_meta'>, 'rev'>>('SELECT rev FROM timeline_meta WHERE project_id=$1', [projectId])).rows.at(0)?.rev ?? 0);
      const doc = applyToDoc(await readDoc(db, projectId), op, restore);
      const r = await snapshot(db, projectId, 'fork', userId, label ?? `Cópia de ${await userName(userId)}`, rev, doc);
      await audit(db, userId, 'timeline.fork', 'project', projectId, { snapshotId: r.id, op: op.kind }); return r;
    });
    await publish(projectId, { type: 'snapshot', kind: 'fork', snapshotId: s.id, by: { userId } });
    return { snapshotId: s.id, kind: 'fork', createdAt: s.created_at };
  },
  async snapshots(userId: string, projectId: string) {
    await requireFlag('ff_timeline', userId); await assertCan(userId, projectId, 'timeline.view');
    const rows = await tx({ userId }, async (db) => (await db.query<{ id: string; kind: string; label: string; rev: string; created_by: string | null; created_at: string }>(
      'SELECT id, kind, label, rev, created_by, created_at FROM timeline_snapshots WHERE project_id=$1 ORDER BY created_at DESC LIMIT 50', [projectId])).rows);
    return { items: rows.map((r) => ({ snapshotId: r.id, kind: r.kind, label: r.label, rev: Number(r.rev), createdBy: r.created_by, createdAt: r.created_at })) };
  },
  async createSnapshot(userId: string, projectId: string, label?: string) {
    await requireFlag('ff_timeline', userId); await assertCan(userId, projectId, 'snapshot.create');
    const s = await tx({ userId }, async (db) => { await ensureSeeded(db, projectId); const rev = Number((await db.query<Pick<Row<'timeline_meta'>, 'rev'>>('SELECT rev FROM timeline_meta WHERE project_id=$1', [projectId])).rows[0].rev);
      return snapshot(db, projectId, 'manual', userId, label?.trim() || 'Versão salva', rev); });
    return { snapshotId: s.id, kind: 'manual', createdAt: s.created_at };
  },
  /** Restaura uma versão (antes, salva a atual como 'restore' — dá para desfazer). Todos recebem `reload`. */
  async restore(userId: string, projectId: string, snapshotId: string) {
    await requireFlag('ff_timeline', userId); await assertCan(userId, projectId, 'snapshot.restore');
    const rev = await tx({ userId }, async (db) => {
      const s = (await db.query<{ data: TimelineDoc; label: string }>('SELECT data, label FROM timeline_snapshots WHERE id=$1 AND project_id=$2', [snapshotId, projectId])).rows[0];
      if (!s) throw collabError(404, 'snapshot_not_found', undefined, 'not_found');
      const meta = (await db.query<{ rev: string }>('SELECT rev FROM timeline_meta WHERE project_id=$1 FOR UPDATE', [projectId])).rows[0]!; const next = Number(meta.rev) + 1;
      await snapshot(db, projectId, 'restore', userId, 'Antes de restaurar', Number(meta.rev));
      await db.query('DELETE FROM timeline_tracks WHERE project_id=$1', [projectId]);
      for (const t of s.data.tracks) {
        await db.query('INSERT INTO timeline_tracks (id, project_id, kind, name, position, muted, locked, hidden, volume, opacity, version, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
          [t.id, projectId, t.kind, t.name, t.position, t.muted, t.locked, t.hidden, t.volume, t.opacity, t.version + 1, userId]);
        for (const c of t.clips) await db.query('INSERT INTO timeline_clips (id, track_id, project_id, position, start_ms, duration_ms, source_ref, props, version, updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [c.id, t.id, projectId, c.position, c.start_ms, c.duration_ms, c.source_ref, c.props, c.version + 1, userId]);
      }
      await db.query('UPDATE timeline_meta SET rev=$2, edits_since_snapshot=0, updated_at=now() WHERE project_id=$1', [projectId, next]);
      await db.query('INSERT INTO timeline_ops (project_id, user_id, rev, op) VALUES ($1,$2,$3,$4)', [projectId, userId, next, { kind: 'restore', snapshotId }]);
      await audit(db, userId, 'timeline.restore', 'project', projectId, { snapshotId }); return next;
    });
    await publish(projectId, { type: 'reload', rev, reason: 'restore', by: { userId } });
    return { rev };
  },
  async history(userId: string, projectId: string) {
    await requireFlag('ff_timeline', userId); await assertCan(userId, projectId, 'timeline.view');
    const rows = await tx({ userId }, async (db) => (await db.query<{ rev: string; user_id: string | null; op: { kind: string }; conflict: string | null; created_at: string }>(
      'SELECT rev, user_id, op, conflict, created_at FROM timeline_ops WHERE project_id=$1 ORDER BY id DESC LIMIT 100', [projectId])).rows);
    return { items: rows.map((r) => ({ rev: Number(r.rev), userId: r.user_id, kind: r.op.kind, conflict: r.conflict, at: r.created_at })) };
  },
};
