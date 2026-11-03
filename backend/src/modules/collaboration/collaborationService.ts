import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { SignJWT, jwtVerify } from 'jose';
import { asSystem, tx } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { enqueue, Q } from '../../queues/index.js';
import { emailHash } from '../emails/email.service.js';
import { isDisposable } from '../emailShare/disposable.js';
import { encrypt, sha256 } from '../../utils/crypto.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { assertCan, requireFlag, roleOf, type Role } from './permissions.js';
import { collabError } from './messages.js';
import { kick, publish, presence } from './realtime.js';

/**
 * Módulo 8 — Colaboração (`ff_collaboration`): `invite`, `acceptInvite`, `listCollaborators`, `removeCollaborator`
 * (+ sair, comentários ancorados no tempo e o ticket do WebSocket).
 * - Convite: token `<id>.<exp>.<HMAC>` (7 dias), guardado só como sha256 e APAGADO no aceite (uso único); preso ao e-mail
 *   convidado (só o HMAC do e-mail fica no banco) — um link encaminhado não serve para outra conta.
 * - Ticket do WebSocket: JWT de 60 s (aud `nexusreel-ws`, projeto e `jti` de uso único), enviado na PRIMEIRA MENSAGEM —
 *   nunca na URL.
 */
export const inviteBodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(254), role: z.enum(['editor', 'viewer']) }).strict();
export const commentBodySchema = z.object({ timeMs: z.number().int().min(0).max(120_000), body: z.string().trim().min(1).max(1000), clipId: z.string().uuid().optional() }).strict();
export const commentPatchSchema = z.object({ body: z.string().trim().min(1).max(1000).optional(), resolved: z.boolean().optional() }).strict();
const MAX_COLLABORATORS = 10;
const secret = () => createHmac('sha256', env.JWT_SECRET).update('nexusreel-collab-invite-v1').digest(); // chave própria derivada
const sign = (id: string, exp: number) => createHmac('sha256', secret()).update(`${id}.${exp}`).digest('base64url');
function parseInvite(token: string): { id: string; exp: number } | null {
  const m = /^([0-9a-f-]{36})\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(token); if (!m) return null;
  const good = Buffer.from(sign(m[1]!, Number(m[2]))), got = Buffer.from(m[3]!);
  if (good.length !== got.length || !timingSafeEqual(good, got) || Number(m[2]) * 1000 <= Date.now()) return null;
  return { id: m[1]!, exp: Number(m[2]) };
}
const wsKey = () => new TextEncoder().encode(createHmac('sha256', env.JWT_SECRET).update('nexusreel-ws-v1').digest('hex'));
const users = async (ids: string[]) => asSystem(async (db) => (await db.query<{ id: string; name: string; email: string }>('SELECT id, name, email FROM users WHERE id = ANY($1)', [ids])).rows);
interface CommentRow { id: string; project_id: string; author_id: string | null; time_ms: number; clip_id: string | null; body: string; anonymized: boolean; resolved_at: string | null; resolved_by: string | null; created_at: string; updated_at: string }

export const collaborationService = {
  /** Dono convida por e-mail (editor ou viewer). */
  async invite(userId: string, projectId: string, b: z.infer<typeof inviteBodySchema>) {
    await requireFlag('ff_collaboration', userId); await assertCan(userId, projectId, 'collaborator.invite');
    if (isDisposable(b.email)) throw collabError(422, 'disposable_domain');
    const [me] = await users([userId]); if (me && me.email.toLowerCase() === b.email) throw collabError(422, 'invite_self');
    const h = emailHash(b.email);
    const members = await asSystem(async (db) => (await db.query<{ email: string }>(`SELECT u.email FROM project_collaborators c JOIN users u ON u.id = c.user_id WHERE c.project_id=$1 AND c.status='accepted'`, [projectId])).rows);
    if (members.some((m) => emailHash(m.email) === h)) throw collabError(409, 'already_member');
    const open = await asSystem(async (db) => Number((await db.query<{ n: number }>(`SELECT count(*) AS n FROM project_collaborators WHERE project_id=$1 AND (status='accepted' OR (status='pending' AND expires_at > now()))`, [projectId])).rows[0].n));
    if (open >= MAX_COLLABORATORS) throw collabError(422, 'too_many_collaborators', { max: MAX_COLLABORATORS });
    const id = randomUUID(); const expires = new Date(Date.now() + 7 * 86400_000); const exp = Math.floor(expires.getTime() / 1000);
    const token = `${id}.${exp}.${sign(id, exp)}`; const link = `${env.PUBLIC_APP_URL}/convite?token=${encodeURIComponent(token)}`;
    await tx({ userId }, async (db) => {
      await db.query(`UPDATE project_collaborators SET status='revoked', token_hash=NULL WHERE project_id=$1 AND invited_email_hash=$2 AND status='pending'`, [projectId, h]); // convite anterior p/ o mesmo e-mail perde a validade
      await db.query('INSERT INTO project_collaborators (id, project_id, role, invited_by, invited_email_hash, token_hash, expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, projectId, b.role, userId, h, sha256(token), expires]);
      await audit(db, userId, 'collab.invite', 'project', projectId, { inviteId: id, role: b.role, emailHash: h });
    });
    const title = await asSystem(async (db) => (await db.query<{ title: string }>('SELECT title FROM projects WHERE id=$1', [projectId])).rows.at(0)?.title ?? '');
    const subject = `${(me?.name || 'Alguém').slice(0, 60)} convidou você para editar um vídeo no NexusReel`;
    await enqueue(Q.emails, 'collab-invite', { toEnc: encrypt(b.email), template: 'raw', logAs: 'hash', vars: { subject, text: `${subject}: "${title.slice(0, 80)}" (${b.role === 'editor' ? 'pode editar' : 'pode ver e comentar'}).\n\nAceite em até 7 dias: ${link}\n\nSe não esperava este convite, ignore.` } }, { userId });
    logger.info({ inviteId: id, role: b.role }, 'convite de colaboração'); // R7: sem e-mail
    return { inviteId: id, role: b.role, expiresAt: expires.toISOString(), link };
  },
  /** Aceite: token válido + do mesmo e-mail + uso único. */
  async acceptInvite(userId: string, token: string) {
    await requireFlag('ff_collaboration', userId);
    const t = parseInvite(token); if (!t) throw collabError(404, 'invite_invalid', undefined, 'not_found');
    const [me] = await users([userId]); if (!me) throw collabError(404, 'invite_invalid', undefined, 'not_found');
    return asSystem(async (db) => {
      const r = (await db.query<{ id: string; project_id: string; role: Role; invited_email_hash: string; token_hash: string | null; status: string; expires_at: string }>('SELECT * FROM project_collaborators WHERE id=$1 FOR UPDATE', [t.id])).rows[0];
      if (!r || r.status !== 'pending' || !r.token_hash || r.token_hash !== sha256(token) || new Date(r.expires_at) <= new Date()) throw collabError(404, 'invite_invalid', undefined, 'not_found');
      if (r.invited_email_hash !== emailHash(me.email)) throw collabError(403, 'invite_other_email');
      const owner = (await db.query<{ user_id: string }>('SELECT user_id FROM projects WHERE id=$1 AND deleted_at IS NULL', [r.project_id])).rows[0];
      if (!owner) throw collabError(404, 'invite_invalid', undefined, 'not_found'); if (owner.user_id === userId) throw collabError(422, 'invite_self');
      const dup = (await db.query<{ "?column?": number | null }>(`SELECT 1 FROM project_collaborators WHERE project_id=$1 AND user_id=$2 AND status='accepted'`, [r.project_id, userId])).rows[0];
      if (dup) { await db.query(`UPDATE project_collaborators SET status='revoked', token_hash=NULL WHERE id=$1`, [r.id]); throw collabError(409, 'already_member'); }
      await db.query(`UPDATE project_collaborators SET user_id=$2, status='accepted', accepted_at=now(), token_hash=NULL WHERE id=$1`, [r.id, userId]); // token apagado = uso único
      await audit(db, userId, 'collab.accept', 'project', r.project_id, { inviteId: r.id, role: r.role });
      return { projectId: r.project_id, role: r.role };
    });
  },
  /** Membros (qualquer papel vê nomes e papéis; só o dono vê os convites pendentes — sem e-mail). */
  async listCollaborators(userId: string, projectId: string) {
    await requireFlag('ff_collaboration', userId); const role = await assertCan(userId, projectId, 'timeline.view');
    const rows = await asSystem(async (db) => (await db.query<{ id: string; user_id: string | null; role: Role; status: string; expires_at: string; accepted_at: string | null; created_at: string }>(
      `SELECT id, user_id, role, status, expires_at, accepted_at, created_at FROM project_collaborators WHERE project_id=$1 AND (status='accepted' OR (status='pending' AND expires_at > now())) ORDER BY created_at`, [projectId])).rows);
    const ownerId = await asSystem(async (db) => (await db.query<{ user_id: string }>('SELECT user_id FROM projects WHERE id=$1', [projectId])).rows[0]!.user_id);
    const names = await users([ownerId, ...rows.filter((r) => r.user_id).map((r) => r.user_id!)]); const nm = (id: string) => names.find((u) => u.id === id)?.name ?? '';
    const online = new Set((await presence(projectId)).map((p) => p.userId));
    return { myRole: role, members: [{ userId: ownerId, name: nm(ownerId), role: 'owner', online: online.has(ownerId) }, ...rows.filter((r) => r.status === 'accepted').map((r) => ({ userId: r.user_id!, name: nm(r.user_id!), role: r.role, online: online.has(r.user_id!), since: r.accepted_at }))],
      pendingInvites: role === 'owner' ? rows.filter((r) => r.status === 'pending').map((r) => ({ inviteId: r.id, role: r.role, expiresAt: r.expires_at })) : [] };
  },
  /** Dono remove um colaborador (ou cancela um convite). A sessão em tempo real dele cai na hora. */
  async removeCollaborator(userId: string, projectId: string, target: string) {
    await requireFlag('ff_collaboration', userId); await assertCan(userId, projectId, 'collaborator.remove');
    const n = await tx({ userId }, async (db) => {
      const r = await db.query<{ user_id: string | null }>(`UPDATE project_collaborators SET status='revoked', token_hash=NULL, removed_at=now() WHERE project_id=$1 AND (user_id=$2 OR id=$2) AND status IN ('accepted','pending') RETURNING user_id`, [projectId, target]);
      if (r.rowCount) await audit(db, userId, 'collab.remove', 'project', projectId, { target }); return r.rows;
    });
    if (!n.length) throw collabError(404, 'collaborator_not_found', undefined, 'not_found');
    for (const r of n) if (r.user_id) await kick(projectId, r.user_id);
  },
  /** LGPD: o colaborador pode sair a qualquer momento. */
  async leave(userId: string, projectId: string) {
    const role = await roleOf(userId, projectId);
    if (!role || role === 'owner') throw collabError(404, 'collaborator_not_found', undefined, 'not_found');
    await asSystem(async (db) => { await db.query(`UPDATE project_collaborators SET status='left', removed_at=now() WHERE project_id=$1 AND user_id=$2 AND status='accepted'`, [projectId, userId]); await audit(db, userId, 'collab.leave', 'project', projectId); });
    await kick(projectId, userId);
  },
  /** Projetos em que sou colaborador. */
  async sharedWithMe(userId: string) {
    await requireFlag('ff_collaboration', userId);
    const rows = await asSystem(async (db) => (await db.query<{ project_id: string; role: Role; title: string; owner: string; accepted_at: string }>(
      `SELECT c.project_id, c.role, p.title, u.name AS owner, c.accepted_at FROM project_collaborators c JOIN projects p ON p.id = c.project_id AND p.deleted_at IS NULL JOIN users u ON u.id = p.user_id WHERE c.user_id=$1 AND c.status='accepted' ORDER BY c.accepted_at DESC`, [userId])).rows);
    return { items: rows.map((r) => ({ projectId: r.project_id, title: r.title, ownerName: r.owner, role: r.role, since: r.accepted_at })) };
  },
  /** Ticket do WebSocket: JWT de 60 s, de uso único, só para este projeto. Vai na 1ª mensagem do socket, nunca na URL. */
  async wsTicket(userId: string, projectId: string) {
    await requireFlag('ff_collaboration', userId); await assertCan(userId, projectId, 'timeline.view');
    const token = await new SignJWT({ pid: projectId }).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setAudience('nexusreel-ws').setIssuer(env.JWT_ISSUER).setJti(randomUUID()).setIssuedAt().setExpirationTime('60s').sign(wsKey());
    return { ticket: token, expiresInSec: 60, url: '/api/v1/collab/ws' };
  },
  async verifyTicket(token: string): Promise<{ userId: string; projectId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, wsKey(), { audience: 'nexusreel-ws', issuer: env.JWT_ISSUER, algorithms: ['HS256'] });
      if (!payload.jti || !(await redis.set(`ws:jti:${payload.jti}`, '1', 'EX', 120, 'NX'))) return null; // uso único
      return { userId: String(payload.sub), projectId: String(payload.pid) };
    } catch { return null; }
  },
  // ---- comentários ancorados no tempo ----
  async listComments(userId: string, projectId: string) {
    await requireFlag('ff_collaboration', userId); await assertCan(userId, projectId, 'timeline.view');
    const rows = await tx({ userId }, async (db) => (await db.query<CommentRow>('SELECT * FROM comments WHERE project_id=$1 ORDER BY time_ms, created_at', [projectId])).rows);
    return { items: await this.dtos(rows) };
  },
  async dtos(rows: CommentRow[]) {
    const names = await users([...new Set(rows.map((r) => r.author_id).filter(Boolean) as string[])]);
    return rows.map((r) => ({ commentId: r.id, timeMs: r.time_ms, clipId: r.clip_id, body: r.body, authorId: r.author_id, authorName: r.anonymized || !r.author_id ? null : names.find((u) => u.id === r.author_id)?.name ?? null, anonymized: r.anonymized, resolved: !!r.resolved_at, createdAt: r.created_at, updatedAt: r.updated_at }));
  },
  async addComment(userId: string, projectId: string, b: z.infer<typeof commentBodySchema>) {
    await requireFlag('ff_collaboration', userId); await assertCan(userId, projectId, 'comment.create');
    const row = await tx({ userId }, async (db) => {
      if (b.clipId && !(await db.query<{ "?column?": number | null }>('SELECT 1 FROM timeline_clips WHERE id=$1 AND project_id=$2', [b.clipId, projectId])).rows[0]) throw collabError(404, 'clip_not_found', undefined, 'not_found');
      const r = (await db.query<CommentRow>('INSERT INTO comments (project_id, author_id, time_ms, clip_id, body) VALUES ($1,$2,$3,$4,$5) RETURNING *', [projectId, userId, b.timeMs, b.clipId ?? null, b.body])).rows[0]!;
      await audit(db, userId, 'collab.comment', 'project', projectId, { commentId: r.id, timeMs: b.timeMs }); return r;
    });
    const [dto] = await this.dtos([row]); await publish(projectId, { type: 'comment', event: 'created', comment: dto });
    return dto!;
  },
  /** Editar: só o autor. Resolver/reabrir: dono ou editor. */
  async updateComment(userId: string, projectId: string, commentId: string, b: z.infer<typeof commentPatchSchema>) {
    await requireFlag('ff_collaboration', userId); const role = await assertCan(userId, projectId, 'timeline.view');
    if (b.resolved !== undefined) await assertCan(userId, projectId, 'comment.resolve');
    const row = await tx({ userId }, async (db) => {
      const c = (await db.query<CommentRow>('SELECT * FROM comments WHERE id=$1 AND project_id=$2 FOR UPDATE', [commentId, projectId])).rows[0];
      if (!c) throw collabError(404, 'comment_not_found', undefined, 'not_found');
      if (b.body !== undefined && c.author_id !== userId) throw collabError(403, 'forbidden_role', { role, action: 'comment.edit_own' });
      return (await db.query<CommentRow>(`UPDATE comments SET body=COALESCE($2, body), resolved_at = CASE WHEN $3::boolean IS NULL THEN resolved_at WHEN $3 THEN now() ELSE NULL END, resolved_by = CASE WHEN $3::boolean IS NULL THEN resolved_by WHEN $3 THEN $4::uuid ELSE NULL END, updated_at=now() WHERE id=$1 RETURNING *`,
        [commentId, b.body ?? null, b.resolved ?? null, userId])).rows[0]!;
    });
    const [dto] = await this.dtos([row]); await publish(projectId, { type: 'comment', event: 'updated', comment: dto }); return dto!;
  },
  /** Apagar: o autor apaga o próprio; o dono apaga qualquer um. */
  async deleteComment(userId: string, projectId: string, commentId: string) {
    await requireFlag('ff_collaboration', userId); const role = await assertCan(userId, projectId, 'timeline.view');
    await tx({ userId }, async (db) => {
      const c = (await db.query<CommentRow>('SELECT * FROM comments WHERE id=$1 AND project_id=$2', [commentId, projectId])).rows[0];
      if (!c) throw collabError(404, 'comment_not_found', undefined, 'not_found');
      if (c.author_id !== userId && role !== 'owner') throw collabError(403, 'forbidden_role', { role, action: 'comment.delete_any' });
      await db.query('DELETE FROM comments WHERE id=$1', [commentId]); await audit(db, userId, 'collab.comment_delete', 'project', projectId, { commentId });
    });
    await publish(projectId, { type: 'comment', event: 'deleted', commentId });
  },
  /** LGPD: anonimiza os MEUS comentários (todos ou de um projeto) — o texto fica, o autor some. Funciona sem a flag. */
  async anonymizeMyComments(userId: string, projectId?: string) {
    const n = await asSystem(async (db) => {
      const r = await db.query(`UPDATE comments SET author_id=NULL, anonymized=true, updated_at=now() WHERE author_id=$1 AND ($2::uuid IS NULL OR project_id=$2)`, [userId, projectId ?? null]);
      await audit(db, userId, 'collab.comments_anonymized', 'user', userId, { count: r.rowCount ?? 0, projectId: projectId ?? null }); return r.rowCount ?? 0;
    });
    return { anonymized: n };
  },
};
