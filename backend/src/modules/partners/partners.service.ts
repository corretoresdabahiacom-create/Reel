import { z } from 'zod';
import { pool, asSystem } from '../../db/pool.js';
import { audit } from '../../repositories/audit.js';
import { conflict, notFound } from '../../utils/errors.js';
import type { Row } from '../../db/rows.generated.js';

export const partnerInput = z.object({ partnerType: z.enum(['marketplace', 'agency', 'influencer', 'education', 'mei', 'ai_platform', 'integrator', 'affiliate_external']), name: z.string().min(2).max(120), code: z.string().regex(/^[a-z0-9_-]{3,40}$/),
  status: z.enum(['prospect', 'active', 'paused', 'terminated']).default('prospect'), revenueSharePct: z.number().min(0).max(60).default(0), contact: z.string().max(200).optional(), contractRef: z.string().max(120).optional() });
const dto = (r: Row<'partner_accounts'>) => ({ id: r.id, partnerType: r.partner_type, name: r.name, code: r.code, status: r.status, revenueSharePct: Number(r.revenue_share_pct), contact: r.contact, contractRef: r.contract_ref, createdAt: r.created_at });
export const partnersService = {
  async list() { return (await pool.query<Row<'partner_accounts'>>('SELECT * FROM partner_accounts ORDER BY created_at DESC')).rows.map(dto); },
  async create(actor: string, i: z.infer<typeof partnerInput>) {
    if ((await pool.query<{ "?column?": number | null }>('SELECT 1 FROM partner_accounts WHERE code=$1', [i.code])).rowCount) throw conflict('Código de parceiro já existe', 'partner_exists');
    return asSystem(async (db) => { const r = await db.query<Row<'partner_accounts'>>(`INSERT INTO partner_accounts (partner_type,name,code,status,revenue_share_pct,contact,contract_ref) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [i.partnerType, i.name, i.code, i.status, i.revenueSharePct, i.contact ?? null, i.contractRef ?? null]); await audit(db, actor, 'partner.create', 'partner', r.rows[0].id, { code: i.code, share: i.revenueSharePct }); return dto(r.rows[0]); });
  },
  async update(actor: string, id: string, p: Partial<z.infer<typeof partnerInput>>) {
    const map: Record<string, string> = { name: 'name', status: 'status', revenueSharePct: 'revenue_share_pct', contact: 'contact', contractRef: 'contract_ref', partnerType: 'partner_type' }; const sets: string[] = []; const v: unknown[] = [id];
    for (const [k, val] of Object.entries(p)) if (map[k] && val !== undefined) { v.push(val); sets.push(`${map[k]}=$${v.length}`); }
    if (!sets.length) { const r = await pool.query<Row<'partner_accounts'>>('SELECT * FROM partner_accounts WHERE id=$1', [id]); if (!r.rows[0]) throw notFound('Parceiro não encontrado'); return dto(r.rows[0]); }
    return asSystem(async (db) => { const r = await db.query(`UPDATE partner_accounts SET ${sets.join(',')} WHERE id=$1 RETURNING *`, v); if (!r.rows[0]) throw notFound('Parceiro não encontrado'); await audit(db, actor, 'partner.update', 'partner', id, p as Record<string, unknown>); return dto(r.rows[0]); });
  },
  /** Vincula o usuário ao parceiro (código no cadastro ou em utm_source=partner_<code>). Só parceiros ativos. */
  async attach(userId: string, code: string): Promise<boolean> {
    const r = await pool.query(`UPDATE users SET partner_id=(SELECT id FROM partner_accounts WHERE code=$2 AND status='active') WHERE id=$1 AND partner_id IS NULL AND EXISTS (SELECT 1 FROM partner_accounts WHERE code=$2 AND status='active') RETURNING id`, [userId, code.toLowerCase()]); return (r.rowCount ?? 0) > 0;
  },
  /** Venda originada: para cada transação paga de um usuário vinculado a um parceiro ATIVO (primeiros 12 meses), acumula a comissão sobre o valor líquido de imposto, em BRL. */
  async accrue(txId: string): Promise<{ accrued: boolean; shareCents?: number }> {
    const r = await pool.query<{ id: string; user_id: string; net: number | null; partner_id: string; revenue_share_pct: number; created_at: Date }>(`SELECT t.id, t.user_id, ROUND(COALESCE(t.amount_brl_cents, t.amount_cents)::numeric * (t.amount_cents - LEAST(t.tax_cents, t.amount_cents)) / t.amount_cents) AS net, p.id AS partner_id, p.revenue_share_pct, u.created_at
      FROM transactions t JOIN users u ON u.id=t.user_id JOIN partner_accounts p ON p.id=u.partner_id WHERE t.id=$1 AND p.status='active' AND t.type IN ('subscription','credit_purchase') AND t.amount_cents > 0`, [txId]);
    const x = r.rows[0]; if (!x || Date.now() - new Date(x.created_at).getTime() > 365 * 86_400_000) return { accrued: false };
    const share = Math.round((Number(x.net) * Number(x.revenue_share_pct)) / 100); const ins = await pool.query<{ id: string }>(`INSERT INTO partner_sales (partner_id,user_id,transaction_id,amount_cents,share_cents) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (transaction_id) DO NOTHING RETURNING id`, [x.partner_id, x.user_id, txId, x.net, share]);
    return { accrued: (ins.rowCount ?? 0) > 0, shareCents: share };
  },
  async sales(partnerId: string) {
    const p = (await pool.query<Row<'partner_accounts'>>('SELECT * FROM partner_accounts WHERE id=$1', [partnerId])).rows[0]; if (!p) throw notFound('Parceiro não encontrado');
    const s = (await pool.query<{ sales: number; gross: number; share: number; owed: number; paid: number }>(`SELECT count(*)::int sales, COALESCE(sum(amount_cents),0)::bigint gross, COALESCE(sum(share_cents),0)::bigint share, COALESCE(sum(share_cents) FILTER (WHERE status='accrued'),0)::bigint owed, COALESCE(sum(share_cents) FILTER (WHERE status='paid'),0)::bigint paid FROM partner_sales WHERE partner_id=$1`, [partnerId])).rows[0];
    const users = (await pool.query<{ n: number }>('SELECT count(*)::int n FROM users WHERE partner_id=$1', [partnerId])).rows[0].n as number; const recent = (await pool.query<{ transactionId: string; amountCents: number; shareCents: number; status: string; createdAt: Date }>(`SELECT transaction_id AS "transactionId", amount_cents AS "amountCents", share_cents AS "shareCents", status, created_at AS "createdAt" FROM partner_sales WHERE partner_id=$1 ORDER BY created_at DESC LIMIT 50`, [partnerId])).rows;
    return { partner: dto(p), referredUsers: users, totals: { sales: s.sales, grossCents: s.gross, shareCents: s.share, owedCents: s.owed, paidCents: s.paid }, recent };
  },
  async markPaid(actor: string, partnerId: string) { return asSystem(async (db) => { const r = await db.query<{ share_cents: number }>(`UPDATE partner_sales SET status='paid', paid_at=now() WHERE partner_id=$1 AND status='accrued' RETURNING share_cents`, [partnerId]); const total = r.rows.reduce((a, x) => a + Number(x.share_cents), 0); await audit(db, actor, 'partner.payout', 'partner', partnerId, { items: r.rowCount, totalCents: total }); return { paidItems: r.rowCount ?? 0, paidCents: total }; }); },
};
