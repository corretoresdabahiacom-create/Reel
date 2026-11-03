import { env } from '../../config/env.js';
import { api, expires, form, isMock, mockTokens } from '../common.js';
import type { OAuthApi } from '../types.js';
/** Instagram API com Instagram Login (conta profissional). Token curto → longo (60 dias); renovação via ig_refresh_token. ⚠ Não testado contra a API real. */
export const oauth: OAuthApi = {
  getAuthUrl: (state, c) => `https://www.instagram.com/oauth/authorize?${form({ client_id: env.INSTAGRAM_APP_ID, redirect_uri: c.redirectUri, response_type: 'code', scope: 'instagram_business_basic,instagram_business_content_publish', state })}`,
  async exchangeCode(code, c) {
    if (isMock()) return mockTokens('instagram', code);
    const short = await api<{ access_token: string; user_id: number }>('instagram', 'https://api.instagram.com/oauth/access_token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_id: env.INSTAGRAM_APP_ID, client_secret: env.INSTAGRAM_APP_SECRET, grant_type: 'authorization_code', redirect_uri: c.redirectUri, code }) });
    const long = await api<{ access_token: string; expires_in: number }>('instagram', `https://graph.instagram.com/access_token?${form({ grant_type: 'ig_exchange_token', client_secret: env.INSTAGRAM_APP_SECRET, access_token: short.access_token })}`);
    const me = await api<{ username?: string }>('instagram', `https://graph.instagram.com/v21.0/me?fields=username&access_token=${long.access_token}`);
    return { accessToken: long.access_token, expiresAt: expires(long.expires_in), externalUserId: String(short.user_id), handle: me.username ? '@' + me.username : undefined };
  },
  async refreshToken(rt) { if (isMock()) return mockTokens('instagram', 'refreshed'); const j = await api<{ access_token: string; expires_in: number }>('instagram', `https://graph.instagram.com/refresh_access_token?${form({ grant_type: 'ig_refresh_token', access_token: rt })}`); return { accessToken: j.access_token, refreshToken: j.access_token, expiresAt: expires(j.expires_in) }; },
  async revokeToken() { /* sem endpoint de revogação; remover o app nas configurações da conta */ },
};
