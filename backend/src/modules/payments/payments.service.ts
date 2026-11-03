import { payoutGuard } from '../governance/payoutGuard.js';
import { pool, asSystem } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { hmacHex, safeEqual, randomToken } from '../../utils/crypto.js';
import { AppError, notFound, unprocessable } from '../../utils/errors.js';
import { usersRepo } from '../users/users.repository.js';
import { audit } from '../../repositories/audit.js';
import { enqueue, Q } from '../../queues/index.js';
import { logger } from '../../observability/logger.js';
import { growthHooks } from '../growth/hooks.js';
import { experimentsService } from '../experiments/experiments.service.js';
import type { Row } from '../../db/rows.generated.js';

export const CREDIT_VALUE_CENTS = 38; export const MIN_PAYOUT_CENTS = 5000; export const AUTO_APPROVE_BELOW_CENTS = 50000;
export const PLANS = { pro: { priceCents: 4900, name: 'Pro' }, business: { priceCents: 19900, name: 'Business' } } as const;
export const PACKS: Record<string, { credits: number; priceCents: number }> = { p50: { credits: 50, priceCents: 1900 }, p120: { credits: 120, priceCents: 4500 }, p300: { credits: 300, priceCents: 10900 } };
const mock = () => env.PAYMENTS_MODE === 'mock';

async function stripe(path: string, body: Record<string, string>): Promise<any> {
  const r = await fetch(`https://api.stripe.com/v1/${path}`, { method: 'POST', headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const j = await r.json() as any; if (!r.ok) throw new AppError(502, 'payment_provider_error', j?.error?.message ?? 'Erro no provedor de pagamento'); return j;
}
/** Verificação do header `Stripe-Signature` (t=…,v1=…) sobre o corpo cru, tolerância 5 min. */
export function verifyStripeSignature(raw: Buffer, header: string, secret = env.STRIPE_WEBHOOK_SECRET, now = Date.now()): boolean {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string])); const t = Number(parts.t); if (!t || Math.abs(now / 1000 - t) > 300) return false;
  return !!parts.v1 && safeEqual(hmacHex(secret, `${t}.${raw.toString()}`), parts.v1);
}
export const signStripe = (raw: string, secret = env.STRIPE_WEBHOOK_SECRET, t = Math.floor(Date.now() / 1000)) => `t=${t},v1=${hmacHex(secret, `${t}.${raw}`)}`;
export const verifyPixSignature = (raw: Buffer, sig: string) => !!sig && safeEqual(hmacHex(env.PIX_WEBHOOK_SECRET, raw), sig);

const payoutDto = (r: Row<'payout_requests'>) => ({ id: r.id, source: r.source, amountCents: r.amount_cents, status: r.status, requestedAt: r.requested_at, processedAt: r.processed_at, gatewayRef: r.gateway_ref, reason: r.reason, awaitingSecondApproval: r.status === 'pending' && !!r.first_approver, holdReason: r.hold_reason ?? null });

export const paymentsService = {
  catalog() { return { plans: Object.entries(PLANS).map(([id, p]) => ({ id, ...p })), creditPacks: Object.entries(PACKS).map(([id, p]) => ({ id, ...p })), creditValueCents: CREDIT_VALUE_CENTS, minPayoutCents: MIN_PAYOUT_CENTS, autoApproveBelowCents: AUTO_APPROVE_BELOW_CENTS }; },
  /** `priceKey` (experimento de preço) é SEMPRE revalidado contra a atribuição do usuário: o cliente não escolhe o preço. */
  async checkoutSubscription(userId: string, plan: 'pro' | 'business', priceKey?: string) {
    const u = (await usersRepo.byId(pool, userId))!; const p = PLANS[plan];
    let stripePriceOverride = ''; if (plan === 'pro' && priceKey && priceKey !== 'pro') {
      const a = await experimentsService.assign(userId, 'paywall_price'); const expected = a.variant === 'control' ? 'pro' : `pro_${a.variant}`;
      if (a.inExperiment && priceKey === expected) stripePriceOverride = priceKey === 'pro_low' ? env.STRIPE_PRICE_PRO_LOW : priceKey === 'pro_high' ? env.STRIPE_PRICE_PRO_HIGH : '';
    }
    if (mock()) { const id = `cs_mock_${randomToken(9)}`; await pool.query(`INSERT INTO webhook_events (provider,event_id,event_type,payload,processed_at) VALUES ('checkout',$1,'created',$2,now())`, [id, JSON.stringify({ userId, kind: 'subscription', plan })]); return { sessionId: id, url: `${env.PUBLIC_APP_URL}/checkout/mock?session=${id}`, mode: 'mock' as const, amountCents: p.priceCents }; }
    const price = stripePriceOverride || (plan === 'pro' ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_BUSINESS); const s = await stripe('checkout/sessions', { mode: 'subscription', 'line_items[0][price]': price, 'line_items[0][quantity]': '1', client_reference_id: userId, customer_email: u.email, 'metadata[kind]': 'subscription', 'metadata[plan]': plan, 'metadata[userId]': userId, success_url: `${env.PUBLIC_APP_URL}/billing/success`, cancel_url: `${env.PUBLIC_APP_URL}/billing/cancel` });
    return { sessionId: s.id as string, url: s.url as string, mode: 'real' as const, amountCents: p.priceCents };
  },
  async checkoutCredits(userId: string, packId: string) {
    const pack = PACKS[packId]; if (!pack) throw unprocessable('Pacote inválido');
    if (mock()) { const id = `cs_mock_${randomToken(9)}`; await pool.query(`INSERT INTO webhook_events (provider,event_id,event_type,payload,processed_at) VALUES ('checkout',$1,'created',$2,now())`, [id, JSON.stringify({ userId, kind: 'credits', packId })]); return { sessionId: id, url: `${env.PUBLIC_APP_URL}/checkout/mock?session=${id}`, mode: 'mock' as const, ...pack }; }
    const s = await stripe('checkout/sessions', { mode: 'payment', 'line_items[0][price_data][currency]': 'brl', 'line_items[0][price_data][unit_amount]': String(pack.priceCents), 'line_items[0][price_data][product_data][name]': `${pack.credits} créditos NexusReel`, 'line_items[0][quantity]': '1', client_reference_id: userId, 'metadata[kind]': 'credits', 'metadata[packId]': packId, 'metadata[userId]': userId, success_url: `${env.PUBLIC_APP_URL}/billing/success`, cancel_url: `${env.PUBLIC_APP_URL}/billing/cancel` });
    return { sessionId: s.id as string, url: s.url as string, mode: 'real' as const, ...pack };
  },
  /** Pix (Mercado Pago / Pagar.me). Mock devolve um "copia e cola" sintético; a confirmação chega por webhook assinado. */
  async createPix(userId: string, packId: string) {
    const pack = PACKS[packId]; if (!pack) throw unprocessable('Pacote inválido'); const chargeId = `pix_${mock() ? 'mock_' : ''}${randomToken(9)}`;
    if (!mock()) throw new AppError(501, 'not_implemented', `Pix real (${env.PIX_PROVIDER}) requer credenciais e homologação — TODO: implementar chamada ao provedor; ver docs/DEPLOY.md`);
    await pool.query(`INSERT INTO webhook_events (provider,event_id,event_type,payload,processed_at) VALUES ('pix',$1,'created',$2,now())`, [`created-${chargeId}`, JSON.stringify({ userId, kind: 'credits', packId, chargeId })]);
    return { chargeId, amountCents: pack.priceCents, credits: pack.credits, copyPaste: `00020126MOCKPIX${chargeId}`, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), mode: 'mock' as const };
  },
  /** Processa evento (já deduplicado em webhook_events). Idempotente também via transactions UNIQUE(source, external_ref). */
  async applyEvent(provider: 'stripe' | 'pix', ev: { id: string; type: string; data: Record<string, any> }) {
    const d = ev.data;
    if (provider === 'stripe' && ev.type === 'checkout.session.completed') {
      const userId = d.metadata?.userId ?? d.client_reference_id; if (!userId) return; const kind = d.metadata?.kind;
      if (kind === 'credits') return this.grantCredits(userId, d.metadata.packId, 'stripe', d.id, d.amount_total);
      if (kind === 'subscription') { const plan = d.metadata.plan as 'pro' | 'business'; return this.activateSubscription(userId, plan, d.id, d.amount_total ?? PLANS[plan].priceCents, d.customer); }
    } else if (provider === 'stripe' && ev.type === 'customer.subscription.deleted') {
      const userId = d.metadata?.userId; if (userId) await asSystem(async (db) => { await db.query(`UPDATE users SET plan='free', subscription_status='canceled' WHERE id=$1`, [userId]); await audit(db, null, 'subscription.canceled', 'user', userId); });
    } else if (provider === 'stripe' && ev.type === 'invoice.payment_failed') {
      const userId = d.metadata?.userId; if (userId) await pool.query(`UPDATE users SET subscription_status='past_due' WHERE id=$1`, [userId]);
    } else if (provider === 'pix' && ev.type === 'pix.paid') {
      const created = (await pool.query<Pick<Row<'webhook_events'>, 'payload'>>(`SELECT payload FROM webhook_events WHERE provider='pix' AND event_id=$1`, [`created-${d.chargeId}`])).rows.at(0)?.payload as { userId: string; packId: string }; if (!created) throw notFound('Cobrança Pix desconhecida');
      return this.grantCredits(created.userId, created.packId, 'pix', d.chargeId, PACKS[created.packId]!.priceCents);
    } else logger.debug({ type: ev.type }, 'evento de pagamento ignorado');
  },
  async grantCredits(userId: string, packId: string, source: string, ref: string, amountCents?: number) {
    const pack = PACKS[packId]; if (!pack) throw unprocessable('Pacote inválido');
    return asSystem(async (db) => { const fresh = await usersRepo.tx(db, { userId, type: 'credit_purchase', amountCents: amountCents ?? pack.priceCents, creditsDelta: pack.credits, source, externalRef: ref }); if (fresh) { await usersRepo.addCredits(db, userId, pack.credits); await audit(db, null, 'payment.credits', 'user', userId, { ref, credits: pack.credits }); } return { granted: fresh }; }).then(async (r) => { if (r.granted) await growthHooks.onRevenue(userId, { source, ref, kind: 'credits', credits: pack.credits }); return r; });
  },
  async activateSubscription(userId: string, plan: 'pro' | 'business', ref: string, amountCents: number, customerId?: string) {
    return asSystem(async (db) => { const fresh = await usersRepo.tx(db, { userId, type: 'subscription', amountCents, source: 'stripe', externalRef: ref });
      if (fresh) { await db.query(`UPDATE users SET plan=$2, subscription_status='active', stripe_customer_id=COALESCE($3, stripe_customer_id) WHERE id=$1`, [userId, plan, customerId ?? null]); await audit(db, null, 'subscription.activated', 'user', userId, { plan, ref }); } return { activated: fresh }; }).then(async (r) => { if (r.activated) await growthHooks.onRevenue(userId, { source: 'stripe', ref, kind: 'subscription', plan }); return r; });
  },
  async transactions(userId: string, limit = 50) { return { items: (await pool.query<Pick<Row<'transactions'>, 'id' | 'type' | 'amount_cents' | 'credits_delta' | 'source' | 'created_at'>>('SELECT id,type,amount_cents,credits_delta,source,created_at FROM transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, limit])).rows.map((r) => ({ id: r.id, type: r.type, amountCents: r.amount_cents, creditsDelta: r.credits_delta, source: r.source, createdAt: r.created_at })) }; },

  /** Saque: saldo é reservado (debitado) no pedido; < R$500 aprova e paga automático (Stripe Connect), ≥ R$500 fica pendente para o admin. */
  async requestPayout(userId: string, source: 'affiliate' | 'marketplace', amountCents: number) {
    if (amountCents < MIN_PAYOUT_CENTS) throw unprocessable(`Saque mínimo de R$ ${(MIN_PAYOUT_CENTS / 100).toFixed(2)}`);
    await payoutGuard.beforeRequest(userId, amountCents, source);
    const col = source === 'affiliate' ? 'affiliate_balance_cents' : 'marketplace_balance_cents';
    const row = await asSystem(async (db) => {
      const ok = await db.query(`UPDATE users SET ${col}=${col}-$2 WHERE id=$1 AND ${col}>=$2`, [userId, amountCents]); if (!ok.rowCount) throw new AppError(402, 'insufficient_balance', 'Saldo insuficiente');
      const p = (await db.query<Row<'payout_requests'>>(`INSERT INTO payout_requests (user_id,source,amount_cents) VALUES ($1,$2,$3) RETURNING *`, [userId, source, amountCents])).rows[0];
      await audit(db, userId, 'payout.request', 'payout', p.id, { amountCents, source }); return p; });
    if (amountCents < AUTO_APPROVE_BELOW_CENTS) return payoutDto(await this.settle(row.id, null, true));
    return payoutDto(row);
  },
  async transfer(userId: string, amountCents: number, payoutId: string): Promise<string> {
    if (mock()) return `tr_mock_${payoutId.slice(0, 8)}`;
    const u = await pool.query<Pick<Row<'users'>, 'stripe_customer_id'>>(`SELECT stripe_customer_id FROM users WHERE id=$1`, [userId]); if (!u.rows.at(0)?.stripe_customer_id) throw new AppError(409, 'payout_account_missing', 'Conta de recebimento (Stripe Connect) não configurada');
    const t = await stripe('transfers', { amount: String(amountCents), currency: 'brl', destination: u.rows[0].stripe_customer_id as string, 'metadata[payoutId]': payoutId }); return t.id as string;
  },
  async settle(id: string, adminId: string | null, auto: boolean) {
    await payoutGuard.screen(id, adminId);
    return asSystem(async (db) => {
      const p = (await db.query<Row<'payout_requests'>>(`SELECT * FROM payout_requests WHERE id=$1 FOR UPDATE`, [id])).rows[0]; if (!p) throw notFound(); if (p.status !== 'pending') throw new AppError(409, 'already_processed', 'Saque já processado');
      const gate = await payoutGuard.beforeSettle(db, p, adminId, auto); if (gate === 'second_approval_needed') return (await db.query<Row<'payout_requests'>>(`SELECT * FROM payout_requests WHERE id=$1`, [id])).rows[0];
      let ref: string; try { ref = await this.transfer(p.user_id, p.amount_cents, id); } catch (e) { await audit(db, adminId, 'payout.transfer_failed', 'payout', id, { error: (e as Error).message }); throw e; }
      const r = (await db.query<Row<'payout_requests'>>(`UPDATE payout_requests SET status='paid', processed_at=now(), processed_by=$2, gateway_ref=$3 WHERE id=$1 RETURNING *`, [id, adminId, ref])).rows[0];
      await usersRepo.tx(db, { userId: p.user_id, type: 'payout', amountCents: -p.amount_cents, source: 'payout', externalRef: `payout-${id}` });
      await audit(db, adminId, auto ? 'payout.auto_approved' : 'payout.approved', 'payout', id, { amountCents: p.amount_cents, ref }); return r; });
  },
  async decide(id: string, adminId: string, approve: boolean, reason?: string) {
    if (approve) return payoutDto(await this.settle(id, adminId, false));
    return asSystem(async (db) => { const p = (await db.query<Row<'payout_requests'>>(`SELECT * FROM payout_requests WHERE id=$1 FOR UPDATE`, [id])).rows[0]; if (!p) throw notFound(); if (p.status !== 'pending') throw new AppError(409, 'already_processed', 'Saque já processado');
      const col = p.source === 'affiliate' ? 'affiliate_balance_cents' : 'marketplace_balance_cents'; await db.query(`UPDATE users SET ${col}=${col}+$2 WHERE id=$1`, [p.user_id, p.amount_cents]);
      const r = (await db.query<Row<'payout_requests'>>(`UPDATE payout_requests SET status='rejected', processed_at=now(), processed_by=$2, reason=$3 WHERE id=$1 RETURNING *`, [id, adminId, reason ?? null])).rows[0];
      await audit(db, adminId, 'payout.rejected', 'payout', id, { reason }); return payoutDto(r); });
  },
  async payouts(userId: string) { return { items: (await pool.query<Row<'payout_requests'>>('SELECT * FROM payout_requests WHERE user_id=$1 ORDER BY requested_at DESC LIMIT 100', [userId])).rows.map(payoutDto) }; },
  payoutDto,
  async ingestWebhook(provider: 'stripe' | 'pix', raw: Buffer, body: any) {
    const id = String(body.id ?? ''); if (!id) throw unprocessable('evento sem id'); const type = String(body.type ?? '');
    const ins = await pool.query<{ id: string }>(`INSERT INTO webhook_events (provider,event_id,event_type,payload) VALUES ($1,$2,$3,$4) ON CONFLICT (provider,event_id) DO NOTHING RETURNING id`, [provider, id, type, raw.toString()]);
    if (ins.rowCount) await enqueue(Q.whStripe, 'payment-event', { provider, webhookId: ins.rows[0].id, id, type, data: body.data?.object ?? body.data ?? {} }, { jobId: `wh-${provider}-${id}`.replace(/:/g, '_') });
    return { received: true, duplicate: !ins.rowCount };
  },
};
