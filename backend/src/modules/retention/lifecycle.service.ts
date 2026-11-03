import { pool, asSystem } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { hmacHex, safeEqual } from '../../utils/crypto.js';
import { notFound } from '../../utils/errors.js';
import { enqueue, Q } from '../../queues/index.js';
import { isEnabled } from '../flags.service.js';
import { growthSettings } from '../growth/settings.js';
import { hasMarketingConsent } from '../growth/consent.js';
import { experimentsService } from '../experiments/experiments.service.js';
import { track } from '../analytics/analytics.service.js';
import { DEFAULT_TZ } from '../recommendations/catalog.js';
import { renderLifecycle } from './templates.js';
import { sendPush } from './push.js';
import { m } from '../../observability/metrics.js';
import type { Row } from '../../db/rows.generated.js';

export interface Trigger { minAgeDays?: number; maxAgeDays?: number; onboardingIncomplete?: boolean; neverPublished?: boolean; churnRiskGte?: number; inactiveDaysGte?: number; inactiveDaysLte?: number; publishedWithinHours?: number; platformsPublishedLt?: number }
export const unsubscribeToken = (userId: string) => `${userId}.${hmacHex(`${env.IP_HASH_SALT}:unsub`, userId).slice(0, 32)}`;
export function parseUnsubscribeToken(t: string): string | null { const [id, sig] = t.split('.'); if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null; return safeEqual(hmacHex(`${env.IP_HASH_SALT}:unsub`, id).slice(0, 32), sig) ? id : null; }
/** Constrói o filtro de audiência (somente chaves conhecidas; valores sempre parametrizados). */
export function audienceWhere(t: Trigger, now: Date): { where: string; params: unknown[] } {
  const params: unknown[] = [now]; const w: string[] = ['u.deleted_at IS NULL', 'u.deletion_scheduled_for IS NULL', 'NOT u.banned']; const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  const age = `EXTRACT(EPOCH FROM ($1::timestamptz - u.created_at))/86400`; const idle = `EXTRACT(EPOCH FROM ($1::timestamptz - COALESCE(u.last_seen_at, u.created_at)))/86400`;
  if (t.minAgeDays !== undefined) w.push(`${age} >= ${p(Number(t.minAgeDays))}`); if (t.maxAgeDays !== undefined) w.push(`${age} <= ${p(Number(t.maxAgeDays))}`);
  if (t.onboardingIncomplete) w.push('u.onboarding_completed_at IS NULL'); if (t.neverPublished) w.push(`NOT EXISTS (SELECT 1 FROM publications b WHERE b.user_id=u.id AND b.status='published')`);
  if (t.churnRiskGte !== undefined) w.push(`u.churn_risk >= ${p(Number(t.churnRiskGte))}`); if (t.inactiveDaysGte !== undefined) w.push(`${idle} >= ${p(Number(t.inactiveDaysGte))}`); if (t.inactiveDaysLte !== undefined) w.push(`${idle} <= ${p(Number(t.inactiveDaysLte))}`);
  if (t.publishedWithinHours !== undefined) w.push(`EXISTS (SELECT 1 FROM publications b WHERE b.user_id=u.id AND b.status='published' AND b.published_at >= $1::timestamptz - make_interval(hours => ${p(Number(t.publishedWithinHours))}) AND b.published_at <= $1::timestamptz)`);
  if (t.platformsPublishedLt !== undefined) w.push(`(SELECT count(DISTINCT b.platform) FROM publications b WHERE b.user_id=u.id AND b.status='published') < ${p(Number(t.platformsPublishedLt))}`);
  return { where: w.join(' AND '), params };
}
export const localHour = (d: Date, tz: string) => Number(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23' }).format(d));
export const inQuiet = (h: number, start: number, end: number) => (start > end ? h >= start || h < end : h >= start && h < end);
const safeTz = (tz: string | null, region: string) => { const t = tz ?? DEFAULT_TZ[region] ?? 'UTC'; try { new Intl.DateTimeFormat('en-US', { timeZone: t }); return t; } catch { return DEFAULT_TZ[region] ?? 'UTC'; } };
type Reason = 'opt_out' | 'no_consent' | 'frequency_cap' | 'quiet_hours' | 'outside_send_window' | 'flag_off';
export interface CampaignRun { key: string; evaluated: number; sent: number; failed: number; suppressed: Partial<Record<Reason, number>> }
interface Camp { id: string; key: string; trigger_json: Trigger; channel: 'push' | 'email' | 'in_app'; template_id: string; cooldown_days: number; requires_marketing_consent: boolean }

export const lifecycleService = {
  /** Avalia todas as campanhas ativas. Idempotente: `dedupe_key` (campanha+usuário+janela de cooldown) impede envio duplicado, mesmo com execuções concorrentes. */
  async run(o: { now?: Date; dryRun?: boolean; only?: string[]; limitPerCampaign?: number } = {}): Promise<CampaignRun[]> {
    const now = o.now ?? new Date(); const out: CampaignRun[] = []; if (!(await isEnabled('lifecycle_enabled'))) return out; const gs = await growthSettings();
    const camps = (await pool.query<Camp>(`SELECT id, key, trigger_json, channel, template_id, cooldown_days, requires_marketing_consent FROM lifecycle_campaigns WHERE active ${o.only ? 'AND key = ANY($1)' : ''} ORDER BY priority DESC`, o.only ? [o.only] : [])).rows;
    for (const c of camps) {
      const run: CampaignRun = { key: c.key, evaluated: 0, sent: 0, failed: 0, suppressed: {} }; const { where, params } = audienceWhere(c.trigger_json, now);
      const users = (await pool.query(`SELECT u.id, u.locale, u.country, u.region, u.timezone, u.name, np.* FROM users u LEFT JOIN notification_preferences np ON np.user_id=u.id WHERE ${where} ORDER BY u.created_at LIMIT ${Math.min(o.limitPerCampaign ?? 500, 5000)}`, params)).rows;
      for (const u of users) {
        run.evaluated++; const bump = (r: Reason) => { run.suppressed[r] = (run.suppressed[r] ?? 0) + 1; m.lifecycleSends.inc({ campaign: c.key, status: r }); };
        const window = Math.floor(now.getTime() / 86_400_000 / Math.max(1, c.cooldown_days)); const dedupe = `${c.key}:${u.id}:${window}`;
        if ((await pool.query<{ "?column?": number | null }>('SELECT 1 FROM lifecycle_sends WHERE dedupe_key=$1', [dedupe])).rowCount) continue; // já tratado nesta janela
        const prefs = { push: u.push ?? true, email: u.email ?? true, in_app: u.in_app ?? true, quietStart: u.quiet_start ?? gs.lifecycle.defaultQuietStart, quietEnd: u.quiet_end ?? gs.lifecycle.defaultQuietEnd, preferredHour: u.preferred_hour as number | null, unsub: u.unsubscribed_all ?? false };
        if (prefs.unsub || !prefs[c.channel]) { bump('opt_out'); continue; }
        if (c.requires_marketing_consent && c.channel !== 'in_app' && !(await hasMarketingConsent(u.id))) { bump('no_consent'); continue; }
        const tz = safeTz(u.timezone, u.region); const h = localHour(now, tz);
        if (c.channel !== 'in_app') {
          if (inQuiet(h, prefs.quietStart, prefs.quietEnd)) { bump('quiet_hours'); continue; }
          const caps = (await pool.query<{ d: number; w: number }>(`SELECT count(*) FILTER (WHERE sent_at > $2::timestamptz - interval '24 hours')::int d, count(*)::int w FROM lifecycle_sends WHERE user_id=$1 AND channel IN ('push','email') AND status='sent' AND sent_at > $2::timestamptz - interval '7 days'`, [u.id, now])).rows[0];
          if (caps.d >= gs.lifecycle.capPerDay || caps.w >= gs.lifecycle.capPerWeek) { bump('frequency_cap'); continue; }
        }
        if (c.channel === 'push') { const a = await experimentsService.assign(u.id, 'push_timing', { expose: false }); const H = a.variant === 'morning' ? 9 : a.variant === 'preferred_hour' ? (prefs.preferredHour ?? 19) : 19; if (h < H || h >= prefs.quietStart) { bump('outside_send_window'); continue; } }
        if (o.dryRun) { run.sent++; continue; }
        const ins = await pool.query<{ id: string }>(`INSERT INTO lifecycle_sends (campaign_id,user_id,channel,status,dedupe_key,sent_at) VALUES ($1,$2,$3,'sent',$4,$5) ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`, [c.id, u.id, c.channel, dedupe, now]); if (!ins.rowCount) continue; // outra execução venceu
        try { await this.deliver(c, u, tz, now); if (c.channel === 'push') await experimentsService.assign(u.id, 'push_timing', { expose: true }); run.sent++; m.lifecycleSends.inc({ campaign: c.key, status: 'sent' }); }
        catch { await pool.query('DELETE FROM lifecycle_sends WHERE id=$1', [ins.rows[0].id]); run.failed++; m.lifecycleSends.inc({ campaign: c.key, status: 'failed' }); }
      }
      out.push(run);
    }
    return out;
  },
  async deliver(c: Camp, u: Record<string, any>, _tz: string, now: Date): Promise<void> {
    const vars: Record<string, string> = { name: String(u.name ?? '').split(' ')[0] ?? '', unsubscribeUrl: `${env.PUBLIC_API_URL}/api/v1/notifications/unsubscribe?t=${unsubscribeToken(u.id)}`, credits: '10' };
    if (c.template_id === 'lc_d7_publish') { const t = (await pool.query<Pick<Row<'templates'>, 'name'>>(`SELECT name FROM templates WHERE moderation_status='approved' AND deleted_at IS NULL ORDER BY usage_count DESC LIMIT 1`)).rows[0]; if (t) vars.template = t.name; }
    if (c.template_id === 'lc_post_publish') { const p = (await pool.query<Pick<Row<'publications'>, 'platform'>>(`SELECT platform FROM publications WHERE user_id=$1 AND status='published' ORDER BY published_at DESC LIMIT 1`, [u.id])).rows[0]; if (p) vars.platform = p.platform; }
    const msg = renderLifecycle(c.template_id, u.locale, u.country, vars);
    if (c.channel === 'push') await sendPush({ userId: u.id, title: msg.title, body: msg.body, deepLink: msg.deepLink });
    if (c.channel === 'email') { const e = (await pool.query<Pick<Row<'users'>, 'email'>>('SELECT email FROM users WHERE id=$1', [u.id])).rows[0]; await enqueue(Q.emails, 'lifecycle', { to: e.email, template: 'raw', locale: u.locale, vars: { subject: msg.subject ?? msg.title, text: msg.body } }); }
    await asSystem((db) => db.query(`INSERT INTO notifications (user_id,channel,title,body,deep_link,campaign_key,sent_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [u.id, c.channel, msg.title, msg.body, msg.deepLink ?? null, c.key, now]));
  },
  /** Marca conversões das campanhas (ação-alvo ocorreu depois do envio, dentro de 7 dias). */
  async markConversions(): Promise<Record<string, number>> {
    const sql: Record<string, string> = {
      d1_onboarding_incomplete: `u.onboarding_completed_at IS NOT NULL AND u.onboarding_completed_at > s.sent_at`,
      d7_never_published: `EXISTS (SELECT 1 FROM publications b WHERE b.user_id=s.user_id AND b.status='published' AND b.published_at > s.sent_at)`,
      d21_churn_risk: `EXISTS (SELECT 1 FROM transactions t WHERE t.user_id=s.user_id AND t.type IN ('subscription','credit_purchase') AND t.created_at > s.sent_at)`,
      d45_winback: `EXISTS (SELECT 1 FROM projects p WHERE p.user_id=s.user_id AND p.created_at > s.sent_at AND p.deleted_at IS NULL)`,
      post_publish_next_platform: `(SELECT count(DISTINCT b.platform) FROM publications b WHERE b.user_id=s.user_id AND b.status='published' AND b.published_at > s.sent_at) > 0`,
    }; const res: Record<string, number> = {};
    for (const [key, cond] of Object.entries(sql)) { const r = await pool.query(`UPDATE lifecycle_sends s SET converted_at=now() FROM lifecycle_campaigns c, users u WHERE c.id=s.campaign_id AND c.key=$1 AND u.id=s.user_id AND s.converted_at IS NULL AND s.status='sent' AND s.sent_at > now() - interval '7 days' AND ${cond}`, [key]); res[key] = r.rowCount ?? 0; }
    return res;
  },
  async stats() { return (await pool.query<{ key: string; channel: string; active: boolean; sent: number; opened: number; clicked: number; converted: number }>(`SELECT c.key, c.channel, c.active, count(s.id) FILTER (WHERE s.status='sent')::int sent, count(s.opened_at)::int opened, count(s.clicked_at)::int clicked, count(s.converted_at)::int converted FROM lifecycle_campaigns c LEFT JOIN lifecycle_sends s ON s.campaign_id=c.id GROUP BY c.key, c.channel, c.active ORDER BY c.key`)).rows; },
  async campaigns() { return (await pool.query<{ key: string; description: string; trigger: unknown; channel: string; templateId: string; active: boolean; cooldownDays: number; requiresMarketingConsent: boolean; priority: number }>('SELECT key, description, trigger_json AS trigger, channel, template_id AS "templateId", active, cooldown_days AS "cooldownDays", requires_marketing_consent AS "requiresMarketingConsent", priority FROM lifecycle_campaigns ORDER BY priority DESC')).rows; },
  async patchCampaign(key: string, p: { active?: boolean; cooldownDays?: number }) { const r = await pool.query<{ key: string; active: boolean; cooldownDays: number }>(`UPDATE lifecycle_campaigns SET active=COALESCE($2,active), cooldown_days=COALESCE($3,cooldown_days) WHERE key=$1 RETURNING key, active, cooldown_days AS "cooldownDays"`, [key, p.active ?? null, p.cooldownDays ?? null]); if (!r.rows[0]) throw notFound('Campanha não encontrada'); return r.rows[0]; },
};
// ───────── Notificações do usuário ─────────
export const notificationsService = {
  async list(userId: string, channel?: string, limit = 30) { return { items: (await pool.query<{ id: string; channel: string; title: string; body: string; deepLink: string | null; sentAt: Date; readAt: Date | null; actionTaken: string | null }>(`SELECT id, channel, title, body, deep_link AS "deepLink", sent_at AS "sentAt", read_at AS "readAt", action_taken AS "actionTaken" FROM notifications WHERE user_id=$1 AND ($2::text IS NULL OR channel=$2) ORDER BY sent_at DESC LIMIT $3`, [userId, channel ?? null, limit])).rows, unread: (await pool.query<{ n: number }>(`SELECT count(*)::int n FROM notifications WHERE user_id=$1 AND read_at IS NULL AND channel='in_app'`, [userId])).rows[0].n }; },
  async action(userId: string, id: string, action: 'read' | 'clicked' | 'dismissed') {
    const r = await pool.query<{ campaign_key: string | null }>(`UPDATE notifications SET read_at=COALESCE(read_at, now()), action_taken=CASE WHEN $3='read' THEN COALESCE(action_taken,'read') ELSE $3 END WHERE id=$1 AND user_id=$2 RETURNING campaign_key`, [id, userId, action]); if (!r.rows[0]) throw notFound('Notificação não encontrada');
    const key = r.rows[0].campaign_key as string | null; if (key) await pool.query(`UPDATE lifecycle_sends s SET opened_at=COALESCE(s.opened_at, now()), clicked_at=CASE WHEN $3='clicked' THEN COALESCE(s.clicked_at, now()) ELSE s.clicked_at END WHERE s.id = (SELECT s2.id FROM lifecycle_sends s2 JOIN lifecycle_campaigns c ON c.id=s2.campaign_id WHERE c.key=$1 AND s2.user_id=$2 ORDER BY s2.sent_at DESC LIMIT 1)`, [key, userId, action]);
    if (action === 'clicked' && key) await track(userId, 'notification_clicked', { campaign_key: key }); return { ok: true };
  },
  async prefs(userId: string) { const gs = await growthSettings(); const r = (await pool.query<Row<'notification_preferences'>>('SELECT * FROM notification_preferences WHERE user_id=$1', [userId])).rows[0]; return r ? { push: r.push, email: r.email, inApp: r.in_app, quietStart: r.quiet_start, quietEnd: r.quiet_end, preferredHour: r.preferred_hour, unsubscribedAll: r.unsubscribed_all } : { push: true, email: true, inApp: true, quietStart: gs.lifecycle.defaultQuietStart, quietEnd: gs.lifecycle.defaultQuietEnd, preferredHour: null, unsubscribedAll: false }; },
  async setPrefs(userId: string, p: { push?: boolean; email?: boolean; inApp?: boolean; quietStart?: number; quietEnd?: number; preferredHour?: number | null; unsubscribedAll?: boolean }) {
    const cur = await this.prefs(userId); const n = { ...cur, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) };
    await pool.query(`INSERT INTO notification_preferences (user_id,push,email,in_app,quiet_start,quiet_end,preferred_hour,unsubscribed_all,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now()) ON CONFLICT (user_id) DO UPDATE SET push=$2,email=$3,in_app=$4,quiet_start=$5,quiet_end=$6,preferred_hour=$7,unsubscribed_all=$8,updated_at=now()`, [userId, n.push, n.email, n.inApp, n.quietStart, n.quietEnd, n.preferredHour, n.unsubscribedAll]);
    for (const ch of ['push', 'email', 'inApp'] as const) if (cur[ch] && !n[ch]) await track(userId, 'notifications_disabled', { channel: ch }); if (!cur.unsubscribedAll && n.unsubscribedAll) await track(userId, 'notifications_disabled', { channel: 'all' }); return n;
  },
  async unsubscribe(token: string) { const id = parseUnsubscribeToken(token); if (!id) throw notFound('Link inválido'); await this.setPrefs(id, { unsubscribedAll: true }); return { unsubscribed: true }; },
};
