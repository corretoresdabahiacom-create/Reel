import { pool, type Db } from '../../db/pool.js';
import { audit } from '../../repositories/audit.js';
import { AppError } from '../../utils/errors.js';
import { isEnabled } from '../flags.service.js';
import { sanctionsProvider } from './sanctions.js';
import type { Row } from '../../db/rows.generated.js';
/**
 * Controles de payout: (1) KYC obrigatório acima do limite (R$ 5.000 por padrão), (2) triagem de sanções antes de pagar (qualquer valor, registrada em sanctions_checks),
 * (3) segregação de funções: quem solicita ≠ quem aprova, (4) dupla aprovação por 2 admins distintos acima de R$ 10.000.
 */
export const opsSettings = async (db: Pick<Db, 'query'> = pool) => (await db.query<Pick<Row<'settings'>, 'value'>>(`SELECT value FROM settings WHERE key='ops'`)).rows.at(0)?.value as { kycThresholdCents: number; dualApprovalThresholdCents: number } ?? { kycThresholdCents: 500000, dualApprovalThresholdCents: 1000000 };
export const payoutGuard = {
  async beforeRequest(userId: string, amountCents: number, source: 'affiliate' | 'marketplace'): Promise<void> {
    if (!(await isEnabled('kyc_enforced'))) return; const cfg = await opsSettings(); if (amountCents < cfg.kycThresholdCents) return;
    const bal = (await pool.query(`SELECT ${source === 'affiliate' ? 'affiliate_balance_cents' : 'marketplace_balance_cents'} AS b FROM users WHERE id=$1`, [userId])).rows.at(0)?.b; if (Number(bal ?? 0) < amountCents) return; // saldo insuficiente é reportado antes (402)
    const u = (await pool.query<Pick<Row<'users'>, 'kyc_status'>>(`SELECT kyc_status FROM users WHERE id=$1`, [userId])).rows[0]; if (u?.kyc_status !== 'verified') throw new AppError(409, 'kyc_required', `Saques a partir de R$ ${(cfg.kycThresholdCents / 100).toFixed(2)} exigem verificação de identidade (KYC) concluída`, { kycStatus: u?.kyc_status ?? 'none' });
  },
  /** Triagem de sanções FORA da transação do settle (o registro e o hold precisam persistir mesmo quando o pagamento é barrado). */
  async screen(payoutId: string, adminId: string | null): Promise<void> {
    const p = (await pool.query<Row<'payout_requests'>>(`SELECT * FROM payout_requests WHERE id=$1`, [payoutId])).rows[0]; if (!p || p.status !== 'pending') return;
    if (adminId && adminId === p.user_id) throw new AppError(403, 'self_approval', 'Segregação de funções: você não pode aprovar o próprio saque');
    const u = (await pool.query<Pick<Row<'users'>, 'name'>>(`SELECT name FROM users WHERE id=$1`, [p.user_id])).rows[0]; const hits = await sanctionsProvider().screen(u?.name ?? '');
    await pool.query(`INSERT INTO sanctions_checks (user_id, entity_name, list_source, match, score) VALUES ($1,$2,$3,$4,$5)`, [p.user_id, u?.name ?? '', hits[0]?.listSource ?? 'all', hits.length > 0, hits[0]?.score ?? null]);
    if (hits.length) { await pool.query(`UPDATE users SET sanctions_cleared=false WHERE id=$1`, [p.user_id]); await pool.query(`UPDATE payout_requests SET hold_reason='sanctions_match' WHERE id=$1`, [p.id]); await audit(pool, adminId, 'payout.sanctions_hold', 'payout', p.id, { list: hits[0]!.listSource, score: hits[0]!.score });
      throw new AppError(409, 'sanctions_hold', 'Saque retido: possível correspondência em lista de sanções. Encaminhe para compliance (rejeite ou investigue).'); }
    await pool.query(`UPDATE users SET sanctions_cleared=true WHERE id=$1`, [p.user_id]); await pool.query(`UPDATE payout_requests SET hold_reason=NULL WHERE id=$1 AND hold_reason='sanctions_match'`, [p.id]);
  },
  /** Dentro da transação (payout travado com FOR UPDATE): segregação e dupla aprovação. */
  async beforeSettle(db: Db, p: Record<string, any>, adminId: string | null, auto: boolean): Promise<'ok' | 'second_approval_needed'> {
    if (adminId && adminId === p.user_id) throw new AppError(403, 'self_approval', 'Segregação de funções: você não pode aprovar o próprio saque');
    const cfg = await opsSettings(db); if (auto || p.amount_cents < cfg.dualApprovalThresholdCents) return 'ok';
    if (!p.first_approver) { await db.query(`UPDATE payout_requests SET first_approver=$2, first_approved_at=now() WHERE id=$1`, [p.id, adminId]); await audit(db, adminId, 'payout.first_approval', 'payout', p.id, { amountCents: p.amount_cents }); return 'second_approval_needed'; }
    if (p.first_approver === adminId) throw new AppError(409, 'dual_approval_same_admin', 'Aprovação dupla exige um segundo administrador diferente do primeiro'); return 'ok';
  },
};
