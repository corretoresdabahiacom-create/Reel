import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { collaborationService, inviteBodySchema, commentBodySchema, commentPatchSchema } from './collaborationService.js';
import { timelineService } from '../timeline/timelineService.js';
import { camel, snakeKeys } from '../../utils/case.js';
import { collabSocket } from './ws.js';

const INVITE: Limit = { scope: 'collab_invite', limit: 20, windowSec: 3600, by: 'both' };
const ACCEPT: Limit = { scope: 'collab_accept', limit: 20, windowSec: 600, by: 'both' };
const COMMENT: Limit = { scope: 'collab_comment', limit: 60, windowSec: 60, by: 'user' };
const OPS: Limit = { scope: 'timeline_ops', limit: 240, windowSec: 60, by: 'user' };
const TICKET: Limit = { scope: 'collab_ticket', limit: 30, windowSec: 60, by: 'both' };
const prm = (r: { params: unknown }) => r.params as Record<string, string>;
const pid = (r: { params: unknown }) => parse(uuid, prm(r).projectId);

/**
 * Módulo 8 — Colaboração (`ff_collaboration`) e Timeline (`ff_timeline`). Login de usuário; flag desligada → 404.
 * Registrado antes de `projectsRoutes` (como os Módulos 4–7). Permissões conferidas no serviço (matriz em permissions.ts).
 */
export async function collaborationRoutes(app: FastifyInstance): Promise<void> {
  const r = (...extra: unknown[]) => ({ preHandler: [authenticate(), requireJwt, ...extra] as never });
  // colaboração
  app.post('/projects/:projectId/collaborators', r(rateLimit(INVITE), idempotent({ required: true })), async (req, reply) => reply.status(201).send(await collaborationService.invite(uid(req), pid(req), parse(inviteBodySchema, req.body))));
  app.get('/projects/:projectId/collaborators', r(), async (req) => collaborationService.listCollaborators(uid(req), pid(req)));
  app.delete('/projects/:projectId/collaborators/me', r(), async (req, reply) => { await collaborationService.leave(uid(req), pid(req)); return reply.status(204).send(); });
  app.delete('/projects/:projectId/collaborators/:memberId', r(), async (req, reply) => { await collaborationService.removeCollaborator(uid(req), pid(req), parse(uuid, prm(req).memberId)); return reply.status(204).send(); });
  app.post('/collab/invites/accept', r(rateLimit(ACCEPT)), async (req) => collaborationService.acceptInvite(uid(req), parse(z.object({ token: z.string().min(10).max(200) }).strict(), req.body).token));
  app.get('/collab/projects', r(), async (req) => collaborationService.sharedWithMe(uid(req)));
  app.post('/collab/ws-ticket', r(rateLimit(TICKET)), async (req) => collaborationService.wsTicket(uid(req), parse(z.object({ projectId: z.string().uuid() }).strict(), req.body).projectId));
  app.get('/projects/:projectId/comments', r(), async (req) => collaborationService.listComments(uid(req), pid(req)));
  app.post('/projects/:projectId/comments', r(rateLimit(COMMENT)), async (req, reply) => reply.status(201).send(await collaborationService.addComment(uid(req), pid(req), parse(commentBodySchema, req.body))));
  app.patch('/projects/:projectId/comments/:commentId', r(), async (req) => collaborationService.updateComment(uid(req), pid(req), parse(uuid, prm(req).commentId), parse(commentPatchSchema, req.body)));
  app.delete('/projects/:projectId/comments/:commentId', r(), async (req, reply) => { await collaborationService.deleteComment(uid(req), pid(req), parse(uuid, prm(req).commentId)); return reply.status(204).send(); });
  app.post('/collab/me/comments/anonymize', r(), async (req) => collaborationService.anonymizeMyComments(uid(req), parse(z.object({ projectId: z.string().uuid().optional() }).strict(), req.body ?? {}).projectId)); // LGPD: sem flag
  // timeline
  app.get('/projects/:projectId/timeline', r(), async (req) => camel(await timelineService.get(uid(req), pid(req))));
  app.post('/projects/:projectId/timeline/ops', r(rateLimit(OPS)), async (req) => { const res = await timelineService.apply(uid(req), pid(req), (req.body as { op?: unknown } | undefined)?.op); return { rev: res.rev, conflict: res.conflict, overwritten: camel(res.overwritten ?? null), entity: camel(res.entity) }; });
  app.post('/projects/:projectId/timeline/fork', r(), async (req, reply) => { const b = (req.body ?? {}) as { op?: unknown; restore?: Record<string, unknown>; label?: string };
    return reply.status(201).send(camel(await timelineService.fork(uid(req), pid(req), b.op, (b.restore && typeof b.restore === 'object' ? snakeKeys(b.restore) : undefined) as never, typeof b.label === 'string' ? b.label : undefined))); });
  app.get('/projects/:projectId/timeline/snapshots', r(), async (req) => camel(await timelineService.snapshots(uid(req), pid(req))));
  app.post('/projects/:projectId/timeline/snapshots', r(), async (req, reply) => reply.status(201).send(camel(await timelineService.createSnapshot(uid(req), pid(req), parse(z.object({ label: z.string().max(80).optional() }).strict(), req.body ?? {}).label))));
  app.post('/projects/:projectId/timeline/snapshots/:snapshotId/restore', r(), async (req) => camel(await timelineService.restore(uid(req), pid(req), parse(uuid, prm(req).snapshotId))));
  app.get('/projects/:projectId/timeline/history', r(), async (req) => camel(await timelineService.history(uid(req), pid(req))));
  await collabSocket(app);
}
