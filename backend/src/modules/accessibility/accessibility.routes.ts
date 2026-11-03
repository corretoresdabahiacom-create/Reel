import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { env } from '../../config/env.js';
import { requireA11y, a11yError } from './messages.js';
import { accessibilityService, captionsSchema, adSchema, reviewSchema, exportSchema } from './accessibilityService.js';
import { teleprompterService, startSchema } from '../teleprompter/teleprompterService.js';

const GEN: Limit = { scope: 'a11y_generate', limit: 30, windowSec: 3600, by: 'both' };
const EXPORT: Limit = { scope: 'a11y_export', limit: 60, windowSec: 3600, by: 'both' };
const TP: Limit = { scope: 'teleprompter', limit: 60, windowSec: 3600, by: 'both' };
const TP_UPLOAD: Limit = { scope: 'teleprompter_upload', limit: 20, windowSec: 3600, by: 'both' };
const prm = (r: { params: unknown }) => r.params as Record<string, string>;
const OPT_IN = 'x-upload-opt-in';
/** Envio de vídeo: Idempotency-Key obrigatório, mas sem guardar hash do corpo (até 150 MB). Repetir o envio dá 409 already_uploaded. */
const requireKey = async (req: { headers: Record<string, unknown> }) => { const k = req.headers['idempotency-key']; if (typeof k !== 'string' || k.length < 8 || k.length > 128) throw a11yError(400, 'idempotency_key_required', undefined, 'bad_request'); };

/** Módulo 11 — Acessibilidade (`ff_accessibility`) e Teleprompter (`ff_teleprompter`). Flag desligada = 404 (antes de tudo). */
export async function accessibilityRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(['video/webm', 'video/mp4', 'application/octet-stream'], { parseAs: 'buffer', bodyLimit: env.TELEPROMPTER_MAX_BYTES }, (_r, body, done) => done(null, body));
  const a = async (req: never) => requireA11y('ff_accessibility', uid(req)); const t = async (req: never) => requireA11y('ff_teleprompter', uid(req));
  const A = (...x: unknown[]) => ({ preHandler: [authenticate(), requireJwt, a, ...x] as never }); const T = (...x: unknown[]) => ({ preHandler: [authenticate(), requireJwt, t, ...x] as never });
  const pid = (r: { params: unknown }) => parse(uuid, prm(r).projectId);

  app.get('/accessibility/config', A(), async (req) => accessibilityService.config(uid(req)));
  app.get('/projects/:projectId/accessibility', A(), async (req) => accessibilityService.list(uid(req), pid(req)));
  app.post('/projects/:projectId/accessibility/captions', A(rateLimit(GEN), idempotent({ required: true })), async (req, reply) => reply.status(202).send(await accessibilityService.generateAnimatedCaptions(uid(req), pid(req), parse(captionsSchema, req.body))));
  app.post('/projects/:projectId/accessibility/audio-description', A(rateLimit(GEN), idempotent({ required: true })), async (req, reply) => reply.status(202).send(await accessibilityService.generateAudioDescription(uid(req), pid(req), parse(adSchema, req.body ?? {}))));
  app.post('/accessibility/assets/:assetId/review', A(rateLimit(GEN), idempotent({ required: true })), async (req) => accessibilityService.reviewAudioDescription(uid(req), parse(uuid, prm(req).assetId), parse(reviewSchema, req.body)));
  app.post('/projects/:projectId/accessibility/transcript', A(rateLimit(EXPORT), idempotent({ required: true })), async (req, reply) => reply.status(201).send(await accessibilityService.exportTranscript(uid(req), pid(req), parse(exportSchema, req.body))));
  app.post('/accessibility/transcripts/verify', A(rateLimit(EXPORT)), async (req) => { const b = parse(z.object({ content: z.string().max(2_000_000), signature: z.string().max(200) }).strict(), req.body); return accessibilityService.verify(uid(req), b.content, b.signature); });
  app.get('/accessibility/assets/:assetId', A(), async (req) => accessibilityService.get(uid(req), parse(uuid, prm(req).assetId)));

  app.get('/teleprompter/sessions', T(), async (req) => teleprompterService.list(uid(req)));
  app.post('/teleprompter/sessions', T(rateLimit(TP), idempotent({ required: true })), async (req, reply) => reply.status(201).send(await teleprompterService.startSession(uid(req), parse(startSchema, req.body))));
  app.get('/teleprompter/sessions/:sessionId', T(), async (req) => teleprompterService.get(uid(req), parse(uuid, prm(req).sessionId)));
  app.delete('/teleprompter/sessions/:sessionId', T(), async (req, reply) => { await teleprompterService.remove(uid(req), parse(uuid, prm(req).sessionId)); return reply.status(204).send(); });
  // envio da gravação: login, flag, limite e OPT-IN conferidos em onRequest — sem opt-in o corpo nem é lido
  app.post('/teleprompter/sessions/:sessionId/recording', { onRequest: [authenticate(), requireJwt, t, rateLimit(TP_UPLOAD), async (req: { headers: Record<string, unknown> }) => { if (req.headers[OPT_IN] !== 'true') throw a11yError(422, 'upload_opt_in_required'); }] as never, preHandler: [requireKey] as never },
    async (req, reply) => reply.status(201).send(await teleprompterService.recordSession(uid(req), parse(uuid, prm(req).sessionId), req.body as Buffer, req.headers[OPT_IN] === 'true')));
}
