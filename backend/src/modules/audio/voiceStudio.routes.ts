import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, LIMITS, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { env } from '../../config/env.js';
import { voiceStudio, audioSettingsSchema } from './voiceStudio.js';
import { COMPOSER_MOODS } from './composer.js';
import { audioError } from './messages.js';

/** Limites por usuário E IP: síntese e gravação gastam CPU do servidor gratuito. */
const L = {
  tts: { scope: 'studio_tts', limit: 40, windowSec: 3600, by: 'both' } as Limit,
  rec: { scope: 'studio_rec', limit: 30, windowSec: 3600, by: 'both' } as Limit,
  music: { scope: 'studio_music', limit: 20, windowSec: 3600, by: 'both' } as Limit,
};
/** Formatos do MediaRecorder (Chrome/Firefox: webm/ogg + opus; Safari/iPhone: mp4/aac) e arquivos comuns. */
const AUDIO_IN = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/x-m4a', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/wave', 'video/webm', 'video/mp4', 'application/octet-stream'];
const ttsBody = z.object({ text: z.string().trim().min(1).max(2000), locale: z.string().min(2).max(10).default('pt-BR'), voiceId: z.string().max(80).optional(), gender: z.enum(['female', 'male']).optional() }).strict();

/**
 * Estúdio de voz (ff_voice_studio; desligada → 404 em tudo). Vozes abertas, texto → voz, gravação da narração,
 * música (composta pelo app, enviada pelo usuário ou da biblioteca) e as escolhas de áudio do projeto.
 */
export async function voiceStudioRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser(AUDIO_IN, { parseAs: 'buffer', bodyLimit: Math.max(env.RECORDING_MAX_BYTES, env.MUSIC_UPLOAD_MAX_BYTES) + 1024 }, (_r, body, done) => done(null, body));
  const auth = [authenticate(), requireJwt];
  const r = (...extra: unknown[]) => ({ preHandler: [...auth, ...extra] as never });
  const id = (req: { params: unknown }) => parse(uuid, (req.params as { id: string }).id);

  app.get('/audio/studio/voices', r(), async (req) => voiceStudio.voices(uid(req), parse(z.object({ locale: z.string().max(10).optional() }), req.query).locale));
  app.post('/audio/studio/tts', r(rateLimit(L.tts)), async (req, reply) => reply.status(201).send(await voiceStudio.tts(uid(req), parse(ttsBody, req.body))));

  app.post('/audio/studio/recordings', r(rateLimit(L.rec)), async (req, reply) => {
    const q = parse(z.object({ projectId: z.string().uuid().optional() }), req.query);
    if (!Buffer.isBuffer(req.body)) throw audioError(415, 'audio_format_unsupported', undefined, 'unsupported_media_type');
    return reply.status(201).send(await voiceStudio.uploadRecording(uid(req), req.body, q.projectId));
  });
  app.get('/audio/studio/recordings', r(), async (req) => voiceStudio.recordings(uid(req)));
  app.delete('/audio/studio/recordings/:id', r(rateLimit(LIMITS.write)), async (req) => voiceStudio.deleteRecording(uid(req), id(req)));

  app.get('/audio/studio/tracks', r(), async (req) => voiceStudio.tracks(uid(req), parse(z.object({ mood: z.string().max(30).optional() }), req.query).mood));
  app.get('/audio/studio/tracks/:id/preview', r(), async (req) => voiceStudio.trackPreview(uid(req), id(req)));
  app.post('/audio/studio/tracks/compose', r(rateLimit(L.music), idempotent({ required: true })), async (req, reply) => {
    const b = parse(z.object({ mood: z.enum(COMPOSER_MOODS as [string, ...string[]]), durationSec: z.number().int().min(10).max(120).default(60) }).strict(), req.body);
    return reply.status(201).send(await voiceStudio.composeTrack(uid(req), b.mood, b.durationSec));
  });
  app.post('/audio/studio/tracks/upload', r(rateLimit(L.music)), async (req, reply) => {
    const q = parse(z.object({ title: z.string().max(120).optional(), rights: z.string().max(20).optional() }), req.query);
    if (!Buffer.isBuffer(req.body)) throw audioError(415, 'audio_format_unsupported', undefined, 'unsupported_media_type');
    return reply.status(201).send(await voiceStudio.uploadMusic(uid(req), req.body, q));
  });

  app.get('/projects/:id/audio-settings', r(), async (req) => voiceStudio.projectAudio(uid(req), id(req)));
  app.put('/projects/:id/audio-settings', r(rateLimit(LIMITS.write)), async (req) => voiceStudio.setProjectAudio(uid(req), id(req), parse(audioSettingsSchema, req.body)));
}
