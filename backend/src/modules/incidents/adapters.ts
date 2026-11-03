import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';
/**
 * Portas para ferramentas externas de incidente. Padrão = LogNotifier (registra e devolve ids sintéticos).
 * SlackNotifier/PagerDuty usam HTTP real quando as variáveis estão definidas, mas NÃO foram testados contra os serviços reais (ver docs/SRE/INCIDENT_RESPONSE.md).
 */
export interface Notifier {
  createChannel(name: string, topic: string): Promise<{ channel: string; real: boolean }>;
  post(channel: string, text: string): Promise<void>;
  page(severity: 'sev1' | 'sev2' | 'sev3', title: string, dedupKey: string): Promise<{ paged: boolean; real: boolean }>;
}
export class LogNotifier implements Notifier {
  sent: Array<{ kind: string; target: string; text: string }> = [];
  async createChannel(name: string, topic: string) { this.sent.push({ kind: 'channel', target: name, text: topic }); logger.info({ channel: name }, 'incident-bot: canal (stub)'); return { channel: `#${name}`, real: false }; }
  async post(channel: string, text: string) { this.sent.push({ kind: 'post', target: channel, text }); logger.info({ channel }, 'incident-bot: mensagem (stub)'); }
  async page(severity: 'sev1' | 'sev2' | 'sev3', title: string, dedupKey: string) { this.sent.push({ kind: 'page', target: dedupKey, text: `${severity}: ${title}` }); logger.warn({ severity, dedupKey }, 'incident-bot: page (stub)'); return { paged: severity !== 'sev3', real: false }; }
}
const post = (url: string, body: unknown, headers: Record<string, string> = {}) => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000) });
export class HttpNotifier extends LogNotifier {
  override async createChannel(name: string, topic: string) {
    if (!env.SLACK_BOT_TOKEN) return super.createChannel(name, topic);
    const r = await post('https://slack.com/api/conversations.create', { name: name.slice(0, 80) }, { authorization: `Bearer ${env.SLACK_BOT_TOKEN}` }).then((x) => x.json() as Promise<{ ok: boolean; channel?: { id: string; name: string } }>).catch(() => ({ ok: false } as { ok: boolean; channel?: { id: string; name: string } }));
    if (!r.ok || !r.channel) return super.createChannel(name, topic); await post('https://slack.com/api/conversations.setTopic', { channel: r.channel.id, topic: topic.slice(0, 250) }, { authorization: `Bearer ${env.SLACK_BOT_TOKEN}` }).catch(() => undefined); return { channel: `#${r.channel.name}`, real: true };
  }
  override async post(channel: string, text: string) { if (!env.SLACK_WEBHOOK_URL) return super.post(channel, text); await post(env.SLACK_WEBHOOK_URL, { text: `${channel}: ${text}` }).catch((e) => logger.warn({ err: String(e) }, 'slack webhook falhou')); }
  override async page(severity: 'sev1' | 'sev2' | 'sev3', title: string, dedupKey: string) {
    if (!env.PAGERDUTY_ROUTING_KEY || severity === 'sev3') return super.page(severity, title, dedupKey);
    const r = await post('https://events.pagerduty.com/v2/enqueue', { routing_key: env.PAGERDUTY_ROUTING_KEY, event_action: 'trigger', dedup_key: dedupKey, payload: { summary: title, source: 'nexusreel', severity: severity === 'sev1' ? 'critical' : 'error' } }).catch(() => null);
    return { paged: !!r?.ok, real: !!r?.ok };
  }
}
let current: Notifier = env.SLACK_WEBHOOK_URL || env.SLACK_BOT_TOKEN || env.PAGERDUTY_ROUTING_KEY ? new HttpNotifier() : new LogNotifier();
export const notifier = (): Notifier => current; export const setNotifier = (n: Notifier): void => { current = n; };
