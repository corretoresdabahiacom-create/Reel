import { randomUUID } from 'node:crypto';
import { pool } from '../../db/pool.js';
import { audit } from '../../repositories/audit.js';
import { AppError, notFound, conflict } from '../../utils/errors.js';
import { enqueue, Q } from '../../queues/index.js';
import { notifier } from './adapters.js';
import { addBusinessDays, buildPostmortem, metrics, type TimelineEvent } from './postmortem.js';
import { oncallService } from '../oncall/oncall.service.js';
import { env } from '../../config/env.js';
import type { Row } from '../../db/rows.generated.js';

export const SEVERITIES = ['sev1', 'sev2', 'sev3'] as const; export type Severity = (typeof SEVERITIES)[number];
export const STATUSES = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
/** Cadência de comunicação pública: 30 min em Sev1/Sev2; 2 h em Sev3. */
export const UPDATE_EVERY_MIN: Record<Severity, number> = { sev1: 30, sev2: 30, sev3: 120 };
const COMPONENT_STATE: Record<Severity, string> = { sev1: 'major_outage', sev2: 'partial_outage', sev3: 'degraded' };
const RANK: Record<string, number> = { operational: 0, degraded: 1, partial_outage: 2, major_outage: 3 };
const dto = (r: Row<'incidents'>) => ({ id: r.id, severity: r.severity, title: r.title, status: r.status, components: r.components, channel: r.channel, roles: r.roles, startedAt: r.started_at, detectedAt: r.detected_at, mitigatedAt: r.mitigated_at, resolvedAt: r.resolved_at, commanderId: r.commander_id, postmortemUrl: r.postmortem_url, impactSummary: r.impact_summary, source: r.source });
const channelName = (id: string) => `incident-${id.slice(0, 8)}`;

export const incidentsService = {
  /** Abre incidente: cria canal, define roles, aciona on-call (Sev1/2) e publica o 1º update na status page. */
  async open(i: { severity: Severity; title: string; components?: string[]; commanderId?: string | null; detectedAt?: Date; source?: string; roles?: Record<string, string>; impact?: string; actor?: string | null }) {
    const id = randomUUID(); const ch = await notifier().createChannel(channelName(id), `${i.severity.toUpperCase()}: ${i.title}`);
    const roles = { incidentCommander: i.roles?.incidentCommander ?? i.commanderId ?? 'on-call-primary', commsLead: i.roles?.commsLead ?? 'on-call-secondary', techLead: i.roles?.techLead ?? 'service-owner' };
    const row = (await pool.query<Row<'incidents'>>(`INSERT INTO incidents (id, severity, title, components, channel, roles, detected_at, commander_id, source, impact_summary) VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7, now()),$8,$9,$10) RETURNING *`,
      [id, i.severity, i.title, i.components ?? [], ch.channel, JSON.stringify(roles), i.detectedAt ?? null, i.commanderId ?? null, i.source ?? 'manual', i.impact ?? null])).rows[0]!;
    await pool.query(`INSERT INTO incident_updates (incident_id, message, status, public, author_id) VALUES ($1,$2,'investigating',true,$3)`, [id, `Estamos investigando: ${i.title}`, i.commanderId ?? null]);
    await notifier().post(ch.channel, `Incidente ${i.severity.toUpperCase()} aberto. IC: ${roles.incidentCommander} · Comms: ${roles.commsLead} · Tech: ${roles.techLead}. Runbook: docs/RUNBOOKS/. Status: ${env.STATUS_PUBLIC_URL}`);
    const pg = await notifier().page(i.severity, i.title, `nexus-${id}`); if (pg.paged) await oncallService.record(String(roles.incidentCommander), i.severity, id); await audit(pool, i.actor ?? i.commanderId ?? 'system', 'incident.open', 'incident', id, { severity: i.severity, paged: pg.paged, channel: ch.channel });
    await this.notifySubscribers(row, `Investigando: ${i.title}`); return { ...dto(row), paged: pg.paged, notifierReal: ch.real };
  },
  async get(id: string) {
    const r = (await pool.query<Row<'incidents'>>('SELECT * FROM incidents WHERE id=$1', [id])).rows[0]; if (!r) throw notFound('Incidente não encontrado');
    const updates = (await pool.query<Pick<Row<'incident_updates'>, 'id' | 'message' | 'status' | 'public' | 'created_at' | 'author_id'>>('SELECT id, message, status, public, created_at, author_id FROM incident_updates WHERE incident_id=$1 ORDER BY created_at', [id])).rows;
    const pm = (await pool.query<Row<'postmortems'>>('SELECT * FROM postmortems WHERE incident_id=$1', [id])).rows.at(0) ?? null;
    return { ...dto(r), metrics: metrics(r), updates, postmortem: pm, nextUpdateDueAt: r.status === 'resolved' ? null : this.nextUpdateDue(r, updates) };
  },
  nextUpdateDue(r: Record<string, any>, updates: Array<{ created_at: Date | string; public: boolean }>): Date { const last = [...updates].reverse().find((u) => u.public); return new Date(new Date(last?.created_at ?? r.started_at).getTime() + UPDATE_EVERY_MIN[r.severity as Severity] * 60_000); },
  async list(q: { status?: string; limit?: number } = {}) { return { items: (await pool.query<Row<'incidents'>>(`SELECT * FROM incidents WHERE ($1::text IS NULL OR status=$1) ORDER BY started_at DESC LIMIT $2`, [q.status ?? null, q.limit ?? 50])).rows.map(dto) }; },
  async update(id: string, u: { message: string; status?: (typeof STATUSES)[number]; public?: boolean }, authorId: string | null) {
    const cur = (await pool.query<Row<'incidents'>>('SELECT * FROM incidents WHERE id=$1', [id])).rows[0]; if (!cur) throw notFound('Incidente não encontrado'); if (cur.status === 'resolved') throw conflict('Incidente já resolvido', 'incident_resolved');
    const status = u.status ?? cur.status; await pool.query(`INSERT INTO incident_updates (incident_id, message, status, public, author_id) VALUES ($1,$2,$3,$4,$5)`, [id, u.message, status, u.public ?? true, authorId]);
    const sets: string[] = ['status=$2']; if (status === 'monitoring' && !cur.mitigated_at) sets.push('mitigated_at=now()'); if (status === 'resolved') sets.push('resolved_at=now()', 'mitigated_at=COALESCE(mitigated_at, now())');
    const row = (await pool.query(`UPDATE incidents SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, [id, status])).rows[0]!;
    await notifier().post(row.channel ?? channelName(id), `[${status}] ${u.message}`); if (u.public ?? true) await this.notifySubscribers(row, u.message);
    await audit(pool, authorId ?? 'system', 'incident.update', 'incident', id, { status });
    if (status === 'resolved') await this.createPostmortemDraft(id); return this.get(id);
  },
  /** Gera (ou regenera) o rascunho do postmortem. Eventos externos (PagerDuty/Slack) podem ser passados já exportados. */
  async createPostmortemDraft(id: string, external: TimelineEvent[] = []) {
    const r = (await pool.query<Row<'incidents'>>('SELECT * FROM incidents WHERE id=$1', [id])).rows[0]; if (!r) throw notFound('Incidente não encontrado');
    const ups = (await pool.query<Pick<Row<'incident_updates'>, 'created_at' | 'message' | 'status'>>('SELECT created_at, message, status FROM incident_updates WHERE incident_id=$1 ORDER BY created_at', [id])).rows; const p = buildPostmortem(r, ups, external);
    const row = (await pool.query<Row<'postmortems'>>(`INSERT INTO postmortems (incident_id, root_cause, timeline, actions_json, five_whys, draft) VALUES ($1,NULL,$2,$3,$4,true)
      ON CONFLICT (incident_id) DO UPDATE SET timeline=EXCLUDED.timeline, actions_json=EXCLUDED.actions_json WHERE postmortems.draft RETURNING *`, [id, JSON.stringify(p.timeline), JSON.stringify(p.actions_json), JSON.stringify(p.five_whys)])).rows[0]
      ?? (await pool.query<Row<'postmortems'>>('SELECT * FROM postmortems WHERE incident_id=$1', [id])).rows[0];
    return { ...row, markdown: p.markdown, metrics: p.metrics, reviewDueAt: r.resolved_at ? addBusinessDays(new Date(r.resolved_at), 5) : null };
  },
  /** Revisão humana: completa causa raiz/5 porquês/ações; o revisor registra data. Publicar exige revisão prévia. */
  async reviewPostmortem(id: string, reviewerId: string, b: { rootCause: string; fiveWhys: Array<{ why: number; answer: string }>; actions?: unknown[]; publish?: boolean }) {
    const pm = (await pool.query<Row<'postmortems'>>('SELECT * FROM postmortems WHERE incident_id=$1', [id])).rows[0]; if (!pm) throw notFound('Postmortem não encontrado');
    if (!b.rootCause.trim() || b.fiveWhys.filter((w) => w.answer.trim()).length < 3) throw new AppError(422, 'postmortem_incomplete', 'Informe a causa raiz e ao menos 3 dos 5 porquês');
    const row = (await pool.query<Row<'postmortems'>>(`UPDATE postmortems SET root_cause=$2, five_whys=$3, actions_json=COALESCE($4, actions_json), draft=false, reviewed_at=now(), reviewed_by=$5, published_at=CASE WHEN $6 THEN now() ELSE published_at END WHERE incident_id=$1 RETURNING *`,
      [id, b.rootCause, JSON.stringify(b.fiveWhys), b.actions ? JSON.stringify(b.actions) : null, reviewerId, !!b.publish])).rows[0]!;
    await audit(pool, reviewerId, 'postmortem.review', 'incident', id, { published: !!b.publish }); return row;
  },
  /** SLA de postmortem: gerado/revisado em até 5 dias (Sev1/2) após a resolução; Sev1 público em até 5 dias úteis. */
  async postmortemSla(now = new Date()) {
    const rows = (await pool.query<{ id: string; severity: string; title: string; resolved_at: Date | null; draft: boolean | null; reviewed_at: Date | null; published_at: Date | null }>(`SELECT i.id, i.severity, i.title, i.resolved_at, p.draft, p.reviewed_at, p.published_at FROM incidents i LEFT JOIN postmortems p ON p.incident_id=i.id WHERE i.status='resolved' AND i.severity IN ('sev1','sev2') ORDER BY i.resolved_at DESC LIMIT 200`)).rows;
    return rows.map((r) => { const due = addBusinessDays(new Date(r.resolved_at ?? 0), 5); const done = !!r.reviewed_at; return { incidentId: r.id, severity: r.severity, title: r.title, dueAt: due, reviewed: done, published: !!r.published_at, overdue: !done && now > due }; });
  },
  /** Comunicações públicas atrasadas (cadência 30 min / 2 h). */
  async overdueUpdates(now = new Date()) {
    const rows = (await pool.query<{ id: string; severity: string; title: string; status: string; components: string[]; channel: string | null; roles: unknown; started_at: Date; detected_at: Date | null; mitigated_at: Date | null; resolved_at: Date | null; commander_id: string | null; postmortem_url: string | null; impact_summary: string | null; source: string; created_at: Date }>(`SELECT * FROM incidents WHERE status <> 'resolved'`)).rows; const out = [];
    for (const r of rows) { const ups = (await pool.query<Pick<Row<'incident_updates'>, 'created_at' | 'public'>>('SELECT created_at, public FROM incident_updates WHERE incident_id=$1 ORDER BY created_at', [r.id])).rows; const due = this.nextUpdateDue(r, ups); if (now > due) out.push({ id: r.id, severity: r.severity, title: r.title, dueAt: due, lateMin: Math.round((now.getTime() - due.getTime()) / 60000) }); }
    return out;
  },
  async stats(days = 90) {
    const rows = (await pool.query<{ severity: string; started_at: Date; detected_at: Date | null; mitigated_at: Date | null; resolved_at: Date | null }>(`SELECT severity, started_at, detected_at, mitigated_at, resolved_at FROM incidents WHERE started_at > now() - ($1 || ' days')::interval`, [String(days)])).rows;
    const avg = (xs: Array<number | null>) => { const v = xs.filter((x): x is number => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; };
    const ms = rows.map((r) => metrics(r)); return { windowDays: days, total: rows.length, bySeverity: Object.fromEntries(SEVERITIES.map((s) => [s, rows.filter((r) => r.severity === s).length])), mttdMin: avg(ms.map((x) => x.mttdMin)), mttrMin: avg(ms.map((x) => x.mttrMin)) };
  },
  // ── status page pública ──
  async statusPage() {
    const comps = (await pool.query<Row<'status_components'>>('SELECT * FROM status_components ORDER BY position')).rows; const open = (await pool.query<Pick<Row<'incidents'>, 'id' | 'severity' | 'title' | 'components' | 'status' | 'started_at'>>(`SELECT id, severity, title, components, status, started_at FROM incidents WHERE status <> 'resolved'`)).rows;
    const components = comps.map((c) => { let st = c.override_status ?? 'operational'; for (const i of open) if ((i.components as string[]).includes(c.key) && RANK[COMPONENT_STATE[i.severity as Severity]]! > RANK[st]!) st = COMPONENT_STATE[i.severity as Severity]!; return { key: c.key, name: c.name, status: st }; });
    const worst = components.reduce((a, c) => Math.max(a, RANK[c.status]!), 0);
    const history = (await pool.query<{ id: string; severity: string; title: string; status: string; components: string[]; started_at: Date; resolved_at: Date | null }>(`SELECT id, severity, title, status, components, started_at, resolved_at FROM incidents WHERE started_at > now() - interval '90 days' ORDER BY started_at DESC LIMIT 50`)).rows;
    const updates = open.length ? (await pool.query<{ incident_id: string; message: string; status: string; created_at: Date }>(`SELECT incident_id, message, status, created_at FROM incident_updates WHERE public AND incident_id = ANY($1::uuid[]) ORDER BY created_at DESC`, [open.map((o) => o.id)])).rows : [];
    return { page: env.STATUS_PUBLIC_URL, overall: Object.keys(RANK).find((k) => RANK[k] === worst), components, activeIncidents: open.map((o) => ({ ...o, updates: updates.filter((u) => u.incident_id === o.id).map((u) => ({ message: u.message, status: u.status, at: u.created_at })) })), history, updatedAt: new Date().toISOString() };
  },
  async statusRss(): Promise<string> {
    const items = (await pool.query<{ id: string; title: string; severity: string; started_at: Date; last: string | null }>(`SELECT i.id, i.title, i.severity, i.started_at, (SELECT message FROM incident_updates u WHERE u.incident_id=i.id AND u.public ORDER BY created_at DESC LIMIT 1) AS last FROM incidents i ORDER BY started_at DESC LIMIT 30`)).rows;
    const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
    return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>NexusReel Status</title><link>${esc(env.STATUS_PUBLIC_URL)}</link><description>Incidentes e manutenções</description>${items.map((i) => `<item><title>${esc(`[${i.severity}] ${i.title}`)}</title><guid isPermaLink="false">${i.id}</guid><pubDate>${new Date(i.started_at).toUTCString()}</pubDate><description>${esc(i.last ?? '')}</description></item>`).join('')}</channel></rss>`;
  },
  async subscribe(channel: 'email' | 'sms', target: string, components: string[] = []) {
    const token = randomUUID(); await pool.query(`INSERT INTO status_subscribers (channel, target, components, token) VALUES ($1,$2,$3,$4) ON CONFLICT (channel, target) DO UPDATE SET components=EXCLUDED.components`, [channel, target.trim().toLowerCase(), components, token]); return { subscribed: true, confirmation: 'pending' };
  },
  async confirmSubscriber(token: string) { const r = await pool.query(`UPDATE status_subscribers SET confirmed=true WHERE token=$1`, [token]); if (!r.rowCount) throw notFound(); return { confirmed: true }; },
  async notifySubscribers(inc: Record<string, any>, message: string): Promise<number> {
    const subs = (await pool.query<{ id: string; channel: string; target: string; components: string[]; confirmed: boolean; token: string; created_at: Date }>(`SELECT * FROM status_subscribers WHERE confirmed AND channel='email' AND (cardinality(components)=0 OR components && $1::text[])`, [inc.components ?? []])).rows; let n = 0;
    for (const s of subs) { await enqueue(Q.emails, 'status', { to: s.target, template: 'raw', vars: { subject: `[NexusReel status] ${inc.severity?.toUpperCase()} — ${inc.title}`, text: `${message}\n\nAcompanhe: ${env.STATUS_PUBLIC_URL}` } }).catch(() => undefined); n++; } return n;
  },
};
