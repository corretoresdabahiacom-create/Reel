import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { rateLimit, type Limit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid } from '../../utils/validate.js';
import { AppError } from '../../utils/errors.js';
import { emailShareService, sendBodySchema, batchBodySchema } from './emailShareService.js';
import { shareText } from './messages.js';
import { renderTemplate, t, fmtDate } from './template.js';

// Spec: POST /projects/:id/email → 10/min por usuário e 30/min por IP (dois limites independentes).
const PER_USER: Limit = { scope: 'email_share_u', limit: 10, windowSec: 60, by: 'user' };
const PER_IP: Limit = { scope: 'email_share_ip', limit: 30, windowSec: 60, by: 'ip' };
const OPEN_IP: Limit = { scope: 'share_open', limit: 60, windowSec: 60, by: 'ip' };          // links públicos
const UNLOCK_IP: Limit = { scope: 'share_unlock', limit: 10, windowSec: 60, by: 'ip' };      // tentativas de senha por IP (+5 por link em 15 min)
const prm = (r: { params: unknown }) => r.params as Record<string, string>;
const wantsJson = (req: FastifyRequest) => (req.query as { format?: string }).format === 'json' || !!req.headers.accept?.includes('application/json');
const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

/** Página pública do link (HTML sem script; CSP própria só com estilo inline e formulário para a própria origem). */
function page(reply: FastifyReply, status: number, vars: Record<string, string | boolean | undefined>) {
  return reply.status(status).header('content-security-policy', PAGE_CSP).header('cache-control', 'no-store').header('referrer-policy', 'no-referrer').header('x-robots-tag', 'noindex').type('text/html; charset=utf-8')
    .send(renderTemplate('share-page.html', vars));
}

/**
 * Módulo 7 — Envio por e-mail. Login + `ff_email` (senão 404). Os links públicos `/s/:token` respondem 404 se o HMAC, a
 * validade, a revogação ou a flag do dono não baterem. Registrado antes de `projectsRoutes` (como os Módulos 4–6).
 */
export async function emailShareRoutes(app: FastifyInstance): Promise<void> {
  // formulário de senha da página pública (só neste plugin)
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 4096 }, (_r, body, done) => done(null, Object.fromEntries(new URLSearchParams(String(body)))));
  const r = (...extra: unknown[]) => ({ preHandler: [authenticate(), requireJwt, ...extra] as never });
  app.get('/email-shares/config', r(), async (req) => emailShareService.config(uid(req)));
  app.post('/projects/:projectId/email', r(rateLimit(PER_USER), rateLimit(PER_IP), idempotent({ required: true })), async (req, reply) =>
    reply.status(202).send(await emailShareService.sendEmail(uid(req), parse(uuid, prm(req).projectId), parse(sendBodySchema, req.body))));
  app.post('/catalogs/:catalogId/email', { preHandler: [authenticate('catalogs:read'), rateLimit(PER_USER), rateLimit(PER_IP), idempotent({ required: true })] as never }, async (req, reply) =>
    reply.status(202).send(await emailShareService.sendBatch(uid(req), parse(uuid, prm(req).catalogId), parse(batchBodySchema, req.body))));
  app.get('/email-shares', r(), async (req) => emailShareService.list(uid(req)));
  app.delete('/email-shares/:shareId', r(), async (req, reply) => { await emailShareService.revoke(uid(req), parse(uuid, prm(req).shareId)); return reply.status(204).send(); });

  // ---- públicos (o token É a credencial) ----
  app.get('/s/:token', { preHandler: [rateLimit(OPEN_IP)] }, async (req, reply) => {
    const token = prm(req).token!;
    try {
      const s = await emailShareService.open(token); const i = emailShareService.info(s);
      if (wantsJson(req)) return reply.header('cache-control', 'no-store').send(i);
      const l = s.locale;
      return page(reply, 200, { lang: l, title: t(l, 'title'), heading: t(l, 'heading', { name: s.sender_name }), fileName: s.file_name ?? '', expires: t(l, 'expired', { date: fmtDate(new Date(s.expires_at), l) }),
        message: s.message, needsPassword: i.needsPassword, direct: !i.needsPassword, action: `/api/v1/s/${token}/download`, button: t(l, s.asset_kind === 'zip' ? 'buttonZip' : 'button'), passwordLabel: t(l, 'passwordLabel') });
    } catch (e) {
      if (wantsJson(req) || !(e instanceof AppError)) throw e;
      return page(reply, e.status, { lang: 'pt-BR', title: 'NexusReel', heading: shareText('link_invalid', 'pt-BR'), fileName: '', expires: '' });
    }
  });
  const download = async (req: FastifyRequest, reply: FastifyReply) => {
    const token = prm(req).token!; const pw = (req.body as { password?: string } | undefined)?.password;
    try {
      const { url } = await emailShareService.download(token, typeof pw === 'string' ? pw : undefined);
      if (wantsJson(req)) return reply.header('cache-control', 'no-store').send({ url, expiresInSec: 300 });
      return reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer').redirect(url, 303);
    } catch (e) {
      if (wantsJson(req) || !(e instanceof AppError)) throw e;
      const s = await emailShareService.open(token).catch(() => null); const l = s?.locale ?? 'pt-BR';
      return page(reply, e.status, { lang: l, title: t(l, 'title'), heading: s ? t(l, 'heading', { name: s.sender_name }) : shareText('link_invalid', l), fileName: s?.file_name ?? '', expires: '',
        error: shareText((e.code === 'wrong_password' || e.code === 'too_many_attempts' ? e.code : 'link_invalid') as 'wrong_password', l), needsPassword: !!s?.password_hash, action: `/api/v1/s/${token}/download`,
        button: t(l, 'button'), passwordLabel: t(l, 'passwordLabel') });
    }
  };
  app.get('/s/:token/download', { preHandler: [rateLimit(OPEN_IP)] }, download);
  app.post('/s/:token/download', { preHandler: [rateLimit(UNLOCK_IP)] }, download);
}
