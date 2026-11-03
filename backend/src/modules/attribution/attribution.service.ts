import { createHash } from 'node:crypto';
import { pool, asSystem } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { attribute, channelKey, isDirect, MODELS, type Model, type Touch } from './models.js';
import type { Row } from '../../db/rows.generated.js';

export interface TouchInput { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string; utm_term?: string; landing?: string; referrer?: string }
const norm = (s?: string, max = 60) => (s ?? '').toLowerCase().trim().replace(/[^a-z0-9_.:\-/]/g, '').slice(0, max);
const ownHosts = () => [new URL(env.PUBLIC_APP_URL).hostname, new URL(env.PUBLIC_API_URL).hostname];
/** Normaliza UTM; sem UTM usa o host do referrer (medium=referral); sem nada → direct. */
export function classify(i: TouchInput): { source: string; medium: string; campaign: string; content: string; term: string } {
  const source = norm(i.utm_source); if (source) return { source, medium: norm(i.utm_medium) || '(none)', campaign: norm(i.utm_campaign), content: norm(i.utm_content), term: norm(i.utm_term) };
  if (i.referrer) { try { const h = new URL(i.referrer).hostname.replace(/^www\./, ''); if (h && !ownHosts().includes(h)) return { source: h.slice(0, 60), medium: 'referral', campaign: '', content: '', term: '' }; } catch { /* referrer inválido → direct */ } }
  return { source: 'direct', medium: '(none)', campaign: '', content: '', term: '' };
}
const key = (subject: string, c: { source: string; medium: string; campaign: string; content: string }) => createHash('sha1').update(`${subject}|${c.source}|${c.medium}|${c.campaign}|${c.content}`).digest('hex');
export const attributionService = {
  /** Registra um contato. Contatos `direct` só entram se o sujeito ainda não tem nenhum (não poluem o caminho). */
  async touch(subject: { userId?: string; anonId?: string }, i: TouchInput): Promise<{ recorded: boolean; source: string }> {
    const c = classify(i); const subj = subject.userId ? `user:${subject.userId}` : `anon:${subject.anonId}`; if (!subject.userId && !subject.anonId) return { recorded: false, source: c.source };
    if (c.source === 'direct') { const has = subject.userId ? await pool.query<{ "?column?": number | null }>('SELECT 1 FROM attribution_touches WHERE user_id=$1 LIMIT 1', [subject.userId]) : await pool.query<{ "?column?": number | null }>('SELECT 1 FROM attribution_touches WHERE anon_id=$1 LIMIT 1', [subject.anonId]); if (has.rowCount) return { recorded: false, source: 'direct' }; }
    await pool.query(`INSERT INTO attribution_touches (touch_key,user_id,anon_id,source,medium,campaign,content,term,landing) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (touch_key) DO UPDATE SET last_seen_at=now(), touch_count=attribution_touches.touch_count+1`, [key(subj, c), subject.userId ?? null, subject.userId ? null : subject.anonId, c.source, c.medium, c.campaign, c.content, c.term, (i.landing ?? '').slice(0, 200) || null]);
    return { recorded: true, source: c.source };
  },
  /** No cadastro/login: move os contatos anônimos para o usuário (mesclando duplicatas) e define `users.attribution_source` (last non-direct). */
  async claim(userId: string, anonId?: string): Promise<{ claimed: number; source: string }> {
    let claimed = 0;
    if (anonId) await asSystem(async (db) => {
      const rows = (await db.query<Row<'attribution_touches'>>('SELECT * FROM attribution_touches WHERE anon_id=$1 AND user_id IS NULL', [anonId])).rows;
      for (const r of rows) {
        await db.query(`INSERT INTO attribution_touches (touch_key,user_id,source,medium,campaign,content,term,landing,first_seen_at,last_seen_at,touch_count) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (touch_key) DO UPDATE SET first_seen_at=LEAST(attribution_touches.first_seen_at,EXCLUDED.first_seen_at), last_seen_at=GREATEST(attribution_touches.last_seen_at,EXCLUDED.last_seen_at), touch_count=attribution_touches.touch_count+EXCLUDED.touch_count`,
        [key(`user:${userId}`, r), userId, r.source, r.medium, r.campaign, r.content, r.term, r.landing, r.first_seen_at, r.last_seen_at, r.touch_count]); await db.query('DELETE FROM attribution_touches WHERE id=$1', [r.id]); claimed++;
      }
    });
    const src = (await pool.query<Pick<Row<'attribution_touches'>, 'source'>>(`SELECT source FROM attribution_touches WHERE user_id=$1 AND source<>'direct' ORDER BY first_seen_at DESC LIMIT 1`, [userId])).rows.at(0)?.source ?? 'direct';
    await pool.query('UPDATE users SET attribution_source=$2 WHERE id=$1', [userId, src]); return { claimed, source: src };
  },
  async touchesOf(userId: string, before: Date, lookbackDays = 30): Promise<Touch[]> {
    return (await pool.query<{ source: string; medium: string; campaign: string; first_seen_at: Date }>(`SELECT source, medium, campaign, first_seen_at FROM attribution_touches WHERE user_id=$1 AND first_seen_at <= $2 AND first_seen_at >= $2 - make_interval(days => $3) ORDER BY first_seen_at`, [userId, before, lookbackDays])).rows.map((r) => ({ source: r.source, medium: r.medium, campaign: r.campaign, at: new Date(r.first_seen_at) }));
  },
  /** Relatório de receita por canal (BRL normalizado) + conciliação com os totais de transações e com os eventos do Stripe. */
  async report(o: { from: Date; to: Date; model: Model; lookbackDays?: number }) {
    if (!MODELS.includes(o.model)) throw new RangeError('modelo inválido');
    const txs = (await pool.query<{ id: string; user_id: string; brl: number; source: string; created_at: Date }>(`SELECT id, user_id, COALESCE(amount_brl_cents, amount_cents) AS brl, source, created_at FROM transactions WHERE type IN ('subscription','credit_purchase') AND amount_cents > 0 AND created_at >= $1 AND created_at < $2`, [o.from, o.to])).rows;
    const byChannel = new Map<string, { source: string; medium: string; campaign: string; revenueCents: number; conversions: number }>(); let attributed = 0, total = 0;
    for (const t of txs) {
      total += t.brl; const touches = await this.touchesOf(t.user_id, new Date(t.created_at), o.lookbackDays ?? 30);
      const credit = touches.length ? attribute(touches, o.model, t.brl, new Date(t.created_at)) : [t.brl]; const ts = touches.length ? touches : [{ source: 'unattributed', medium: '(none)', campaign: '', at: new Date(t.created_at) } as Touch];
      ts.forEach((x, i) => { if (!credit[i]) return; const k = channelKey(x); const cur = byChannel.get(k) ?? { source: x.source, medium: x.medium, campaign: x.campaign, revenueCents: 0, conversions: 0 }; cur.revenueCents += credit[i]!; cur.conversions += credit[i]! / t.brl; byChannel.set(k, cur); attributed += credit[i]!; });
    }
    const st = (await pool.query<{ s: number }>(`SELECT COALESCE(sum(COALESCE(amount_brl_cents, amount_cents)),0)::bigint s FROM transactions WHERE source='stripe' AND type IN ('subscription','credit_purchase') AND created_at >= $1 AND created_at < $2`, [o.from, o.to])).rows[0].s as number;
    const sev = (await pool.query<{ s: number }>(`SELECT COALESCE(sum((payload->'data'->'object'->>'amount_total')::bigint),0)::bigint s FROM webhook_events WHERE provider='stripe' AND event_type='checkout.session.completed' AND processed_at IS NOT NULL AND created_at >= $1 AND created_at < $2`, [o.from, o.to])).rows[0].s as number;
    return { model: o.model, from: o.from, to: o.to, channels: [...byChannel.values()].map((c) => ({ ...c, conversions: Math.round(c.conversions * 100) / 100 })).sort((a, b) => b.revenueCents - a.revenueCents),
      reconciliation: { transactionsTotalCents: total, attributedTotalCents: attributed, stripeTransactionsCents: st, stripeWebhookEventsCents: sev, attributionDeltaCents: attributed - total, stripeDeltaCents: st - sev, ok: attributed === total && st === sev } };
  },
};
export { isDirect };
