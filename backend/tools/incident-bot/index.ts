#!/usr/bin/env tsx
/**
 * incident-bot — abre/atualiza/resolve incidentes pelo terminal (mesmo serviço da API: canal, papéis, página de status, notificação de assinantes, rascunho de postmortem).
 *   tsx tools/incident-bot/index.ts open --sev sev2 --title "Fila de publicação travada" --components publishing,api [--impact "..."]
 *   tsx tools/incident-bot/index.ts update --id <uuid> --message "Causa identificada" [--status identified] [--internal]
 *   tsx tools/incident-bot/index.ts resolve --id <uuid> --message "Mitigado"
 *   tsx tools/incident-bot/index.ts list | overdue
 * Notificadores: LogNotifier por padrão; Slack/PagerDuty reais quando SLACK_WEBHOOK_URL ou PAGERDUTY_ROUTING_KEY estão definidos (não testado contra serviços reais).
 */
import { incidentsService, SEVERITIES, STATUSES, type Severity } from '../../src/modules/incidents/incidents.service.js';
import { arg, flag, isMain, run } from '../lib/cli.js';

async function main(): Promise<void> {
  const [cmd, ...a] = process.argv.slice(2); const id = arg(a, 'id');
  if (cmd === 'open') {
    const sev = arg(a, 'sev') as Severity; const title = arg(a, 'title'); if (!SEVERITIES.includes(sev) || !title) throw new Error(`uso: open --sev ${SEVERITIES.join('|')} --title "..."`);
    const i = await incidentsService.open({ severity: sev, title, components: arg(a, 'components')?.split(',') ?? [], impact: arg(a, 'impact'), source: 'incident-bot', actor: 'incident-bot' }); console.log(JSON.stringify({ id: i.id, channel: i.channel, severity: i.severity, roles: i.roles }, null, 2)); return;
  }
  if (cmd === 'update' || cmd === 'resolve') {
    const message = arg(a, 'message'); const status = cmd === 'resolve' ? 'resolved' : (arg(a, 'status') as (typeof STATUSES)[number] | undefined); if (!id || !message) throw new Error('informe --id e --message');
    if (status && !STATUSES.includes(status)) throw new Error(`status inválido (${STATUSES.join('|')})`); console.log(JSON.stringify(await incidentsService.update(id, { message, status, public: !flag(a, 'internal') }, null), null, 2)); return;
  }
  if (cmd === 'list') { console.log(JSON.stringify(await incidentsService.list({ limit: 20 }), null, 2)); return; }
  if (cmd === 'overdue') { console.log(JSON.stringify({ updates: await incidentsService.overdueUpdates(), postmortems: (await incidentsService.postmortemSla()).filter((p) => p.overdue) }, null, 2)); return; }
  throw new Error('uso: open | update | resolve | list | overdue');
}
if (isMain(import.meta.url)) await run(main);
