import { env } from '../../config/env.js';
import { hmac } from '../common.js';
import { safeEqual } from '../../utils/crypto.js';
import type { WebhookApi } from '../types.js';
/** Notificações do Mercado Livre não trazem assinatura HMAC padrão; aceitamos apenas com segredo compartilhado no path/header configurado (x-nexus-signature = HMAC(secret, body)) — configure um proxy/URL secreta no painel da app. TODO: confirmar mecanismo atual. */
export const webhooks: WebhookApi = {
  verify(h, raw) { const s = String(h['x-nexus-signature'] ?? ''); return !!s && safeEqual(hmac(env.AFFILIATE_WEBHOOK_SECRET, raw.toString()), s); },
  parse(b) { const x = b as { _id?: string; topic?: string; resource?: string }; if (!x.topic) return null; return { eventId: x._id ?? `${x.topic}:${x.resource}`, type: x.topic, externalId: x.resource }; },
};
