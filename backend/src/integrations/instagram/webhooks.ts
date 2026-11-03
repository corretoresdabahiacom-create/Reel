import { createHmac } from 'node:crypto';
import { env } from '../../config/env.js';
import { safeEqual } from '../../utils/crypto.js';
import type { WebhookApi } from '../types.js';
/** Webhooks Meta: header `X-Hub-Signature-256: sha256=<hmac(app_secret, body)>`. (A verificação GET hub.challenge é tratada na rota.) */
export const webhooks: WebhookApi = {
  verify(h, raw) { const sig = String(h['x-hub-signature-256'] ?? '').replace('sha256=', ''); return !!sig && safeEqual(createHmac('sha256', env.INSTAGRAM_APP_SECRET).update(raw).digest('hex'), sig); },
  parse(b) { const e = (b as { entry?: { id: string; time: number; changes?: { field: string }[] }[] }).entry?.[0]; if (!e) return null; return { eventId: `${e.id}:${e.time}:${e.changes?.[0]?.field ?? 'x'}`, type: e.changes?.[0]?.field ?? 'entry' }; },
};
