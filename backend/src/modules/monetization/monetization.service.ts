import { z } from 'zod';
import { pool, asSystem } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { audit } from '../../repositories/audit.js';
import { randomToken } from '../../utils/crypto.js';
import { AppError, notFound, unprocessable } from '../../utils/errors.js';
import { usersRepo } from '../users/users.repository.js';
import { growthSettings } from '../growth/settings.js';
import { growthHooks } from '../growth/hooks.js';
import { track } from '../analytics/analytics.service.js';
import { pricingRegions, quote, resolveRegion, toBrlCents, formatMoney, invalidatePricing, type Item, type Quote } from './pricing.js';
import type { Row } from '../../db/rows.generated.js';

export const LOCAL_METHODS = ['oxxo', 'spei', 'upi', 'gcash', 'bank_transfer', 'boleto', 'qris', 'netbanking'] as const;
export const quoteBody = z.object({ item: z.discriminatedUnion('kind', [z.object({ kind: z.literal('plan'), plan: z.enum(['pro', 'business']), billing: z.enum(['monthly', 'annual']).default('monthly') }), z.object({ kind: z.literal('credits'), packId: z.string().max(10) })]), country: z.string().length(2).optional(), method: z.string().max(20).optional() });
export const localBody = z.object({ packId: z.string().max(10), method: z.enum(LOCAL_METHODS), country: z.string().length(2).optional() });
const mockRef = (method: string, id: string, major: number, cur: string) => {
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
  switch (method) { case 'oxxo': return { reference: digits(14), barcode: `*${digits(12)}*`, instructions: 'Pague em qualquer loja OXXO informando a referência', expiresAt: new Date(Date.now() + 72 * 3600_000).toISOString() };
    case 'spei': return { clabe: digits(18), reference: digits(7), expiresAt: new Date(Date.now() + 72 * 3600_000).toISOString() };
    case 'upi': return { intent: `upi://pay?pa=nexusreel@mock&pn=NexusReel&am=${major.toFixed(2)}&cu=${cur}&tn=${id}`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
    case 'gcash': return { checkoutUrl: `${env.PUBLIC_APP_URL}/checkout/mock-gcash?charge=${id}`, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() };
    case 'boleto': return { line: `${digits(47)}`, expiresAt: new Date(Date.now() + 72 * 3600_000).toISOString() };
    case 'qris': return { qrString: `00020101021226MOCK${id}`, expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() };
    default: return { virtualAccount: digits(13), bank: 'MOCK', expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString() }; }
};
export const monetizationService = {
  async regions() { const regs = await pricingRegions(); return { regions: regs.map((r) => ({ region: r.region, currency: r.currency, locale: r.locale, countries: r.countryCodes, methods: r.methods, taxKind: r.taxKind, taxPct: r.taxPct, taxInclusive: r.taxInclusive, pppIndex: r.pppIndex, display: { pro: formatMoney(r.proCents, r.currency, r.locale), business: formatMoney(r.businessCents, r.currency, r.locale), packs: r.packs.map((p) => ({ id: p.id, credits: p.credits, price: formatMoney(p.priceCents, r.currency, r.locale) })) } })) }; },
  /** Tabela de preços para o usuário (país informado → perfil → região). Valor e imposto calculados no servidor. */
  async pricing(userId: string | null, country?: string) {
    const u = userId ? (await pool.query<Pick<Row<'users'>, 'country' | 'region'>>('SELECT country, region FROM users WHERE id=$1', [userId])).rows[0] : null; const regs = await pricingRegions(); const r = resolveRegion(regs, { country: country ?? u?.country, userRegion: u?.region });
    const base = { country: country?.toUpperCase() ?? u?.country ?? null, userRegion: u?.region ?? null }; const q = (item: Item) => quote(regs, { ...base, item });
    return { region: r.region, currency: r.currency, locale: r.locale, methods: r.methods, plans: { pro: { monthly: await q({ kind: 'plan', plan: 'pro' }), annual: await q({ kind: 'plan', plan: 'pro', billing: 'annual' }) }, business: { monthly: await q({ kind: 'plan', plan: 'business' }), annual: await q({ kind: 'plan', plan: 'business', billing: 'annual' }) } }, creditPacks: await Promise.all(r.packs.map((p) => q({ kind: 'credits', packId: p.id }))) };
  },
  async quote(userId: string, b: z.infer<typeof quoteBody>): Promise<Quote & { method?: string }> {
    const u = (await pool.query<Pick<Row<'users'>, 'country' | 'region'>>('SELECT country, region FROM users WHERE id=$1', [userId])).rows[0]; if (!u) throw notFound('Usuário não encontrado'); const regs = await pricingRegions();
    let q: Quote; try { q = await quote(regs, { item: b.item, country: b.country ?? u.country, userRegion: u.region }); } catch (e) { throw unprocessable((e as Error).message); }
    if (b.method && !q.methods.includes(b.method)) throw unprocessable(`Método ${b.method} indisponível em ${q.region} (disponíveis: ${q.methods.join(', ')})`); return { ...q, ...(b.method ? { method: b.method } : {}) };
  },
  /** Cobrança por método local (OXXO, SPEI, UPI, GCash, boleto, QRIS, transferência). Somente pacotes de créditos. Modo real: 501 até o PSP local ser integrado (docs/PRICING.md). */
  async startLocalPayment(userId: string, b: z.infer<typeof localBody>) {
    if (env.PAYMENTS_MODE !== 'mock') throw new AppError(501, 'not_implemented', 'Método local ainda não integrado a um PSP real (TODO: Stripe OXXO/UPI, Xendit/GCash/QRIS, Mercado Pago/SPEI) — ver docs/PRICING.md');
    const q = await this.quote(userId, { item: { kind: 'credits', packId: b.packId }, country: b.country, method: b.method }); const id = `loc_${randomToken(9)}`; const major = q.totalMinor / 10 ** (q.currency === 'IDR' ? 0 : 2);
    await pool.query(`INSERT INTO webhook_events (provider,event_id,event_type,payload,processed_at) VALUES ('local',$1,'created',$2,now())`, [`created-${id}`, JSON.stringify({ userId, packId: b.packId, method: b.method, region: q.region, currency: q.currency, totalMinor: q.totalMinor, taxMinor: q.taxMinor + q.iofMinor, credits: q.credits })]);
    await track(userId, 'checkout_started', { kind: 'credits', amount_cents: q.totalMinor, currency: q.currency, method: b.method });
    return { chargeId: id, method: b.method, amountMinor: q.totalMinor, currency: q.currency, display: q.display, tax: { minor: q.taxMinor, kind: q.tax.kind, pct: q.tax.pct, inclusive: q.tax.inclusive }, credits: q.credits, payment: mockRef(b.method, id, major, q.currency), mode: 'mock' as const };
  },
  /** Webhook do PSP local (assinatura HMAC como o Pix). Idempotente por event id e por (source, chargeId). */
  async ingestLocalWebhook(body: { id?: string; type?: string; data?: { chargeId?: string } }) {
    const id = String(body.id ?? ''); if (!id) throw unprocessable('evento sem id'); const ins = await pool.query(`INSERT INTO webhook_events (provider,event_id,event_type,payload) VALUES ('local',$1,$2,$3) ON CONFLICT (provider,event_id) DO NOTHING RETURNING id`, [id, String(body.type ?? ''), JSON.stringify(body)]);
    if (!ins.rowCount) return { received: true, duplicate: true }; if (body.type !== 'local.paid' || !body.data?.chargeId) { await pool.query('UPDATE webhook_events SET processed_at=now() WHERE id=$1', [ins.rows[0].id]); return { received: true, duplicate: false, ignored: true }; }
    const created = (await pool.query<Pick<Row<'webhook_events'>, 'payload'>>(`SELECT payload FROM webhook_events WHERE provider='local' AND event_id=$1`, [`created-${body.data.chargeId}`])).rows.at(0)?.payload as Record<string, any> | undefined; if (!created) throw notFound('Cobrança desconhecida');
    const brl = await toBrlCents(created.totalMinor, created.currency); const credits = Number(created.credits); const ref = body.data.chargeId;
    const fresh = await asSystem(async (db) => { const r = await db.query(`INSERT INTO transactions (user_id,type,amount_cents,credits_delta,source,external_ref,currency,amount_brl_cents,tax_cents,region,method) VALUES ($1,'credit_purchase',$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING RETURNING id`, [created.userId, created.totalMinor, credits, `local:${created.method}`, ref, created.currency, brl, created.taxMinor, created.region, created.method]);
      if (!r.rowCount) return false; await usersRepo.addCredits(db, created.userId, credits); await audit(db, null, 'payment.credits', 'user', created.userId, { ref, credits, method: created.method, region: created.region }); return true; });
    await pool.query('UPDATE webhook_events SET processed_at=now() WHERE id=$1', [ins.rows[0].id]); if (fresh) await growthHooks.onRevenue(created.userId, { source: `local:${created.method}`, ref, kind: 'credits', credits, method: created.method });
    return { received: true, duplicate: false, granted: fresh };
  },
  /** Comissão efetiva do marketplace para um criador (verificado → menor). `null` = padrão da plataforma. */
  async feePctFor(creatorId: string): Promise<number | null> { const r = await pool.query('SELECT creator_verified FROM user_public_profiles WHERE id=$1', [creatorId]); /* RLS: o comprador lê só o selo público do criador (view), não a linha de users */ return r.rows.at(0)?.creator_verified ? (await growthSettings()).creatorVerifiedFeePct : null; },
  async setCreatorVerified(actor: string, userId: string, verified: boolean) { return asSystem(async (db) => { const r = await db.query('UPDATE users SET creator_verified=$2 WHERE id=$1 RETURNING creator_verified', [userId, verified]); if (!r.rows[0]) throw notFound('Usuário não encontrado'); await audit(db, actor, 'creator.verify', 'user', userId, { verified }); return { creatorVerified: r.rows[0].creator_verified as boolean }; }); },
  async setRegionPrices(actor: string, region: string, patch: Partial<{ planProPriceCents: number; planBusinessPriceCents: number; taxPct: number; active: boolean }>) {
    const r = await pool.query(`UPDATE pricing_regions SET plan_pro_price_cents=COALESCE($2,plan_pro_price_cents), plan_business_price_cents=COALESCE($3,plan_business_price_cents), tax_pct=COALESCE($4,tax_pct), active=COALESCE($5,active) WHERE region=$1 RETURNING region`, [region, patch.planProPriceCents ?? null, patch.planBusinessPriceCents ?? null, patch.taxPct ?? null, patch.active ?? null]); if (!r.rows[0]) throw notFound('Região não encontrada');
    await invalidatePricing(); await asSystem((db) => audit(db, actor, 'pricing.update', 'pricing_region', region, patch)); return { region };
  },
  /** Painel de monetização: conversão free→pago, ARPU/ARPPU (BRL), mix e MRR por região — base BRL normalizada. */
  async summary(days = 30) {
    const r = (await pool.query(`WITH w AS (SELECT now() - make_interval(days => $1) AS since),
      us AS (SELECT count(*)::int total, count(*) FILTER (WHERE plan<>'free')::int paid FROM users WHERE deleted_at IS NULL),
      rev AS (SELECT COALESCE(sum(COALESCE(amount_brl_cents,amount_cents)),0)::bigint cents, count(DISTINCT user_id)::int payers, count(*) FILTER (WHERE type='subscription')::int subs, count(*) FILTER (WHERE type='credit_purchase')::int packs FROM transactions, w WHERE type IN ('subscription','credit_purchase') AND created_at >= w.since),
      act AS (SELECT count(DISTINCT user_id)::int n FROM projects, w WHERE created_at >= w.since)
      SELECT us.total, us.paid, rev.cents, rev.payers, rev.subs, rev.packs, act.n AS active FROM us, rev, act`, [days])).rows[0];
    const byRegion = (await pool.query(`SELECT COALESCE(region,'BR') AS region, currency, count(*)::int n, sum(amount_cents)::bigint local_cents, sum(COALESCE(amount_brl_cents,amount_cents))::bigint brl_cents FROM transactions WHERE type IN ('subscription','credit_purchase') AND created_at >= now() - make_interval(days => $1) GROUP BY 1,2 ORDER BY brl_cents DESC`, [days])).rows;
    return { days, usersTotal: r.total, usersPaid: r.paid, conversionFreeToPaid: r.total ? r.paid / r.total : 0, revenueBrlCents: Number(r.cents), payers: r.payers, subscriptions: r.subs, creditPacks: r.packs, arpuBrlCents: r.active ? Math.round(Number(r.cents) / r.active) : 0, arppuBrlCents: r.payers ? Math.round(Number(r.cents) / r.payers) : 0, byRegion: byRegion.map((x) => ({ region: x.region, currency: String(x.currency).trim(), transactions: x.n, localCents: Number(x.local_cents), brlCents: Number(x.brl_cents) })) };
  },
};
