import { createHmac } from 'node:crypto';
import { env } from '../../config/env.js';
import { safeEqual } from '../../utils/crypto.js';
import type { WebhookApi } from '../types.js';
/** Webhooks do TikTok: header `TikTok-Signature: t=<ts>,s=<hmac_sha256(client_secret, "ts.body")>`. Idempotência por event_id no chamador. */
export const webhooks: WebhookApi = {
  verify(h, raw) { const sig = String(h['tiktok-signature'] ?? ''); const t = /t=(\d+)/.exec(sig)?.[1], s = /s=([a-f0-9]+)/.exec(sig)?.[1]; if (!t || !s || Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
    return safeEqual(createHmac('sha256', env.TIKTOK_CLIENT_SECRET).update(`${t}.${raw.toString()}`).digest('hex'), s); },
  parse(b) { const x = b as { client_key?: string; event?: string; create_time?: number; user_openid?: string; content?: string }; if (!x.event) return null; let c: { publish_id?: string } = {}; try { c = JSON.parse(x.content ?? '{}'); } catch { /* */ }
    return { eventId: `${x.event}:${x.create_time}:${c.publish_id ?? x.user_openid}`, type: x.event, externalId: c.publish_id, status: x.event === 'post.publish.complete' ? 'published' : x.event === 'post.publish.failed' ? 'failed' : undefined }; },
};
