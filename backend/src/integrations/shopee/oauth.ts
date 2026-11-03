import { env } from '../../config/env.js';
import { api, expires, hmac, isMock, mockTokens } from '../common.js';
import type { OAuthApi } from '../types.js';
/**
 * Shopee Open Platform v2. A URL de autorização é ASSINADA: sign = HMAC-SHA256(partner_key, partner_id + path + timestamp).
 * Autorização é por LOJA (shop_id volta no callback). Tokens: access ~4h, refresh ~30 dias. ⚠ Não testado contra a API real (requer parceria aprovada).
 */
const BASE = 'https://partner.shopeemobile.com';
const sign = (path: string, ts: number, extra = '') => hmac(env.SHOPEE_PARTNER_KEY, `${env.SHOPEE_PARTNER_ID}${path}${ts}${extra}`);
export const oauth: OAuthApi = {
  getAuthUrl(_state, c) { const path = '/api/v2/shop/auth_partner'; const ts = Math.floor(Date.now() / 1000); return `${BASE}${path}?partner_id=${env.SHOPEE_PARTNER_ID}&timestamp=${ts}&sign=${sign(path, ts)}&redirect=${encodeURIComponent(c.redirectUri + (c.redirectUri.includes('?') ? '&' : '?') + 'state=' + _state)}`; },
  async exchangeCode(code, c) {
    if (isMock()) return mockTokens('shopee', code); const path = '/api/v2/auth/token/get'; const ts = Math.floor(Date.now() / 1000);
    const j = await api<{ access_token: string; refresh_token: string; expire_in: number; error?: string; message?: string }>('shopee', `${BASE}${path}?partner_id=${env.SHOPEE_PARTNER_ID}&timestamp=${ts}&sign=${sign(path, ts)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, shop_id: Number(c.shopId), partner_id: Number(env.SHOPEE_PARTNER_ID) }) });
    return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expires(j.expire_in), externalUserId: c.shopId, handle: `shop ${c.shopId}` };
  },
  async refreshToken(rt, c) {
    if (isMock()) return mockTokens('shopee', 'refreshed'); const path = '/api/v2/auth/access_token/get'; const ts = Math.floor(Date.now() / 1000);
    const j = await api<{ access_token: string; refresh_token: string; expire_in: number }>('shopee', `${BASE}${path}?partner_id=${env.SHOPEE_PARTNER_ID}&timestamp=${ts}&sign=${sign(path, ts)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: rt, shop_id: Number(c?.externalUserId), partner_id: Number(env.SHOPEE_PARTNER_ID) }) });
    return { accessToken: j.access_token, refreshToken: j.refresh_token, expiresAt: expires(j.expire_in), externalUserId: c?.externalUserId };
  },
  async revokeToken() { /* Shopee: cancelar autorização na Open Platform (cancel_auth); TODO */ },
};
export const shopSign = (path: string, ts: number, accessToken: string, shopId: string) => sign(path, ts, `${accessToken}${shopId}`);
