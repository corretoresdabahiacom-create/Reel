import { env } from '../../config/env.js';
import { api, expires, form, isMock, mockTokens } from '../common.js';
import type { OAuthApi } from '../types.js';
/**
 * Temu Seller/Partner API — acesso RESTRITO a parceiros. URLs vêm de TEMU_AUTH_URL / TEMU_API_BASE (config) e o fluxo abaixo assume OAuth 2.0 code.
 * TODO (bloqueado por credenciais/documentação de parceiro): confirmar endpoints, escopos e assinatura de requisições antes de ligar PLATFORM_MODE=real.
 */
export const oauth: OAuthApi = {
  getAuthUrl: (state, c) => `${env.TEMU_AUTH_URL}?${form({ app_key: env.TEMU_APP_KEY, redirect_uri: c.redirectUri, state, response_type: 'code' })}`,
  async exchangeCode(code, c) { if (isMock()) return mockTokens('temu', code); const j = await api<Record<string, any>>('temu', `${env.TEMU_API_BASE}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ app_key: env.TEMU_APP_KEY, app_secret: env.TEMU_APP_SECRET, code, grant_type: 'authorization_code', redirect_uri: c.redirectUri }) }); return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expires(j.expires_in), externalUserId: j.seller_id }; },
  async refreshToken(rt) { if (isMock()) return mockTokens('temu', 'refreshed'); const j = await api<Record<string, any>>('temu', `${env.TEMU_API_BASE}/oauth/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form({ app_key: env.TEMU_APP_KEY, app_secret: env.TEMU_APP_SECRET, refresh_token: rt, grant_type: 'refresh_token' }) }); return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expires(j.expires_in) }; },
  async revokeToken() { /* TODO: confirmar endpoint de revogação */ },
};
