import { pool, tx } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import { randomToken, sha256, decrypt, encrypt } from '../../utils/crypto.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { newSecret, otpauthUrl, verifyTotp } from '../../utils/totp.js';
import { badRequest, conflict, forbidden, unauthorized, tooMany, unprocessable } from '../../utils/errors.js';
import { usersRepo, userDto, type UserRow } from '../users/users.repository.js';
import { signAccess, invalidateUserState } from '../../middlewares/auth.js';
import { audit } from '../../repositories/audit.js';
import { enqueue, Q } from '../../queues/index.js';
import { randomUUID } from 'node:crypto';
import { growthHooks, type SignupCtx } from '../growth/hooks.js';
import type { Row } from '../../db/rows.generated.js';

export interface Tokens { accessToken: string; refreshToken: string; expiresIn: number; tokenType: 'Bearer'; user: ReturnType<typeof userDto>; mfaRequired?: boolean }
const age = (iso: string) => { const b = new Date(iso); const n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };

async function issue(u: UserRow, tfa: boolean, family?: string, rotatedFrom?: string): Promise<Tokens> {
  const raw = randomToken(48);
  await pool.query('INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, rotated_from) VALUES ($1,$2,$3, now() + ($4 || ' + "' seconds')::interval" + ', $5)', [u.id, family ?? randomUUID(), sha256(raw), String(env.REFRESH_TTL_SEC), rotatedFrom ?? null]);
  const needMfa = u.is_admin && env.ADMIN_REQUIRE_TOTP && !tfa;
  return { accessToken: await signAccess({ sub: u.id, adm: u.is_admin, tfa }), refreshToken: raw, expiresIn: env.ACCESS_TTL_SEC, tokenType: 'Bearer', user: userDto(u), ...(needMfa ? { mfaRequired: true } : {}) };
}

export const authService = {
  async register(p: { email: string; password?: string; name: string; locale: string; birthDate?: string; guardianConsent?: boolean }, growth: SignupCtx = {}): Promise<Tokens> {
    if (p.birthDate) { const a = age(p.birthDate); if (a < 13) throw forbidden('Idade mínima: 13 anos'); if (a < 18 && !p.guardianConsent) throw unprocessable('Menores de 18 exigem consentimento do responsável', { code: 'guardian_required' }); }
    if (await usersRepo.byEmail(pool, p.email)) throw conflict('E-mail já cadastrado', 'email_taken');
    const hash = p.password ? await hashPassword(p.password) : undefined;
    const u = await tx({ system: true }, async (db) => { const x = await usersRepo.create(db, { email: p.email.toLowerCase(), name: p.name, passwordHash: hash, locale: p.locale, birthDate: p.birthDate }); await db.query(`INSERT INTO auth_identities (provider, provider_user_id, user_id, email) VALUES ('password',$1,$2,$1)`, [x.email, x.id]); await audit(db, x.id, 'user.register', 'user', x.id); return x; });
    await growthHooks.onUserRegistered(u.id, { ...growth, method: 'password' }); // atribuição, indicação, parceiro (nunca lança)
    await enqueue(Q.emails, 'welcome', { to: u.email, template: 'welcome', locale: u.locale, vars: { name: u.name } }).catch(() => undefined);
    return issue(u, false);
  },
  async login(email: string, password: string, totp?: string): Promise<Tokens> {
    const lk = `loginfail:${email.toLowerCase()}`; if (Number(await redis.get(lk)) >= 5) throw tooMany('Conta temporariamente bloqueada por tentativas inválidas', 900);
    const u = await usersRepo.byEmail(pool, email); const ok = u?.password_hash ? await verifyPassword(u.password_hash, password) : (await verifyPassword('$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHRzb21lc2FsdA$Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmE', password), false);
    if (!u || !ok) { const n = await redis.incr(lk); if (n === 1) await redis.expire(lk, 900); throw unauthorized('E-mail ou senha inválidos'); }
    if (u.banned) throw forbidden('Conta suspensa');
    await redis.del(lk);
    let tfa = false;
    if (u.totp_enabled && u.totp_secret_enc) { if (!totp) throw unauthorized('Código 2FA obrigatório'); if (!verifyTotp(decrypt(u.totp_secret_enc), totp)) throw unauthorized('Código 2FA inválido'); tfa = true; }
    return issue(u, tfa);
  },
  /** Refresh rotativo com detecção de reuso: reapresentar um token já rotacionado revoga a família inteira. */
  async refresh(raw: string): Promise<Tokens> {
    const h = sha256(raw); const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const r = (await c.query<Row<'refresh_tokens'>>('SELECT * FROM refresh_tokens WHERE token_hash=$1 FOR UPDATE', [h])).rows[0];
      if (!r) { await c.query('ROLLBACK'); throw unauthorized('Refresh token inválido'); }
      if (r.revoked_at) { await c.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, now()) WHERE family_id=$1', [r.family_id]); await c.query('COMMIT'); throw unauthorized('Refresh token reutilizado: sessão encerrada por segurança'); }
      if (new Date(r.expires_at) < new Date()) { await c.query('ROLLBACK'); throw unauthorized('Refresh token expirado'); }
      await c.query('UPDATE refresh_tokens SET revoked_at=now() WHERE id=$1', [r.id]); await c.query('COMMIT');
      const u = await usersRepo.byId(pool, r.user_id); if (!u) throw unauthorized('Conta inexistente'); if (u.banned) throw forbidden('Conta suspensa');
      return issue(u, false, r.family_id, r.id); // admin precisa refazer TOTP no login (tfa=false no refresh)
    } catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
  },
  async logout(raw: string): Promise<void> { const r = (await pool.query<Pick<Row<'refresh_tokens'>, 'family_id'>>('SELECT family_id FROM refresh_tokens WHERE token_hash=$1', [sha256(raw)])).rows[0]; if (r) await pool.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, now()) WHERE family_id=$1', [r.family_id]); },
  async logoutAll(userId: string): Promise<void> { await pool.query('UPDATE refresh_tokens SET revoked_at=COALESCE(revoked_at, now()) WHERE user_id=$1', [userId]); await invalidateUserState(userId); },

  /** Login social. Em MOCK_OAUTH (dev/test) o code é `mock:<email>`. Em produção troca o code no provedor (client_secret só aqui). */
  async oauth(provider: 'google' | 'apple' | 'meta', code: string, redirectUri: string | undefined, locale: string): Promise<Tokens> {
    const id = await profileFromProvider(provider, code, redirectUri);
    const found = (await pool.query<Pick<Row<'auth_identities'>, 'user_id'>>('SELECT user_id FROM auth_identities WHERE provider=$1 AND provider_user_id=$2', [provider, id.sub])).rows[0];
    let u = found ? await usersRepo.byId(pool, found.user_id) : null;
    if (!u) {
      u = await usersRepo.byEmail(pool, id.email);
      if (!u) u = await tx({ system: true }, async (db) => { const x = await usersRepo.create(db, { email: id.email.toLowerCase(), name: id.name, locale }); await audit(db, x.id, 'user.register', 'user', x.id, { provider }); return x; });
      await pool.query('INSERT INTO auth_identities (provider, provider_user_id, user_id, email) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [provider, id.sub, u.id, id.email]);
    }
    if (u.banned) throw forbidden('Conta suspensa');
    return issue(u, false);
  },
  /** Login com Firebase (token já conferido em firebase.ts; e-mail verificado é exigido na rota). Mesmo vínculo do OAuth. */
  async firebase(id: { uid: string; email: string; name: string | null; signInProvider: string }, locale: string): Promise<Tokens> {
    const found = (await pool.query<Pick<Row<'auth_identities'>, 'user_id'>>('SELECT user_id FROM auth_identities WHERE provider=$1 AND provider_user_id=$2', ['firebase', id.uid])).rows[0];
    let u = found ? await usersRepo.byId(pool, found.user_id) : null;
    if (!u) {
      u = await usersRepo.byEmail(pool, id.email); // e-mail verificado pelo Firebase: vincular à conta existente é seguro
      if (!u) u = await tx({ system: true }, async (db) => { const x = await usersRepo.create(db, { email: id.email, name: id.name ?? id.email.split('@')[0]!, locale }); await audit(db, x.id, 'user.register', 'user', x.id, { provider: 'firebase', via: id.signInProvider }); return x; });
      await pool.query('INSERT INTO auth_identities (provider, provider_user_id, user_id, email) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', ['firebase', id.uid, u.id, id.email]);
    }
    if (u.banned) throw forbidden('Conta suspensa');
    return issue(u, false);
  },
  async magicLinkRequest(email: string, locale: string): Promise<void> {
    const t = randomToken(32); await redis.set(`magic:${sha256(t)}`, JSON.stringify({ email: email.toLowerCase(), locale }), 'EX', 900);
    await enqueue(Q.emails, 'magic-link', { to: email, template: 'magic_link', locale, vars: { link: `${env.PUBLIC_APP_URL}/auth/magic?token=${t}` } }).catch(() => undefined);
  },
  async magicLinkVerify(token: string): Promise<Tokens> {
    const k = `magic:${sha256(token)}`; const v = await redis.getdel(k); if (!v) throw unauthorized('Link inválido ou expirado');
    const { email, locale } = JSON.parse(v) as { email: string; locale: string };
    let u = await usersRepo.byEmail(pool, email); if (!u) u = await tx({ system: true }, (db) => usersRepo.create(db, { email, name: email.split('@')[0]!, locale }));
    return issue(u, false);
  },
  async totpSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const u = (await usersRepo.byId(pool, userId))!; if (u.totp_enabled) throw conflict('2FA já ativo'); const s = newSecret();
    await pool.query('UPDATE users SET totp_secret_enc=$2 WHERE id=$1', [userId, encrypt(s)]); return { secret: s, otpauthUrl: otpauthUrl(s, u.email) };
  },
  async totpVerify(userId: string, code: string): Promise<Tokens> {
    const u = (await usersRepo.byId(pool, userId))!; if (!u.totp_secret_enc) throw badRequest('Inicie o setup de 2FA primeiro');
    if (!verifyTotp(decrypt(u.totp_secret_enc), code)) throw unauthorized('Código 2FA inválido');
    await pool.query('UPDATE users SET totp_enabled=true WHERE id=$1', [userId]); await audit(pool, userId, 'user.totp_enabled', 'user', userId);
    return issue({ ...u, totp_enabled: true }, true);
  },
};

async function profileFromProvider(provider: string, code: string, redirectUri?: string): Promise<{ sub: string; email: string; name: string }> {
  if (env.MOCK_OAUTH && code.startsWith('mock:')) { const email = code.slice(5).toLowerCase(); return { sub: `mock-${provider}-${email}`, email, name: email.split('@')[0]! }; }
  const form = (o: Record<string, string>) => new URLSearchParams(o);
  if (provider === 'google') {
    const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', body: form({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri ?? env.OAUTH_REDIRECT_URI, grant_type: 'authorization_code' }) })).json() as { access_token?: string };
    if (!t.access_token) throw unauthorized('Falha ao autenticar com Google');
    const p = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${t.access_token}` } })).json() as { sub: string; email: string; name?: string; email_verified?: boolean };
    if (!p.email_verified) throw unauthorized('E-mail do Google não verificado'); return { sub: p.sub, email: p.email, name: p.name ?? p.email };
  }
  if (provider === 'meta') {
    const t = await (await fetch(`https://graph.facebook.com/v21.0/oauth/access_token?${form({ client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: redirectUri ?? env.OAUTH_REDIRECT_URI, code })}`)).json() as { access_token?: string };
    if (!t.access_token) throw unauthorized('Falha ao autenticar com Meta');
    const p = await (await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${t.access_token}`)).json() as { id: string; email?: string; name: string };
    if (!p.email) throw unauthorized('Conta Meta sem e-mail'); return { sub: p.id, email: p.email, name: p.name };
  }
  // Apple: exige client_secret = JWT ES256 assinado com a chave .p8 do Apple Developer; TODO (precisa de credenciais para validar).
  throw unauthorized(`Provedor ${provider} não configurado neste ambiente`);
}
