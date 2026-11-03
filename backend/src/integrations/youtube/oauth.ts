import { env } from '../../config/env.js';
import { api, expires, form, isMock, mockTokens } from '../common.js';
import type { OAuthApi, OAuthTokens } from '../types.js';
/** Google OAuth 2.0 (escopo youtube.upload). `access_type=offline&prompt=consent` para receber refresh_token. ⚠ Não testado contra a API real. */
const conv = (j: Record<string, any>, keepRt?: string): OAuthTokens => ({ accessToken: j.access_token, refreshToken: j.refresh_token ?? keepRt, expiresAt: expires(j.expires_in), scope: j.scope });
export const oauth: OAuthApi = {
  getAuthUrl: (state, c) => `https://accounts.google.com/o/oauth2/v2/auth?${form({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: c.redirectUri, response_type: 'code', scope: 'https://www.googleapis.com/auth/youtube.upload', access_type: 'offline', prompt: 'consent', state, include_granted_scopes: 'true' })}`,
  async exchangeCode(code, c) { if (isMock()) return mockTokens('youtube', code); return conv(await api('youtube', 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: c.redirectUri, grant_type: 'authorization_code' }) })); },
  async refreshToken(rt) { if (isMock()) return mockTokens('youtube', 'refreshed'); return conv(await api('youtube', 'https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, refresh_token: rt, grant_type: 'refresh_token' }) }), rt); },
  async revokeToken(t) { if (isMock()) return; await api('youtube', 'https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ token: t }) }); },
};
