import { env } from '../../config/env.js';
import { api, expires, form, isMock, mockTokens } from '../common.js';
import type { OAuthApi } from '../types.js';
/** OLX Brasil — API de anúncios (autoupload) restrita a parceiros/integradores. OAuth 2.0 code; URLs via OLX_AUTH_URL / OLX_API_BASE. TODO: confirmar escopos (`basic_user_info autoupload`) e endpoints com a OLX. */
export const oauth: OAuthApi = {
  getAuthUrl: (state, c) => `${env.OLX_AUTH_URL}?${form({ client_id: env.OLX_CLIENT_ID, redirect_uri: c.redirectUri, response_type: 'code', scope: 'basic_user_info autoupload', state })}`,
  async exchangeCode(code, c) { if (isMock()) return mockTokens('olx', code); const j = await api<Record<string, any>>('olx', `${env.OLX_API_BASE}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_id: env.OLX_CLIENT_ID, client_secret: env.OLX_CLIENT_SECRET, code, grant_type: 'authorization_code', redirect_uri: c.redirectUri }) }); return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expires(j.expires_in), scope: j.scope }; },
  async refreshToken(rt) { if (isMock()) return mockTokens('olx', 'refreshed'); const j = await api<Record<string, any>>('olx', `${env.OLX_API_BASE}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_id: env.OLX_CLIENT_ID, client_secret: env.OLX_CLIENT_SECRET, refresh_token: rt, grant_type: 'refresh_token' }) }); return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expires(j.expires_in) }; },
  async revokeToken() { /* TODO */ },
};
