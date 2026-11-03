import type { Platform, PlatformConfig } from './types';

/** Lê variável de ambiente no Node (process.env) ou no Vite (import.meta.env.VITE_*). */
const read = (key: string): string | undefined => {
  const fromNode = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  const viteEnv = (import.meta as unknown as { env?: Record<string, string> }).env;
  return fromNode ?? viteEnv?.[`VITE_${key}`];
};

/** Alterna entre mock e APIs reais. Padrão: mock. */
export const USE_REAL_APIS = read('USE_REAL_APIS') === 'true';
export const BACKEND_URL = read('BACKEND_URL') ?? 'http://localhost:8787';
const REDIRECT = read('OAUTH_REDIRECT_URI') ?? 'http://localhost:5173/oauth/callback';

/** Estado de aprovação dos apps. Enquanto false, a plataforma restringe o que o app pode fazer. */
export const APP_STATUS = {
  // TikTok: apps não auditados só postam em modo privado (privacy_level SELF_ONLY).
  tiktokAudited: read('TIKTOK_APP_AUDITED') === 'true',
  // YouTube: projetos de API não verificados enviam vídeos como privados.
  youtubeVerified: read('YOUTUBE_PROJECT_VERIFIED') === 'true',
};

/** Só dados públicos aqui. Secrets (CLIENT_SECRET, PARTNER_KEY) são lidos exclusivamente em /server. */
export const PLATFORM_CONFIG: Record<Platform, PlatformConfig> = {
  tiktok: {
    platform: 'tiktok', clientId: read('TIKTOK_CLIENT_KEY') ?? '', scopes: ['user.info.basic', 'video.publish'], redirectUri: REDIRECT,
    apiVersion: 'v2', authUrl: 'https://www.tiktok.com/v2/auth/authorize/', apiBase: 'https://open.tiktokapis.com',
  },
  youtube: {
    platform: 'youtube', clientId: read('GOOGLE_CLIENT_ID') ?? '', scopes: ['https://www.googleapis.com/auth/youtube.upload'], redirectUri: REDIRECT,
    apiVersion: 'v3', authUrl: 'https://accounts.google.com/o/oauth2/v2/auth', apiBase: 'https://www.googleapis.com',
    extraAuthParams: { access_type: 'offline', prompt: 'consent' }, // necessário para receber refresh_token
  },
  instagram: {
    platform: 'instagram', clientId: read('INSTAGRAM_APP_ID') ?? '', scopes: ['instagram_business_basic', 'instagram_business_content_publish'], redirectUri: REDIRECT,
    apiVersion: 'v21.0', authUrl: 'https://www.instagram.com/oauth/authorize', apiBase: 'https://graph.instagram.com',
  },
  shopee: {
    platform: 'shopee', clientId: read('SHOPEE_PARTNER_ID') ?? '', scopes: [], redirectUri: REDIRECT,
    apiVersion: 'v2', authUrl: 'https://partner.shopeemobile.com/api/v2/shop/auth_partner', apiBase: 'https://partner.shopeemobile.com',
    authUrlFromBackend: true, // a URL de autorização leva assinatura HMAC com o partner key
  },
  temu: {
    platform: 'temu', clientId: read('TEMU_APP_KEY') ?? '', scopes: [], redirectUri: REDIRECT,
    apiVersion: 'v1', authUrl: read('TEMU_AUTH_URL') ?? '', apiBase: read('TEMU_API_BASE') ?? '',
    authUrlFromBackend: true, // TODO: confirmar fluxo na documentação do parceiro Temu
  },
  olx: {
    platform: 'olx', clientId: read('OLX_CLIENT_ID') ?? '', scopes: ['basic_user_info', 'autoupload'], redirectUri: REDIRECT,
    apiVersion: 'v1', authUrl: read('OLX_AUTH_URL') ?? '', apiBase: read('OLX_API_BASE') ?? '',
    authUrlFromBackend: true, // TODO: API de anúncios da OLX é restrita a parceiros; confirmar escopos e URLs
  },
  mercadolivre: {
    platform: 'mercadolivre', clientId: read('MELI_APP_ID') ?? '', scopes: ['offline_access', 'read', 'write'], redirectUri: REDIRECT,
    apiVersion: 'v1', authUrl: 'https://auth.mercadolivre.com.br/authorization', apiBase: 'https://api.mercadolibre.com',
  },
};
