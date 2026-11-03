import { pool, readPool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { AppError, notFound } from '../../utils/errors.js';
import { PLANS } from '../payments/payments.service.js';
import { queueSnapshot } from '../../queues/index.js';
import { audit } from '../../repositories/audit.js';
import { invalidateUserState } from '../../middlewares/auth.js';
import { userDto, usersRepo } from '../users/users.repository.js';
import { encodeCursor, decodeCursor } from '../../utils/validate.js';
import { m } from '../../observability/metrics.js';

const q = async <T = Record<string, any>>(sql: string, a: unknown[] = []): Promise<T[]> => (await readPool.query(sql, a)).rows as T[];
export const adminService = {
  /** Painel de métricas de negócio (MRR, receita, funil, IA, filas…). */
  async metrics() {
    const [users] = await q<{ total: number; new7d: number; pro: number; business: number; banned: number }>(`SELECT count(*)::int total, count(*) FILTER (WHERE created_at > now()-interval '7 days')::int new7d, count(*) FILTER (WHERE plan='pro' AND subscription_status='active')::int pro, count(*) FILTER (WHERE plan='business' AND subscription_status='active')::int business, count(*) FILTER (WHERE banned)::int banned FROM users WHERE deleted_at IS NULL`);
    const mrrCents = users.pro * PLANS.pro.priceCents + users.business * PLANS.business.priceCents; m.mrr.set(mrrCents);
    const [rev] = await q<{ gross: number; creditsSales: number; payouts: number }>(`SELECT COALESCE(sum(amount_cents) FILTER (WHERE type IN ('subscription','credit_purchase')),0)::bigint gross, COALESCE(sum(amount_cents) FILTER (WHERE type='credit_purchase'),0)::bigint "creditsSales", COALESCE(sum(-amount_cents) FILTER (WHERE type='payout'),0)::bigint payouts FROM transactions`);
    const [mkt] = await q<{ sales: number; gmvCredits: number; feeCredits: number }>(`SELECT count(*)::int sales, COALESCE(sum(price_credits),0)::int "gmvCredits", COALESCE(sum(fee_credits),0)::int "feeCredits" FROM template_purchases WHERE price_credits>0`);
    const [aff] = await q<{ clicks: number; conversions: number; commissionCents: number }>(`SELECT COALESCE(sum(clicks),0)::int clicks, COALESCE(sum(conversions),0)::int conversions, COALESCE(sum(commission_cents),0)::bigint "commissionCents" FROM affiliate_links`);
    const [pubs] = await q<{ ok: number; failed: number; total: number }>(`SELECT count(*) FILTER (WHERE status='published')::int ok, count(*) FILTER (WHERE status='failed')::int failed, count(*)::int total FROM publications WHERE created_at > now()-interval '7 days'`);
    const ai = await q<{ provider: string; calls: number; costCents: number; failures: number }>(`SELECT provider, count(*)::int calls, COALESCE(sum(cost_cents),0)::float "costCents", count(*) FILTER (WHERE status<>'ok')::int failures FROM ai_usage WHERE created_at > now()-interval '24 hours' GROUP BY provider`);
    const [projects] = await q<{ total: number; ready: number; last24h: number }>(`SELECT count(*)::int total, count(*) FILTER (WHERE status='ready')::int ready, count(*) FILTER (WHERE created_at > now()-interval '24 hours')::int last24h FROM projects WHERE deleted_at IS NULL`);
    const [pend] = await q<{ payouts: number; templates: number; reports: number }>(`SELECT (SELECT count(*) FROM payout_requests WHERE status='pending')::int payouts, (SELECT count(*) FROM templates WHERE moderation_status='pending' AND deleted_at IS NULL)::int templates, (SELECT count(*) FROM reports WHERE status='open')::int reports`);
    return { users, mrrCents, arrCents: mrrCents * 12, revenue: rev, marketplace: { ...mkt, platformFeePct: 20 }, affiliates: aff, publications: { ...pubs, successRate: pubs.total ? Math.round((pubs.ok / pubs.total) * 1000) / 10 : null }, ai, projects, pending: pend, queues: await queueSnapshot(), generatedAt: new Date().toISOString() };
  },
  async users(p: { search?: string; cursor?: string; limit: number }) {
    const cur = decodeCursor<{ at: string; id: string }>(p.cursor); const args: unknown[] = [p.limit + 1]; let w = 'deleted_at IS NULL';
    if (p.search) { args.push(`%${p.search}%`); w += ` AND (email ILIKE $${args.length} OR name ILIKE $${args.length})`; } if (cur) { args.push(cur.at, cur.id); w += ` AND (created_at,id) < ($${args.length - 1}, $${args.length})`; }
    const rows = await q<any>(`SELECT * FROM users WHERE ${w} ORDER BY created_at DESC, id DESC LIMIT $1`, args); const page = rows.slice(0, p.limit);
    return { items: page.map(userDto), nextCursor: rows.length > p.limit ? encodeCursor({ at: page.at(-1)!.created_at, id: page.at(-1)!.id }) : null };
  },
  async patchUser(adminId: string, id: string, patch: { banned?: boolean; plan?: 'free' | 'pro' | 'business'; creditsDelta?: number }) {
    const u = await usersRepo.byId(pool, id); if (!u) throw notFound('Usuário não encontrado'); if (id === adminId && patch.banned) throw new AppError(409, 'self_ban', 'Você não pode suspender a si mesmo');
    if (patch.banned !== undefined) await pool.query('UPDATE users SET banned=$2 WHERE id=$1', [id, patch.banned]); if (patch.plan) await pool.query('UPDATE users SET plan=$2 WHERE id=$1', [id, patch.plan]);
    if (patch.creditsDelta) { if (patch.creditsDelta < 0) { if (!(await usersRepo.debitCredits(pool, id, -patch.creditsDelta))) throw new AppError(409, 'insufficient_credits', 'Saldo menor que o ajuste'); } else await usersRepo.addCredits(pool, id, patch.creditsDelta);
      await usersRepo.tx(pool, { userId: id, type: 'admin_adjustment', amountCents: 0, creditsDelta: patch.creditsDelta, source: 'admin', externalRef: `adj-${id}-${Date.now()}` }); }
    await invalidateUserState(id); await audit(pool, adminId, 'admin.user_patch', 'user', id, patch as Record<string, unknown>); return userDto((await usersRepo.byId(pool, id))!);
  },
  async payouts(status?: string) { return { items: (await q<any>(`SELECT p.*, u.email FROM payout_requests p JOIN users u ON u.id=p.user_id ${status ? 'WHERE p.status=$1' : ''} ORDER BY p.requested_at DESC LIMIT 200`, status ? [status] : [])).map((r) => ({ id: r.id, userId: r.user_id, email: r.email, source: r.source, amountCents: r.amount_cents, status: r.status, requestedAt: r.requested_at, processedAt: r.processed_at, reason: r.reason })) }; },
  async auditLogs(p: { actor?: string; action?: string; limit: number }) { const a: unknown[] = [p.limit]; let w = 'true'; if (p.actor) { a.push(p.actor); w += ` AND actor_id=$${a.length}`; } if (p.action) { a.push(`${p.action}%`); w += ` AND action LIKE $${a.length}`; } return { items: (await q<any>(`SELECT * FROM audit_logs WHERE ${w} ORDER BY created_at DESC LIMIT $1`, a)).map((r) => ({ id: r.id, actorId: r.actor_id, action: r.action, targetType: r.target_type, targetId: r.target_id, metadata: r.metadata, createdAt: r.created_at })) }; },
  async reports() { return { items: (await q<any>(`SELECT * FROM reports ORDER BY created_at DESC LIMIT 100`)) }; },
  async dlq() { const s = await queueSnapshot(); return { queues: Object.fromEntries(Object.entries(s).filter(([, v]) => v.dlq > 0 || v.failed > 0)) }; },
  async ping() { return redis.ping(); },
};
