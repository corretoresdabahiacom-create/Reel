import { pool, asSystem, asUser } from '../../db/pool.js';
import { AppError, conflict, notFound, forbidden, unprocessable } from '../../utils/errors.js';
import { usersRepo } from '../users/users.repository.js';
import { aiProvider } from '../../providers/ai/router.js';
import { audit } from '../../repositories/audit.js';
import { CREDIT_VALUE_CENTS } from '../payments/payments.service.js';
import { encodeCursor, decodeCursor } from '../../utils/validate.js';
import { m } from '../../observability/metrics.js';
import { monetizationService } from '../monetization/monetization.service.js';
import type { Row } from '../../db/rows.generated.js';

export const MARKETPLACE_FEE_PCT = 20;
export const split = (price: number, feePct: number = MARKETPLACE_FEE_PCT) => { const fee = Math.round((price * feePct) / 100); return { fee, creator: price - fee }; };
const dto = (r: Row<'templates'>, extra: { owned?: boolean; sceneStructure?: undefined; promptHints?: undefined } = {}) => ({ id: r.id, creatorId: r.creator_id, name: r.name, description: r.description, category: r.category, tags: r.tags, priceCredits: r.price_credits, previewUrl: r.preview_url, sceneStructure: r.scene_structure, promptHints: r.prompt_hints, voiceId: r.voice_id, trackId: r.track_id, captionStyle: r.caption_style, locale: r.locale, ratingAvg: r.rating_avg, ratingCount: r.rating_count, usageCount: r.usage_count, status: r.moderation_status, rejectionReason: r.rejection_reason, createdAt: r.created_at, ...extra });
export interface TemplateInput { name: string; description?: string; category?: string; tags?: string[]; priceCredits: number; sceneStructure: unknown[]; promptHints?: string[]; voiceId?: string; trackId?: string; captionStyle?: string; locale?: string }

export const marketplaceService = {
  async list(q: { search?: string; category?: string; sort?: 'popular' | 'new' | 'rating' | 'price'; cursor?: string; limit: number }, userId?: string) {
    const cur = decodeCursor<{ o: number }>(q.cursor); const offset = cur?.o ?? 0; const args: unknown[] = []; const w = [`t.moderation_status='approved'`, 't.deleted_at IS NULL'];
    if (q.search) { args.push(`%${q.search}%`); w.push(`(t.name ILIKE $${args.length} OR t.description ILIKE $${args.length})`); }
    if (q.category) { args.push(q.category); w.push(`t.category=$${args.length}`); }
    const order = { popular: 't.usage_count DESC', new: 't.created_at DESC', rating: 't.rating_avg DESC, t.rating_count DESC', price: 't.price_credits ASC' }[q.sort ?? 'popular']; args.push(q.limit + 1, offset);
    const rows = (await pool.query(`SELECT t.* FROM templates t WHERE ${w.join(' AND ')} ORDER BY ${order}, t.id LIMIT $${args.length - 1} OFFSET $${args.length}`, args)).rows;
    const owned = userId ? new Set((await pool.query<Pick<Row<'template_purchases'>, 'template_id'>>('SELECT template_id FROM template_purchases WHERE buyer_id=$1', [userId])).rows.map((r) => r.template_id as string)) : new Set<string>();
    const page = rows.slice(0, q.limit); return { items: page.map((r) => dto(r, { owned: owned.has(r.id) || r.creator_id === userId || r.price_credits === 0 })), nextCursor: rows.length > q.limit ? encodeCursor({ o: offset + q.limit }) : null };
  },
  async mine(userId: string) { return { items: (await asUser(userId, (db) => db.query<Row<'templates'>>('SELECT * FROM templates WHERE creator_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC', [userId]))).rows.map((r) => dto(r)) }; },
  async get(id: string, userId?: string) {
    const r = (await pool.query<Row<'templates'>>('SELECT * FROM templates WHERE id=$1 AND deleted_at IS NULL', [id])).rows[0]; if (!r) throw notFound('Template não encontrado');
    if (r.moderation_status !== 'approved' && r.creator_id !== userId) throw notFound('Template não encontrado');
    const owned = !!userId && (r.creator_id === userId || r.price_credits === 0 || !!(await pool.query<{ "?column?": number | null }>('SELECT 1 FROM template_purchases WHERE template_id=$1 AND buyer_id=$2', [id, userId])).rowCount);
    return dto(r, { owned, ...(owned ? {} : { sceneStructure: undefined, promptHints: undefined }) });
  },
  async create(userId: string, t: TemplateInput) {
    const mod = await aiProvider.moderateContent(`${t.name}\n${t.description ?? ''}\n${(t.promptHints ?? []).join('\n')}`, []); if (!mod.allowed) throw unprocessable('O template viola as políticas de conteúdo', { categories: mod.categories });
    const r = await asUser(userId, (db) => db.query<Row<'templates'>>(`INSERT INTO templates (creator_id,name,description,category,tags,price_credits,scene_structure,prompt_hints,voice_id,track_id,caption_style,locale,moderation_status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending') RETURNING *`,
      [userId, t.name, t.description ?? '', t.category ?? 'geral', t.tags ?? [], t.priceCredits, JSON.stringify(t.sceneStructure), t.promptHints ?? [], t.voiceId ?? null, t.trackId ?? null, t.captionStyle ?? null, t.locale ?? 'pt-BR']));
    await audit(pool, userId, 'template.create', 'template', r.rows[0].id); return dto(r.rows[0]);
  },
  async update(userId: string, id: string, patch: Partial<TemplateInput>) {
    const cur = (await asUser(userId, (db) => db.query<Row<'templates'>>('SELECT * FROM templates WHERE id=$1 AND creator_id=$2 AND deleted_at IS NULL', [id, userId]))).rows[0]; if (!cur) throw notFound();
    const n = { ...{ name: cur.name, description: cur.description, category: cur.category, tags: cur.tags, priceCredits: cur.price_credits, sceneStructure: cur.scene_structure, promptHints: cur.prompt_hints }, ...patch };
    const r = await asUser(userId, (db) => db.query<Row<'templates'>>(`UPDATE templates SET name=$3,description=$4,category=$5,tags=$6,price_credits=$7,scene_structure=$8,prompt_hints=$9,moderation_status='pending',rejection_reason=NULL WHERE id=$1 AND creator_id=$2 RETURNING *`, [id, userId, n.name, n.description, n.category, n.tags, n.priceCredits, JSON.stringify(n.sceneStructure), n.promptHints]));
    return dto(r.rows[0]); // edição volta para moderação
  },
  async remove(userId: string, id: string) { const r = await asUser(userId, (db) => db.query('UPDATE templates SET deleted_at=now() WHERE id=$1 AND creator_id=$2 AND deleted_at IS NULL', [id, userId])); if (!r.rowCount) throw notFound(); return { deleted: true }; },
  /** Compra atômica: débito do comprador + crédito do criador (80%) + taxa (20%) + transações. UNIQUE(template, buyer) garante idempotência. */
  async purchase(userId: string, id: string) {
    return asSystem(async (db) => {
      const t = (await db.query(`SELECT * FROM templates WHERE id=$1 AND deleted_at IS NULL AND moderation_status='approved' FOR SHARE`, [id])).rows[0]; if (!t) throw notFound('Template não encontrado');
      if (t.creator_id === userId) throw conflict('Você é o criador deste template', 'own_template');
      const ex = (await db.query<Row<'template_purchases'>>('SELECT * FROM template_purchases WHERE template_id=$1 AND buyer_id=$2', [id, userId])).rows[0]; if (ex) return { purchased: true, alreadyOwned: true, priceCredits: ex.price_credits };
      const { fee, creator } = split(t.price_credits, (await monetizationService.feePctFor(t.creator_id)) ?? MARKETPLACE_FEE_PCT); // criador verificado paga menos
      if (t.price_credits > 0 && !(await usersRepo.debitCredits(db, userId, t.price_credits))) throw new AppError(402, 'insufficient_credits', 'Créditos insuficientes');
      const ins = await db.query<{ id: string }>(`INSERT INTO template_purchases (template_id,buyer_id,price_credits,creator_share_credits,fee_credits) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`, [id, userId, t.price_credits, creator, fee]);
      if (!ins.rowCount) throw conflict('Compra já registrada', 'already_purchased');
      const pid = ins.rows[0].id as string; const earnCents = creator * CREDIT_VALUE_CENTS;
      if (t.price_credits > 0) {
        await usersRepo.tx(db, { userId, type: 'template_purchase', amountCents: 0, creditsDelta: -t.price_credits, source: 'marketplace', externalRef: `buy-${pid}` });
        await db.query('UPDATE users SET marketplace_balance_cents=marketplace_balance_cents+$2 WHERE id=$1', [t.creator_id, earnCents]);
        await usersRepo.tx(db, { userId: t.creator_id, type: 'template_sale', amountCents: earnCents, source: 'marketplace', externalRef: `sale-${pid}` }); m.credits.inc({ reason: 'template' }, t.price_credits);
      }
      await db.query('UPDATE templates SET usage_count=usage_count+1 WHERE id=$1', [id]); await audit(db, userId, 'template.purchase', 'template', id, { priceCredits: t.price_credits, feeCredits: fee, creatorCredits: creator });
      return { purchased: true, alreadyOwned: false, priceCredits: t.price_credits, feeCredits: fee, creatorShareCredits: creator, creatorEarningsCents: earnCents };
    });
  },
  async review(userId: string, id: string, stars: number, comment: string) {
    const t = (await pool.query<Pick<Row<'templates'>, 'creator_id' | 'price_credits'>>(`SELECT creator_id, price_credits FROM templates WHERE id=$1 AND moderation_status='approved'`, [id])).rows[0]; if (!t) throw notFound();
    if (t.creator_id === userId) throw forbidden('Não é possível avaliar o próprio template');
    if (t.price_credits > 0 && !(await pool.query<{ "?column?": number | null }>('SELECT 1 FROM template_purchases WHERE template_id=$1 AND buyer_id=$2', [id, userId])).rowCount) throw forbidden('Compre o template para avaliar');
    await asSystem(async (db) => { await db.query(`INSERT INTO template_reviews (template_id,user_id,stars,comment) VALUES ($1,$2,$3,$4) ON CONFLICT (template_id,user_id) DO UPDATE SET stars=EXCLUDED.stars, comment=EXCLUDED.comment`, [id, userId, stars, comment]);
      await db.query(`UPDATE templates SET rating_avg=(SELECT avg(stars) FROM template_reviews WHERE template_id=$1), rating_count=(SELECT count(*) FROM template_reviews WHERE template_id=$1) WHERE id=$1`, [id]); });
    return { ok: true };
  },
  async revenue(userId: string) {
    const u = (await usersRepo.byId(pool, userId))!;
    const s = (await pool.query<{ sales: number; creator_credits: number; fee_credits: number }>(`SELECT count(*)::int sales, COALESCE(sum(p.creator_share_credits),0)::int creator_credits, COALESCE(sum(p.fee_credits),0)::int fee_credits FROM template_purchases p JOIN templates t ON t.id=p.template_id WHERE t.creator_id=$1 AND p.price_credits>0`, [userId])).rows[0];
    return { balanceCents: u.marketplace_balance_cents, sales: s.sales, earnedCredits: s.creator_credits, earnedCents: s.creator_credits * CREDIT_VALUE_CENTS, platformFeeCredits: s.fee_credits, platformFeePct: MARKETPLACE_FEE_PCT };
  },
  // Admin
  async pendingQueue() { return { items: (await pool.query<{ id: string; creator_id: string; name: string; description: string; category: string; tags: string[]; price_credits: number; preview_url: string | null; scene_structure: unknown; prompt_hints: string[]; voice_id: string | null; track_id: string | null; caption_style: string | null; locale: string; rating_avg: number; rating_count: number; usage_count: number; moderation_status: string; rejection_reason: string | null; moderated_by: string | null; moderated_at: Date | null; created_at: Date; deleted_at: Date | null }>(`SELECT * FROM templates WHERE moderation_status='pending' AND deleted_at IS NULL ORDER BY created_at`)).rows.map((r) => dto(r)) }; },
  async moderate(adminId: string, id: string, approve: boolean, reason?: string) {
    const r = await pool.query<Row<'templates'>>(`UPDATE templates SET moderation_status=$2, rejection_reason=$3, moderated_by=$4, moderated_at=now() WHERE id=$1 AND deleted_at IS NULL RETURNING *`, [id, approve ? 'approved' : 'rejected', approve ? null : reason ?? 'Reprovado pela moderação', adminId]); if (!r.rowCount) throw notFound();
    await audit(pool, adminId, approve ? 'template.approve' : 'template.reject', 'template', id, { reason }); return dto(r.rows[0]);
  },
};
