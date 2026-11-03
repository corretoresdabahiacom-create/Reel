import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { transcriptService, editBodySchema, requireTranscript } from './transcriptService.js';
import { agentService, planBodySchema, requireAgent } from '../agent/agentService.js';

/** Spec do Módulo 9: transcrever 20/h por usuário e executar o agente 10/h por usuário (429). R13: mais um teto por IP. */
export const TRANSCRIBE_LIMIT: Limit = { scope: 'transcribe', limit: 20, windowSec: 3600, by: 'user' };
export const AGENT_EXECUTE_LIMIT: Limit = { scope: 'agent_execute', limit: 10, windowSec: 3600, by: 'user' };
const TRANSCRIBE_IP: Limit = { scope: 'transcribe_ip', limit: 60, windowSec: 3600, by: 'ip' };
const AGENT_IP: Limit = { scope: 'agent_execute_ip', limit: 30, windowSec: 3600, by: 'ip' };
const EDIT_LIMIT: Limit = { scope: 'transcript_edit', limit: 60, windowSec: 3600, by: 'both' };
const PLAN_LIMIT: Limit = { scope: 'agent_plan', limit: 60, windowSec: 3600, by: 'both' };
const prm = (r: { params: unknown }) => r.params as Record<string, string>;
const pid = (r: { params: unknown }) => parse(uuid, prm(r).projectId);

/** Módulo 9 — Transcrição (`ff_transcript`) e agente (`ff_agent`). Login; flag desligada = 404. Antes de `projectsRoutes`. */
export async function transcriptRoutes(app: FastifyInstance): Promise<void> {
  // A flag é conferida ANTES de rate limit, idempotência e validação do corpo: flag desligada = 404 em qualquer caso
  const tFlag = async (req: never) => requireTranscript(uid(req)); const aFlag = async (req: never) => requireAgent(uid(req));
  const r = (...extra: unknown[]) => ({ preHandler: [authenticate(), requireJwt, tFlag, ...extra] as never });
  const g = (...extra: unknown[]) => ({ preHandler: [authenticate(), requireJwt, aFlag, ...extra] as never });
  app.get('/transcript/config', r(), async (req) => transcriptService.config(uid(req)));
  app.post('/projects/:projectId/transcript', r(rateLimit(TRANSCRIBE_LIMIT), rateLimit(TRANSCRIBE_IP), idempotent({ required: true })), async (req, reply) =>
    reply.status(202).send(await transcriptService.transcribe(uid(req), pid(req))));
  app.get('/projects/:projectId/transcript', r(), async (req) => transcriptService.get(uid(req), pid(req)));
  app.post('/projects/:projectId/transcript/edits', r(rateLimit(EDIT_LIMIT), idempotent({ required: true })), async (req, reply) =>
    reply.status(202).send(await transcriptService.applyTranscriptEdit(uid(req), pid(req), parse(editBodySchema, req.body))));
  app.get('/projects/:projectId/transcript/edits/:editId', r(), async (req) => transcriptService.editStatus(uid(req), pid(req), parse(uuid, prm(req).editId)));
  app.post('/projects/:projectId/transcript/edits/:editId/apply', r(idempotent({ required: true })), async (req) => transcriptService.apply(uid(req), pid(req), parse(uuid, prm(req).editId)));
  app.delete('/projects/:projectId/transcript/edits/:editId', r(), async (req, reply) => { await transcriptService.discard(uid(req), pid(req), parse(uuid, prm(req).editId)); return reply.status(204).send(); });

  app.post('/projects/:projectId/agent/plan', g(rateLimit(PLAN_LIMIT), idempotent({ required: true })), async (req, reply) =>
    reply.status(201).send(await agentService.plan(uid(req), pid(req), parse(planBodySchema, req.body).command)));
  app.get('/projects/:projectId/agent/runs', g(), async (req) => agentService.list(uid(req), pid(req)));
  app.get('/projects/:projectId/agent/runs/:runId', g(), async (req) => agentService.get(uid(req), pid(req), parse(uuid, prm(req).runId)));
  app.post('/projects/:projectId/agent/runs/:runId/execute', g(rateLimit(AGENT_EXECUTE_LIMIT), rateLimit(AGENT_IP), idempotent({ required: true })), async (req, reply) =>
    reply.status(202).send(await agentService.execute(uid(req), pid(req), parse(uuid, prm(req).runId))));
  app.post('/projects/:projectId/agent/runs/:runId/apply', g(idempotent({ required: true })), async (req) =>
    agentService.apply(uid(req), pid(req), parse(uuid, prm(req).runId), parse(z.object({ confirm: z.boolean().optional() }).strict(), req.body ?? {}).confirm === true));
  app.delete('/projects/:projectId/agent/runs/:runId', g(), async (req, reply) => { await agentService.discard(uid(req), pid(req), parse(uuid, prm(req).runId)); return reply.status(204).send(); });
}
