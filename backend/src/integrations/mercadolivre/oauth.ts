import { env } from '../../config/env.js';
import { api, expires, form, isMock, mockTokens } from '../common.js';
import type { OAuthApi, OAuthTokens } from '../types.js';
/** Mercado Livre: OAuth 2.0 (escopo offline_access p/ refresh). Access token dura 6 h e o refresh_token é de USO ÚNICO (cada refresh devolve um novo). ⚠ Não testado contra a API real. */
const conv = (j: Record<string, any>): OAuthTokens => ({ accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expires(j.expires_in), scope: j.scope, externalUserId: String(j.user_id) });
const tokenCall = (b: Record<string, string>) => api<Record<string, any>>('mercadolivre', 'https://api.mercadolibre.com/oauth/token', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' }, body: form({ client_id: env.MELI_APP_ID, client_secret: env.MELI_CLIENT_SECRET, ...b }) });
export const oauth: OAuthApi = {
  getAuthUrl: (state, c) => `https://auth.mercadolivre.com.br/authorization?${form({ response_type: 'code', client_id: env.MELI_APP_ID, redirect_uri: c.redirectUri, state })}`,
  async exchangeCode(code, c) { if (isMock()) return mockTokens('mercadolivre', code); const t = conv(await tokenCall({ grant_type: 'authorization_code', code, redirect_uri: c.redirectUri })); const me = await api<{ nickname?: string }>('mercadolivre', 'https://api.mercadolibre.com/users/me', { headers: { authorization: `Bearer ${t.accessToken}` } }).catch(() => ({} as { nickname?: string })); return { ...t, handle: me.nickname }; },
  async refreshToken(rt) { if (isMock()) return mockTokens('mercadolivre', 'refreshed'); return conv(await tokenCall({ grant_type: 'refresh_token', refresh_token: rt })); },
  async revokeToken() { /* sem endpoint público de revogação: o usuário remove o app em "Aplicações conectadas" */ },
};
