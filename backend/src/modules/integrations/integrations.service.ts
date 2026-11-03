import { createHash } from 'node:crypto';
import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import { INTEGRATIONS } from '../../integrations/index.js';
import type { OAuthTokens } from '../../integrations/types.js';
import { decrypt, encrypt, randomToken } from '../../utils/crypto.js';
import { audit } from '../../repositories/audit.js';
import { badRequest, conflict, notFound, unauthorized } from '../../utils/errors.js';
import { PLATFORMS, type PlatformId } from '../../utils/validate.js';
import { isMock } from '../../integrations/common.js';
import { logger } from '../../observability/logger.js';

export const redirectUriFor = (p: PlatformId) => `${env.PUBLIC_API_URL}/api/v1/integrations/${p}/callback`;
interface AccountRow { id: string; user_id: string; platform: PlatformId; handle: string | null; external_user_id: string | null; access_token_enc: string; refresh_token_enc: string | null; expires_at: string | null; scope: string | null; status: string; created_at: string }
const b64url = (b: Buffer) => b.toString('base64url');

export const integrationsService = {
  async list(userId: string) {
    const rows = (await pool.query<AccountRow>('SELECT * FROM connected_accounts WHERE user_id=$1', [userId])).rows;
    return { appStatus: { tiktokAudited: env.TIKTOK_APP_AUDITED, youtubeVerified: env.YOUTUBE_PROJECT_VERIFIED, mode: env.PLATFORM_MODE },
      items: PLATFORMS.map((p) => { const a = rows.find((r) => r.platform === p); const expired = !!a && !!a.expires_at && new Date(a.expires_at) < new Date() && !a.refresh_token_enc;
        return { platform: p, status: !a ? 'disconnected' : expired ? 'expired' : a.status, handle: a?.handle ?? null, connectedAt: a?.created_at ?? null, expiresAt: a?.expires_at ?? null }; }) };
  },
  /** Inicia o OAuth: guarda `state` (+ PKCE) no Redis e devolve a URL de autorização. O client_secret nunca sai do servidor. */
  async connect(userId: string, platform: PlatformId, opts: { shopId?: string } = {}) {
    const state = randomToken(24); const verifier = randomToken(48); const challenge = b64url(createHash('sha256').update(verifier).digest());
    await redis.set(`oauthstate:${state}`, JSON.stringify({ userId, platform, verifier, shopId: opts.shopId }), 'EX', 600);
    const redirectUri = redirectUriFor(platform);
    const url = isMock() ? `${redirectUri}?code=mock&state=${state}${opts.shopId ? `&shop_id=${opts.shopId}` : ''}` : await INTEGRATIONS[platform].oauth.getAuthUrl(state, { codeChallenge: challenge, redirectUri });
    return { url, state, expiresInSec: 600 };
  },
  async callback(platform: PlatformId, q: { code?: string; state?: string; shop_id?: string; error?: string }) {
    if (q.error) throw badRequest(`Autorização negada: ${q.error}`); if (!q.code || !q.state) throw badRequest('code/state ausentes');
    const raw = await redis.getdel(`oauthstate:${q.state}`); if (!raw) throw unauthorized('state inválido ou expirado');
    const st = JSON.parse(raw) as { userId: string; platform: PlatformId; verifier: string; shopId?: string }; if (st.platform !== platform) throw unauthorized('state de outra plataforma');
    const tok = await INTEGRATIONS[platform].oauth.exchangeCode(q.code, { codeVerifier: st.verifier, redirectUri: redirectUriFor(platform), shopId: q.shop_id ?? st.shopId });
    await this.save(st.userId, platform, tok); await audit(pool, st.userId, 'integration.connect', 'platform', platform); return { userId: st.userId, platform, handle: tok.handle };
  },
  async save(userId: string, platform: PlatformId, t: OAuthTokens) {
    await pool.query(`INSERT INTO connected_accounts (user_id,platform,handle,external_user_id,access_token_enc,refresh_token_enc,expires_at,scope,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'connected')
      ON CONFLICT (user_id,platform) DO UPDATE SET handle=COALESCE(EXCLUDED.handle, connected_accounts.handle), external_user_id=COALESCE(EXCLUDED.external_user_id, connected_accounts.external_user_id), access_token_enc=EXCLUDED.access_token_enc,
      refresh_token_enc=COALESCE(EXCLUDED.refresh_token_enc, connected_accounts.refresh_token_enc), expires_at=EXCLUDED.expires_at, scope=COALESCE(EXCLUDED.scope, connected_accounts.scope), status='connected', updated_at=now()`,
      [userId, platform, t.handle ?? null, t.externalUserId ?? null, encrypt(t.accessToken), t.refreshToken ? encrypt(t.refreshToken) : null, t.expiresAt ?? null, t.scope ?? null]);
  },
  async disconnect(userId: string, platform: PlatformId) {
    const a = (await pool.query<AccountRow>('SELECT * FROM connected_accounts WHERE user_id=$1 AND platform=$2', [userId, platform])).rows[0]; if (!a) throw notFound('Conta não conectada');
    await INTEGRATIONS[platform].oauth.revokeToken(decrypt(a.access_token_enc)).catch((e) => logger.warn({ platform, err: (e as Error).message }, 'revogação falhou (seguindo com remoção local)'));
    await pool.query('DELETE FROM connected_accounts WHERE id=$1', [a.id]); await audit(pool, userId, 'integration.disconnect', 'platform', platform);
  },
  /** Token válido para uso: renova se faltar < 5 min. Lock distribuído evita refresh duplo (ML usa refresh_token de uso único). */
  async freshToken(userId: string, platform: PlatformId): Promise<{ tokens: OAuthTokens; accountId: string }> {
    const a = (await pool.query<AccountRow>('SELECT * FROM connected_accounts WHERE user_id=$1 AND platform=$2', [userId, platform])).rows[0]; if (!a) throw conflict('Conta da plataforma não conectada', 'account_not_connected');
    const cur: OAuthTokens = { accessToken: decrypt(a.access_token_enc), refreshToken: a.refresh_token_enc ? decrypt(a.refresh_token_enc) : undefined, expiresAt: a.expires_at ? new Date(a.expires_at) : undefined, externalUserId: a.external_user_id ?? undefined, handle: a.handle ?? undefined };
    if (!cur.expiresAt || cur.expiresAt.getTime() - Date.now() > 5 * 60_000) return { tokens: cur, accountId: a.id };
    if (!cur.refreshToken) { await pool.query(`UPDATE connected_accounts SET status='expired' WHERE id=$1`, [a.id]); throw conflict('Sessão da plataforma expirada: reconecte a conta', 'account_expired'); }
    const lock = `lock:refresh:${a.id}`; const got = await redis.set(lock, '1', 'EX', 30, 'NX');
    if (!got) { await new Promise((r) => setTimeout(r, 1500)); return this.freshToken(userId, platform); }
    try {
      const n = await INTEGRATIONS[platform].oauth.refreshToken(cur.refreshToken, { externalUserId: cur.externalUserId });
      const merged = { ...n, externalUserId: n.externalUserId ?? cur.externalUserId, refreshToken: n.refreshToken ?? cur.refreshToken }; await this.save(userId, platform, merged); return { tokens: merged, accountId: a.id };
    } catch (e) { await pool.query(`UPDATE connected_accounts SET status='expired' WHERE id=$1`, [a.id]); throw e; } finally { await redis.del(lock); }
  },
  /** Job de manutenção: renova em background tokens que expiram em < 24 h. */
  async refreshExpiring(): Promise<number> {
    const rows = (await pool.query<AccountRow>(`SELECT * FROM connected_accounts WHERE status='connected' AND refresh_token_enc IS NOT NULL AND expires_at < now() + interval '24 hours'`)).rows; let n = 0;
    for (const a of rows) { try { await pool.query(`UPDATE connected_accounts SET expires_at = now() + interval '1 minute' WHERE id=$1`, [a.id]); await this.freshToken(a.user_id, a.platform); n++; } catch (e) { logger.warn({ platform: a.platform, err: (e as Error).message }, 'refresh em background falhou'); } }
    return n;
  },
};
