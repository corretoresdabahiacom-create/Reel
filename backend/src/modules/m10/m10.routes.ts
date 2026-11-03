import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { requireM10, requireM10Public, type M10Flag } from './common.js';
import { predictiveInsights } from '../insights/predictiveInsights.js';
import { seriesService, createSchema as seriesCreate, episodeSchema, linkSchema, ctaSchema } from '../series/seriesService.js';
import { authenticityService } from '../authenticity/authenticityService.js';
import { liveCommerceService, createSchema as liveCreate } from '../live/liveCommerceService.js';
import { camel } from '../../utils/case.js';
import type { FastifyRequest as FReq, FastifyReply as FRep } from 'fastify';
/** P0-1 etapa 2: rotas que devolviam linhas cruas do Postgres saem em camelCase (contrato único da API). */
const cam = <R>(h: (req: FReq, reply: FRep) => Promise<R>) => async (req: FReq, reply: FRep) => camel(await h(req, reply));

/** Limites do spec (por usuário, 429) + teto por IP (R13). */
export const SCORE_LIMIT: Limit = { scope: 'insights_score', limit: 60, windowSec: 3600, by: 'user' };
export const LIVE_CREATE_LIMIT: Limit = { scope: 'live_create', limit: 5, windowSec: 3600, by: 'user' };
const SCORE_IP: Limit = { scope: 'insights_score_ip', limit: 180, windowSec: 3600, by: 'ip' };
const LIVE_IP: Limit = { scope: 'live_create_ip', limit: 15, windowSec: 3600, by: 'ip' };
const WRITE: Limit = { scope: 'm10_write', limit: 120, windowSec: 3600, by: 'both' };
const SEAL: Limit = { scope: 'seal_apply', limit: 30, windowSec: 3600, by: 'both' };
const VERIFY_IP: Limit = { scope: 'seal_verify_ip', limit: 30, windowSec: 3600, by: 'ip' };
const WATCH_IP: Limit = { scope: 'live_watch_ip', limit: 600, windowSec: 60, by: 'ip' };
const prm = (r: { params: unknown }) => r.params as Record<string, string>;
const loc = (r: { query: unknown }) => parse(z.object({ locale: z.enum(['pt-BR', 'en', 'es']).optional() }).passthrough(), r.query ?? {}).locale;
export const VERIFY_MAX_BYTES = 100 * 1024 * 1024;

/** Módulo 10 — Insights, séries, selo e live. Cada grupo atrás da sua flag (desligada = 404, antes de validar corpo/limite). */
export async function m10Routes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser('video/mp4', { parseAs: 'buffer', bodyLimit: VERIFY_MAX_BYTES }, (_r, body, done) => done(null, body));
  const flag = (k: M10Flag) => async (req: never) => requireM10(k, uid(req));
  const on = (k: M10Flag, ...extra: unknown[]) => ({ preHandler: [authenticate(), requireJwt, flag(k), ...extra] as never });

  // Insights (ff_insights)
  app.post('/projects/:projectId/insights', on('ff_insights', rateLimit(SCORE_LIMIT), rateLimit(SCORE_IP)), async (req, reply) => reply.status(201).send(await predictiveInsights.scoreEngagement(uid(req), parse(uuid, prm(req).projectId), loc(req))));
  app.get('/projects/:projectId/insights', on('ff_insights'), async (req) => predictiveInsights.list(uid(req), parse(uuid, prm(req).projectId), loc(req)));

  // Séries (ff_series)
  app.get('/series', on('ff_series'), async (req) => seriesService.list(uid(req)));
  app.post('/series', on('ff_series', rateLimit(WRITE), idempotent({ required: true })), async (req, reply) => reply.status(201).send(await seriesService.createSeries(uid(req), parse(seriesCreate, req.body))));
  app.get('/series/:seriesId', on('ff_series'), async (req) => seriesService.get(uid(req), parse(uuid, prm(req).seriesId), loc(req)));
  app.delete('/series/:seriesId', on('ff_series'), async (req, reply) => { await seriesService.remove(uid(req), parse(uuid, prm(req).seriesId)); return reply.status(204).send(); });
  app.post('/series/:seriesId/episodes', on('ff_series', rateLimit(WRITE), idempotent({ required: true })), async (req, reply) => reply.status(201).send(await seriesService.addEpisode(uid(req), parse(uuid, prm(req).seriesId), parse(episodeSchema, req.body), loc(req))));
  app.put('/series/:seriesId/episodes/order', on('ff_series', rateLimit(WRITE)), async (req) => seriesService.linkEpisodes(uid(req), parse(uuid, prm(req).seriesId), parse(linkSchema, req.body).episodeIds, loc(req)));
  app.patch('/series/:seriesId/episodes/:episodeId', on('ff_series', rateLimit(WRITE)), async (req) => seriesService.updateEpisode(uid(req), parse(uuid, prm(req).seriesId), parse(uuid, prm(req).episodeId), parse(ctaSchema, req.body), loc(req)));
  app.delete('/series/:seriesId/episodes/:episodeId', on('ff_series'), async (req) => seriesService.removeEpisode(uid(req), parse(uuid, prm(req).seriesId), parse(uuid, prm(req).episodeId), loc(req)));

  // Selo de autenticidade (ff_seal)
  app.get('/seal/config', on('ff_seal'), async (req) => authenticityService.config(uid(req)));
  app.post('/projects/:projectId/seal', on('ff_seal', rateLimit(SEAL), idempotent({ required: true })), async (req, reply) => reply.status(202).send(await authenticityService.applyC2PA(uid(req), parse(uuid, prm(req).projectId))));
  app.get('/projects/:projectId/seal', on('ff_seal'), async (req) => authenticityService.status(uid(req), parse(uuid, prm(req).projectId)));
  app.get('/projects/:projectId/seal/verify', on('ff_seal'), async (req) => authenticityService.verifyProject(uid(req), parse(uuid, prm(req).projectId)));
  // público: qualquer pessoa confere um MP4 recebido (o manifest é lido dos bytes enviados; nada é guardado)
  app.post('/seal/verify', { onRequest: [async () => requireM10Public('ff_seal'), rateLimit(VERIFY_IP)] as never } /* antes de ler o corpo (até 100 MB) */, async (req) => authenticityService.verifyUpload(req.body as Buffer));

  // Live commerce (ff_live)
  app.get('/live/sessions', on('ff_live'), async (req) => liveCommerceService.list(uid(req)));
  app.post('/live/consent', on('ff_live', rateLimit(WRITE)), async (req, reply) => reply.status(201).send(await liveCommerceService.acceptConsent(uid(req), { ip: req.ip, userAgent: req.headers['user-agent'] })));
  app.delete('/live/consent', on('ff_live'), async (req, reply) => { await liveCommerceService.revokeConsent(uid(req)); return reply.status(204).send(); });
  app.post('/live/sessions', on('ff_live', rateLimit(LIVE_CREATE_LIMIT), rateLimit(LIVE_IP), idempotent({ required: true })), async (req, reply) => reply.status(201).send(await liveCommerceService.createLiveSession(uid(req), parse(liveCreate, req.body))));
  app.get('/live/sessions/:sessionId', on('ff_live'), cam(async (req) => liveCommerceService.get(uid(req), parse(uuid, prm(req).sessionId))));
  app.post('/live/sessions/:sessionId/start', on('ff_live', rateLimit(WRITE), idempotent({ required: true })), async (req) => liveCommerceService.startLive(uid(req), parse(uuid, prm(req).sessionId)));
  app.post('/live/sessions/:sessionId/stop', on('ff_live', rateLimit(WRITE), idempotent({ required: true })), async (req) => liveCommerceService.stopLive(uid(req), parse(uuid, prm(req).sessionId)));
  // público: o que o consumidor vê (rótulo "IA" e aviso sempre presentes)
  app.get('/live/:sessionId/watch', { preHandler: [async () => requireM10Public('ff_live'), rateLimit(WATCH_IP)] as never }, async (req, reply) => { reply.header('cache-control', 'no-store'); return liveCommerceService.watch(parse(uuid, prm(req).sessionId)); });
}
