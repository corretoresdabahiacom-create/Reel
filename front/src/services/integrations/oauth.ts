import { BACKEND_URL, PLATFORM_CONFIG } from './config';
import { http } from './http';
import { PlatformError, type AuthToken, type Platform, type PlatformConfig } from './types';

/* OAuth 2.0 (authorization code + PKCE).
   Regra de ouro: o client secret e a troca do code por token acontecem no BACKEND (server/index.ts).
   O front só monta a URL de autorização, recebe o code e o repassa ao backend. */

export const base64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomString = (n = 32) => base64url(crypto.getRandomValues(new Uint8Array(n)));

export async function createPkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(48);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

export function buildAuthUrl(cfg: PlatformConfig, state: string, challenge: string): string {
  const u = new URL(cfg.authUrl);
  // TikTok usa "client_key" no lugar de "client_id".
  u.searchParams.set(cfg.platform === 'tiktok' ? 'client_key' : 'client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', cfg.scopes.join(cfg.platform === 'tiktok' ? ',' : ' '));
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  for (const [k, v] of Object.entries(cfg.extraAuthParams ?? {})) u.searchParams.set(k, v);
  return u.toString();
}

interface Pending { verifier: string; createdAt: number }
const memory = new Map<string, Pending>();
const store = {
  set(state: string, p: Pending) { try { sessionStorage.setItem('oauth:' + state, JSON.stringify(p)); } catch { memory.set(state, p); } },
  take(state: string): Pending | undefined {
    try { const raw = sessionStorage.getItem('oauth:' + state); if (raw) { sessionStorage.removeItem('oauth:' + state); return JSON.parse(raw) as Pending; } } catch { /* sem sessionStorage */ }
    const p = memory.get(state); memory.delete(state); return p;
  },
};

export const isExpired = (t: AuthToken, skewMs = 60_000): boolean => Date.now() + skewMs >= t.expiresAt;

/** Passo 1: gera state + PKCE e devolve a URL de autorização. */
export async function startOAuth(platform: Platform): Promise<string> {
  const cfg = PLATFORM_CONFIG[platform];
  const state = `${platform}.${randomString(16)}`;
  const { verifier, challenge } = await createPkce();
  store.set(state, { verifier, createdAt: Date.now() });
  if (cfg.authUrlFromBackend) {
    // Shopee/parceiros: o servidor assina a URL com a chave do parceiro.
    const r = await http<{ url: string }>(`${BACKEND_URL}/api/oauth/${platform}/auth-url`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, redirectUri: cfg.redirectUri }) }, { platform, label: 'auth_url' });
    return r.url;
  }
  return buildAuthUrl(cfg, state, challenge);
}

/** Passo 2: troca o code por token no backend. `callbackUrl` é a URL completa com ?code=...&state=... */
export async function completeOAuth(platform: Platform, callbackUrl: string): Promise<AuthToken> {
  const u = new URL(callbackUrl);
  const state = u.searchParams.get('state') ?? '';
  const code = u.searchParams.get('code');
  const pending = store.take(state);
  if (!pending || !state.startsWith(platform + '.')) throw new PlatformError(platform, 'invalid_state', 'Estado OAuth inválido. Tente conectar novamente.');
  if (Date.now() - pending.createdAt > 10 * 60_000) throw new PlatformError(platform, 'state_expired', 'A autorização expirou. Tente novamente.');
  if (!code) throw new PlatformError(platform, 'access_denied', u.searchParams.get('error_description') ?? 'Autorização negada.');
  return http<AuthToken>(`${BACKEND_URL}/api/oauth/${platform}/token`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, codeVerifier: pending.verifier, redirectUri: PLATFORM_CONFIG[platform].redirectUri, shopId: u.searchParams.get('shop_id') }),
  }, { platform, label: 'token_exchange' });
}

/** Fluxo completo no navegador: abre popup e espera a página /oauth/callback enviar a URL via postMessage. */
export async function connectWithPopup(platform: Platform): Promise<AuthToken> {
  const url = await startOAuth(platform);
  const popup = window.open(url, `oauth-${platform}`, 'width=480,height=720');
  if (!popup) throw new PlatformError(platform, 'popup_blocked', 'O navegador bloqueou a janela de login. Libere pop-ups e tente de novo.');
  return new Promise<AuthToken>((resolve, reject) => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin || ev.data?.type !== 'nexusreel-oauth') return;
      window.removeEventListener('message', onMsg);
      clearInterval(watch);
      completeOAuth(platform, String(ev.data.url)).then(resolve, reject);
    };
    const watch = setInterval(() => { if (popup.closed) { clearInterval(watch); window.removeEventListener('message', onMsg); reject(new PlatformError(platform, 'cancelled', 'Conexão cancelada.')); } }, 500);
    window.addEventListener('message', onMsg);
  });
}
// Página /oauth/callback (no app): window.opener.postMessage({ type: 'nexusreel-oauth', url: location.href }, location.origin); window.close();

/** Renova o token no backend (usa refresh_token + client secret). */
export async function refreshAccessToken(platform: Platform, token: AuthToken): Promise<AuthToken> {
  if (!token.refreshToken) throw new PlatformError(platform, 'no_refresh_token', 'Sessão expirada. Reconecte a conta.');
  return http<AuthToken>(`${BACKEND_URL}/api/oauth/${platform}/refresh`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: token.refreshToken }) }, { platform, label: 'token_refresh' });
}

/** Armazenamento de tokens: implemente no backend com criptografia em repouso (AES-256-GCM, chave no KMS/secret manager). */
export interface TokenStore {
  get(userId: string, platform: Platform): Promise<AuthToken | null>;
  put(userId: string, platform: Platform, token: AuthToken): Promise<void>;
  remove(userId: string, platform: Platform): Promise<void>;
}
