import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../utils/errors.js';
import { sha256 } from '../utils/crypto.js';
import { pool } from '../db/pool.js';
import { redis } from '../db/redis.js';
import { residencyService } from '../modules/residency/residency.js';
import type { AuthCtx } from './context.js';
import { bindDbUser, systemScope } from '../db/context.js';
import type { Row } from '../db/rows.generated.js';

const secret = () => new TextEncoder().encode(env.JWT_SECRET);
export interface AccessClaims { sub: string; adm: boolean; tfa?: boolean }
export async function signAccess(c: AccessClaims): Promise<string> {
  return new SignJWT({ adm: c.adm, tfa: !!c.tfa }).setProtectedHeader({ alg: 'HS256' }).setSubject(c.sub).setIssuer(env.JWT_ISSUER).setAudience('nexusreel-api')
    .setIssuedAt().setExpirationTime(`${env.ACCESS_TTL_SEC}s`).sign(secret());
}
export async function verifyAccess(token: string): Promise<AccessClaims> {
  try { const { payload } = await jwtVerify(token, secret(), { issuer: env.JWT_ISSUER, audience: 'nexusreel-api', algorithms: ['HS256'] }); return { sub: String(payload.sub), adm: !!payload.adm, tfa: !!payload.tfa }; }
  catch { throw unauthorized('Token inválido ou expirado'); }
}
/** Estado do usuário (banido/apagado) em cache curto no Redis; invalidado em ban/exclusão. */
export async function userState(id: string): Promise<{ banned: boolean; deleted: boolean; isAdmin: boolean } | null> {
  const k = `ustate:${id}`; const c = await redis.get(k).catch(() => null);
  if (c) return JSON.parse(c);
  const r = await systemScope('auth: estado da conta antes de identificar a requisição', () => pool.query<{ banned: boolean; deleted: boolean; is_admin: boolean }>('SELECT banned, deleted_at IS NOT NULL AS deleted, is_admin FROM users WHERE id=$1', [id]));
  if (!r.rows[0]) return null;
  const v = { banned: r.rows[0].banned, deleted: r.rows[0].deleted, isAdmin: r.rows[0].is_admin };
  await redis.set(k, JSON.stringify(v), 'EX', 30).catch(() => undefined); return v;
}
export const invalidateUserState = (id: string) => redis.del(`ustate:${id}`).catch(() => undefined);

async function fromRequest(req: FastifyRequest): Promise<AuthCtx> {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) throw unauthorized();
  const tok = h.slice(7);
  if (tok.startsWith('nxr_')) { // API key B2B
    const r = await systemScope('auth: resolver API key pelo hash', () => pool.query<Pick<Row<'api_keys'>, 'id' | 'user_id' | 'scopes'>>('SELECT id, user_id, scopes FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL', [sha256(tok)]));
    if (!r.rows[0]) throw unauthorized('API key inválida');
    void systemScope('auth: last_used_at da API key', () => pool.query('UPDATE api_keys SET last_used_at=now() WHERE id=$1', [r.rows[0].id])).catch(() => undefined);
    const st = await userState(r.rows[0].user_id); if (!st || st.banned || st.deleted) throw forbidden('Conta indisponível');
    return { userId: r.rows[0].user_id, isAdmin: false, via: 'apikey', scopes: r.rows[0].scopes };
  }
  const c = await verifyAccess(tok);
  const st = await userState(c.sub); if (!st || st.deleted) throw unauthorized('Conta inexistente'); if (st.banned) throw forbidden('Conta suspensa');
  return { userId: c.sub, isAdmin: st.isAdmin && c.adm, via: 'jwt', scopes: ['*'], tfa: c.tfa };
}
/** Exige autenticação. `scope` restringe API keys (JWT de usuário tem '*'). */
export const authenticate = (scope?: string): preHandlerAsyncHookHandler => async (req) => {
  req.auth = await fromRequest(req); bindDbUser(req.auth.userId, req.auth.isAdmin);
  if (scope && !req.auth.scopes.includes('*') && !req.auth.scopes.includes(scope)) throw forbidden(`Escopo exigido: ${scope}`);
  if (req.auth.via === 'jwt') touchLastSeen(req.auth.userId);
  if (process.env.DEPLOY_REGION && process.env.DEPLOY_REGION !== 'global') await residencyService.assertServedHere(req.auth.userId); // Fase 8: residência de dados por deployment regional
};
/** Atualiza users.last_seen_at no máximo 1×/hora por usuário (barato: SET NX no Redis), sem bloquear a requisição. */
function touchLastSeen(userId: string): void {
  void (async () => {
    try { if (await redis.set(`seen:${userId}`, '1', 'EX', 3600, 'NX')) await pool.query('UPDATE users SET last_seen_at=now() WHERE id=$1', [userId]); } catch { /* telemetria nunca derruba a requisição */ }
  })();
}
export const requireJwt: preHandlerAsyncHookHandler = async (req) => { if (req.auth?.via !== 'jwt') throw forbidden('Esta rota exige login de usuário (não API key)'); };
/** Admin: is_admin + (se ADMIN_REQUIRE_TOTP) sessão que passou pelo TOTP. */
export const requireAdmin: preHandlerAsyncHookHandler = async (req) => {
  req.auth = await fromRequest(req);
  if (!req.auth.isAdmin) { bindDbUser(req.auth.userId, false); throw forbidden('Apenas administradores'); }
  if (env.ADMIN_REQUIRE_TOTP && !req.auth.tfa) { bindDbUser(req.auth.userId, false); throw forbidden('Admin exige 2FA (TOTP): faça login informando o código'); }
  bindDbUser(req.auth.userId, true);
};
/**
 * Autenticação OPCIONAL (vitrine, preços, flags): JWT válido de conta ativa → a requisição passa a consultar o banco
 * como esse usuário; sem token/token inválido → segue anônima. Nunca lança.
 */
export async function optionalAuth(req: { headers: Record<string, unknown> }): Promise<string | null> {
  const h = String(req.headers.authorization ?? ''); if (!h.startsWith('Bearer ') || h.startsWith('Bearer nxr_')) return null;
  try { const c = await verifyAccess(h.slice(7)); const st = await userState(c.sub); if (!st || st.deleted || st.banned) return null; bindDbUser(c.sub, false); return c.sub; } catch { return null; }
}
export const uid = (req: FastifyRequest): string => { if (!req.auth) throw unauthorized(); return req.auth.userId; };
