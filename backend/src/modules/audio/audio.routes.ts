import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, LIMITS, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { env } from '../../config/env.js';
import { audioService, requireAudio } from './audio.service.js';
import { voiceClone } from './voiceClone.js';
import { mixBodySchema } from './types.js';

/** R13: limites por usuário E por IP nos endpoints sensíveis (consentimento de voz, clonagem, geração e mixagem). */
const L = {
  voice: { scope: 'audio_voice', limit: 10, windowSec: 3600, by: 'both' } as Limit,
  generate: { scope: 'audio_gen', limit: 20, windowSec: 3600, by: 'both' } as Limit,
  mix: { scope: 'audio_mix', limit: 30, windowSec: 3600, by: 'both' } as Limit,
};
const tracksQuery = z.object({ mood: z.string().max(30).optional(), genre: z.string().max(30).optional(), bpmMin: z.coerce.number().int().min(40).max(220).optional(), bpmMax: z.coerce.number().int().min(40).max(220).optional(),
  maxDurationSec: z.coerce.number().int().min(5).max(600).optional(), minDurationSec: z.coerce.number().int().min(5).max(600).optional(), limit: z.coerce.number().int().min(1).max(100).optional() });
const generateBody = z.object({ prompt: z.string().trim().min(3).max(200), durationSec: z.number().int().min(5).max(60).default(30) }).strict();
const AUDIO_TYPES = ['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/x-m4a'];
const p = (r: { params: unknown }) => r.params as { id: string; versionId?: string; consentId?: string };

/**
 * Módulo 1 — Áudio. Todas as rotas exigem login e `ff_audio` ligada para o usuário (senão 404: com a flag desligada
 * o app se comporta exatamente como antes). POSTs que criam valor exigem `Idempotency-Key` (R12).
 */
export async function audioRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(AUDIO_TYPES, { parseAs: 'buffer', bodyLimit: env.VOICE_SAMPLE_MAX_BYTES + 1024 }, (_r, body, done) => done(null, body));
  const auth = [authenticate(), requireJwt];
  const r = (...extra: unknown[]) => ({ preHandler: [...auth, ...extra] as never });

  app.get('/audio/config', r(), async (req) => audioService.config(uid(req)));
  app.get('/audio/tracks', r(), async (req) => audioService.tracks(uid(req), parse(tracksQuery, req.query)));
  app.get('/audio/tracks/:id/preview', r(), async (req) => audioService.previewUrl(uid(req), parse(uuid, p(req).id)));
  app.post('/audio/tracks/generate', r(rateLimit(L.generate), idempotent({ required: true })), async (req, reply) => { const b = parse(generateBody, req.body); return reply.status(201).send(await audioService.generate(uid(req), b.prompt, b.durationSec)); });

  app.post('/projects/:id/audio/sfx-suggestions', r(rateLimit(LIMITS.generation)), async (req) => audioService.suggestSfx(uid(req), parse(uuid, p(req).id)));
  app.post('/projects/:id/audio/mix', r(rateLimit(L.mix), idempotent({ required: true })), async (req, reply) => reply.status(202).send(await audioService.requestMix(uid(req), parse(uuid, p(req).id), parse(mixBodySchema, req.body))));
  app.get('/projects/:id/audio/versions', r(), async (req) => audioService.versions(uid(req), parse(uuid, p(req).id)));
  app.post('/projects/:id/audio/versions/:versionId/activate', r(rateLimit(LIMITS.write)), async (req) => audioService.activate(uid(req), parse(uuid, p(req).id), parse(uuid, p(req).versionId)));
  app.post('/projects/:id/audio/revert', r(rateLimit(LIMITS.write)), async (req) => audioService.revert(uid(req), parse(uuid, p(req).id)));

  // Voz clonada: consentimento → amostra → verificação → clonagem. Revogar apaga amostra e modelos.
  app.get('/audio/voice/consents', r(), async (req) => { await requireAudio(uid(req)); return { items: await voiceClone.list(uid(req)) }; });
  app.post('/audio/voice/consents', r(rateLimit(L.voice), idempotent({ required: true })), async (req, reply) => { const u = await requireAudio(uid(req)); return reply.status(201).send(await voiceClone.requestConsent(uid(req), { ip: req.ip, userAgent: String(req.headers['user-agent'] ?? ''), locale: u.locale })); });
  app.put('/audio/voice/consents/:consentId/sample', r(rateLimit(L.voice)), async (req, reply) => {
    await requireAudio(uid(req)); const body = req.body; if (!Buffer.isBuffer(body)) return reply.status(415).send({ code: 'unsupported_media_type', message: `Envie o áudio cru (${AUDIO_TYPES.slice(0, 4).join(', ')}…)` });
    return reply.status(201).send(await voiceClone.uploadConsentSample(uid(req), parse(uuid, p(req).consentId), body));
  });
  app.post('/audio/voice/consents/:consentId/verify', r(rateLimit(L.voice)), async (req) => { await requireAudio(uid(req)); return voiceClone.verifyConsent(uid(req), parse(uuid, p(req).consentId)); });
  app.post('/audio/voice/clone', r(rateLimit(L.voice), idempotent({ required: true })), async (req, reply) => { await requireAudio(uid(req)); const b = parse(z.object({ consentId: z.string().uuid() }).strict(), req.body); return reply.status(201).send(await voiceClone.cloneVoice(uid(req), b.consentId)); });
  app.delete('/audio/voice/consents/:consentId', r(rateLimit(L.voice)), async (req) => { await requireAudio(uid(req)); return voiceClone.revoke(uid(req), parse(uuid, p(req).consentId)); });
}
