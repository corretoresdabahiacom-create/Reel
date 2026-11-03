import { env } from '../../config/env.js';
import { api, expires, form, isMock, mockTokens } from '../common.js';
import type { OAuthApi, OAuthTokens } from '../types.js';
/** TikTok Login Kit v2 (PKCE S256). client_secret só aqui. ⚠ Não testado contra a API real (sem credenciais). */
const conv = (j: Record<string, any>): OAuthTokens => ({ accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expires(j.expires_in), scope: j.scope, externalUserId: j.open_id, handle: j.open_id });
export const oauth: OAuthApi = {
  getAuthUrl: (state, c) => `https://www.tiktok.com/v2/auth/authorize/?${form({ client_key: env.TIKTOK_CLIENT_KEY, scope: 'user.info.basic,video.publish', response_type: 'code', redirect_uri: c.redirectUri, state, code_challenge: c.codeChallenge, code_challenge_method: 'S256' })}`,
  async exchangeCode(code, c) { if (isMock()) return mockTokens('tiktok', code); return conv(await api('tiktok', 'https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: c.redirectUri, code_verifier: c.codeVerifier }) })); },
  async refreshToken(rt) { if (isMock()) return mockTokens('tiktok', 'refreshed'); return conv(await api('tiktok', 'https://open.tiktokapis.com/v2/oauth/token/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: rt }) })); },
  async revokeToken(t) { if (isMock()) return; await api('tiktok', 'https://open.tiktokapis.com/v2/oauth/revoke/', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_key: env.TIKTOK_CLIENT_KEY, client_secret: env.TIKTOK_CLIENT_SECRET, token: t }) }); },
};
