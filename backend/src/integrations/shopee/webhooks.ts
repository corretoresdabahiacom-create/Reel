import { env } from '../../config/env.js';
import { hmac } from '../common.js';
import { safeEqual } from '../../utils/crypto.js';
import type { WebhookApi } from '../types.js';
/** Shopee Push: header `Authorization` = HMAC-SHA256(partner_key, push_url + "|" + body). ⚠ Formato conforme doc pública; validar na homologação. */
export const webhooks: WebhookApi = {
  verify(h, raw) { const a = String(h['authorization'] ?? ''); return !!a && safeEqual(hmac(env.SHOPEE_PARTNER_KEY, `${env.PUBLIC_API_URL}/api/v1/integrations/shopee/webhook|${raw.toString()}`), a); },
  parse(b) { const x = b as { code?: number; shop_id?: number; timestamp?: number; data?: { video_upload_id?: string; status?: string } }; if (x.code === undefined) return null; return { eventId: `${x.code}:${x.shop_id}:${x.timestamp}`, type: `push_${x.code}`, externalId: x.data?.video_upload_id, status: x.data?.status === 'SUCCEEDED' ? 'published' : x.data?.status === 'FAILED' ? 'failed' : undefined }; },
};
