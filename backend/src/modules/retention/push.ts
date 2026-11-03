import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';
import { pseudo } from '../analytics/analytics.service.js';

export interface PushMsg { userId: string; title: string; body: string; deepLink?: string }
/** Provedor de push. `log` (padrão) só registra; `onesignal` chama a API REST (external_id = id pseudonimizado — sem PII no provedor). NÃO validado contra o OneSignal real neste ambiente. */
export async function sendPush(m: PushMsg): Promise<{ id: string }> {
  if (env.PUSH_PROVIDER === 'onesignal') {
    if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_API_KEY) throw new Error('OneSignal não configurado');
    const r = await fetch('https://api.onesignal.com/notifications?c=push', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Key ${env.ONESIGNAL_API_KEY}` }, signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ app_id: env.ONESIGNAL_APP_ID, target_channel: 'push', include_aliases: { external_id: [pseudo(m.userId)] }, headings: { en: m.title }, contents: { en: m.body }, ...(m.deepLink ? { app_url: m.deepLink } : {}) }) });
    if (!r.ok) throw new Error(`OneSignal ${r.status}`); const j = (await r.json()) as { id?: string }; return { id: j.id ?? 'unknown' };
  }
  logger.info({ push: 'log', to: pseudo(m.userId).slice(0, 8), title: m.title }, 'push (driver log)'); return { id: `log_${Date.now()}` };
}
