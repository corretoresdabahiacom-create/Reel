import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authService } from './auth.service.js';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { LIMITS, rateLimit } from '../../middlewares/rateLimit.js';
import { parse, localeSchema } from '../../utils/validate.js';
import { pool } from '../../db/pool.js';
import { usersRepo, userDto } from '../users/users.repository.js';
import { notFound } from '../../utils/errors.js';
import { authError } from './messages.js';
import { verifyFirebaseIdToken, firebaseEnabled, type FirebaseIdentity } from './firebase.js';
import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { env } from '../../config/env.js';
import { readCookies, serializeCookie } from '../../utils/cookies.js';
import { safeEqual } from '../../utils/crypto.js';
import type { Tokens } from './auth.service.js';

/**
 * P0-1 etapa 3 — sessão do navegador em cookie httpOnly (docs/RFC/2026-10-session-cookie.md).
 * Com `X-Session-Mode: cookie` o refresh vai para o cookie `nx_rt` (HttpOnly/Secure/SameSite=Strict, Path=/api/v1/auth)
 * e sai do corpo; o corpo traz `csrfToken` (double-submit com o cookie `nx_csrf`). Sem o cabeçalho: comportamento de sempre.
 */
const RT = 'nx_rt', CSRF = 'nx_csrf', COOKIE_PATH = '/api/v1/auth';
const cookieBase = () => ({ path: COOKIE_PATH, secure: env.SESSION_COOKIE_SECURE, domain: env.SESSION_COOKIE_DOMAIN || undefined });
const wantsCookie = (req: FastifyRequest) => String(req.headers['x-session-mode'] ?? '').toLowerCase() === 'cookie';
export type SessionTokens = Omit<Tokens, 'refreshToken'> & { refreshToken?: string; csrfToken?: string };
function session(req: FastifyRequest, reply: FastifyReply, t: Tokens, force = false): SessionTokens {
  reply.header('cache-control', 'no-store');
  if (!force && !wantsCookie(req)) return t;
  const csrf = randomBytes(24).toString('base64url');
  reply.header('set-cookie', [serializeCookie(RT, t.refreshToken, { ...cookieBase(), maxAgeSec: env.REFRESH_TTL_SEC }), serializeCookie(CSRF, csrf, { ...cookieBase(), maxAgeSec: env.REFRESH_TTL_SEC })]);
  const { refreshToken: _omit, ...rest } = t; void _omit; return { ...rest, csrfToken: csrf };
}
function clearSession(reply: FastifyReply): void { reply.header('set-cookie', [RT, CSRF].map((n) => serializeCookie(n, '', { ...cookieBase(), maxAgeSec: 0 }))); }
/** Refresh do cookie, exigindo o cabeçalho CSRF igual ao cookie `nx_csrf`. */
function refreshFromCookie(req: FastifyRequest): string {
  const lang = req.headers['accept-language']; const c = readCookies(req.headers.cookie); const rt = c[RT]; if (!rt) throw authError(401, 'session_missing', lang, 'unauthorized');
  const h = req.headers['x-csrf-token']; if (typeof h !== 'string' || !c[CSRF] || !safeEqual(h, c[CSRF]!)) throw authError(403, 'csrf_failed', lang);
  return rt;
}
const bodyToken = (b: unknown) => (b && typeof b === 'object' && 'refreshToken' in b ? parse(z.object({ refreshToken: z.string().min(20) }).passthrough(), b).refreshToken : null);

const pw = z.string().min(10, 'mínimo 10 caracteres').max(128);
const registerBody = z.object({ email: z.string().email().max(254), password: pw.optional(), name: z.string().trim().min(1).max(80), locale: localeSchema.default('pt-BR'), birthDate: z.string().date().optional(), guardianConsent: z.boolean().optional(),
  // Phase 7 (opcionais, nunca obrigatórios): indicação, atribuição, parceiro, país/fuso
  referralCode: z.string().max(20).optional(), clickId: z.string().max(60).optional(), anonId: z.string().max(64).optional(), deviceId: z.string().max(80).optional(), partnerCode: z.string().max(40).optional(),
  country: z.string().length(2).optional(), timezone: z.string().max(60).optional(),
  utm: z.object({ utm_source: z.string().max(80).optional(), utm_medium: z.string().max(80).optional(), utm_campaign: z.string().max(120).optional(), utm_content: z.string().max(120).optional(), utm_term: z.string().max(120).optional(), landing: z.string().max(300).optional(), referrer: z.string().max(300).optional() }).optional() });

// "controllers": adaptam HTTP → service (sem regra de negócio)
const ctl = {
  register: async (b: unknown, ip: string) => { const x = parse(registerBody, b); const { referralCode, clickId, anonId, deviceId, partnerCode, country, timezone, utm, ...base } = x; return authService.register(base, { referralCode, clickId, anonId, deviceId, partnerCode, country, timezone, utm, ip }); },
  login: async (b: unknown) => { const x = parse(z.object({ email: z.string().email(), password: z.string().min(1).max(128), totp: z.string().length(6).optional() }), b); return authService.login(x.email, x.password, x.totp); },
  refresh: async (b: unknown) => authService.refresh(parse(z.object({ refreshToken: z.string().min(20) }), b).refreshToken),
  oauth: async (provider: string, b: unknown) => { const x = parse(z.object({ code: z.string().min(1), redirectUri: z.string().url().optional(), locale: localeSchema.default('pt-BR') }), b); return authService.oauth(parse(z.enum(['google', 'apple', 'meta']), provider), x.code, x.redirectUri, x.locale); },
};

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/auth/register', { preHandler: [rateLimit(LIMITS.auth)] }, async (req, reply) => reply.status(201).send(session(req, reply, await ctl.register(req.body, req.ip))));
  app.post('/auth/login', { preHandler: [rateLimit(LIMITS.auth)] }, async (req, reply) => session(req, reply, await ctl.login(req.body)));
  // corpo com refreshToken = modo de sempre (app nativo); sem corpo = cookie + CSRF
  app.post('/auth/refresh', { preHandler: [rateLimit(LIMITS.auth)] }, async (req, reply) => { const raw = bodyToken(req.body); return raw ? session(req, reply, await authService.refresh(raw)) : session(req, reply, await authService.refresh(refreshFromCookie(req)), true); });
  app.post('/auth/logout', async (req, reply) => { const raw = bodyToken(req.body); if (raw) await authService.logout(raw); else { await authService.logout(refreshFromCookie(req)); clearSession(reply); } return reply.status(204).send(); });
  app.post('/auth/oauth/:provider/callback', { preHandler: [rateLimit(LIMITS.auth)] }, async (req, reply) => session(req, reply, await ctl.oauth((req.params as { provider: string }).provider, req.body)));
  app.post('/auth/firebase', { preHandler: [rateLimit(LIMITS.auth)] }, async (req, reply) => {
    const b = parse(z.object({ idToken: z.string().min(20).max(8192), locale: localeSchema.default('pt-BR') }), req.body); const lang = String(req.headers['accept-language'] ?? '');
    if (!firebaseEnabled()) throw authError(404, 'firebase_disabled', lang, 'not_found');
    let id: FirebaseIdentity; try { id = await verifyFirebaseIdToken(b.idToken); } catch { throw authError(401, 'firebase_invalid_token', lang); }
    if (!id.email || !id.emailVerified) throw authError(403, 'firebase_email_unverified', lang);
    return session(req, reply, await authService.firebase({ uid: id.uid, email: id.email, name: id.name, signInProvider: id.signInProvider }, b.locale));
  });
  app.post('/auth/magic-link', { preHandler: [rateLimit(LIMITS.authSensitive)] }, async (req, reply) => { const b = parse(z.object({ email: z.string().email(), locale: localeSchema.default('pt-BR') }), req.body); await authService.magicLinkRequest(b.email, b.locale); return reply.status(202).send({ sent: true }); });
  app.post('/auth/magic-link/verify', { preHandler: [rateLimit(LIMITS.auth)] }, async (req, reply) => session(req, reply, await authService.magicLinkVerify(parse(z.object({ token: z.string().min(16) }), req.body).token)));
  app.get('/auth/me', { preHandler: [authenticate()] }, async (req) => { const u = await usersRepo.byId(pool, uid(req)); if (!u) throw notFound(); return userDto(u); });
  app.post('/auth/totp/setup', { preHandler: [authenticate(), requireJwt] }, async (req) => authService.totpSetup(uid(req)));
  app.post('/auth/totp/verify', { preHandler: [authenticate(), requireJwt, rateLimit(LIMITS.authSensitive)] }, async (req, reply) => session(req, reply, await authService.totpVerify(uid(req), parse(z.object({ code: z.string().length(6) }), req.body).code)));
  app.post('/auth/logout-all', { preHandler: [authenticate(), requireJwt] }, async (req, reply) => { await authService.logoutAll(uid(req)); return reply.status(204).send(); });
}
