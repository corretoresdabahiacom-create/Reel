import type { Db } from '../../db/pool.js';

export interface UserRow { id: string; email: string; name: string; password_hash: string | null; locale: string; region: string; plan: string; credits: number; affiliate_balance_cents: number; marketplace_balance_cents: number;
  is_admin: boolean; banned: boolean; birth_date: string | null; totp_secret_enc: string | null; totp_enabled: boolean; stripe_customer_id: string | null; subscription_status: string | null; created_at: string; deleted_at: string | null; deletion_scheduled_for: string | null }
export const userDto = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name, locale: u.locale, region: u.region, plan: u.plan, credits: u.credits, affiliateBalanceCents: u.affiliate_balance_cents,
  marketplaceBalanceCents: u.marketplace_balance_cents, isAdmin: u.is_admin, banned: u.banned, createdAt: u.created_at, deletionScheduledFor: u.deletion_scheduled_for, totpEnabled: u.totp_enabled });
export const usersRepo = {
  async byId(db: Db, id: string): Promise<UserRow | null> { return (await db.query<UserRow>('SELECT * FROM users WHERE id=$1 AND deleted_at IS NULL', [id])).rows.at(0) ?? null; },
  async byEmail(db: Db, email: string): Promise<UserRow | null> { return (await db.query<UserRow>('SELECT * FROM users WHERE lower(email)=lower($1) AND deleted_at IS NULL', [email])).rows.at(0) ?? null; },
  async create(db: Db, p: { email: string; name: string; passwordHash?: string; locale: string; region?: string; birthDate?: string; credits?: number }): Promise<UserRow> {
    return (await db.query<UserRow>('INSERT INTO users (email,name,password_hash,locale,region,birth_date,credits) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [p.email, p.name, p.passwordHash ?? null, p.locale, p.region ?? 'LATAM', p.birthDate ?? null, p.credits ?? 30])).rows[0]!;
  },
  async update(db: Db, id: string, patch: Record<string, unknown>): Promise<UserRow> {
    const keys = Object.keys(patch); if (!keys.length) return (await usersRepo.byId(db, id))!;
    return (await db.query<UserRow>(`UPDATE users SET ${keys.map((k, i) => `${k}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [id, ...keys.map((k) => patch[k])])).rows[0]!;
  },
  /** Débito atômico: falha (retorna false) se faltar saldo — CHECK (credits>=0) é a rede de segurança. */
  async debitCredits(db: Db, id: string, n: number): Promise<boolean> { return ((await db.query('UPDATE users SET credits=credits-$2 WHERE id=$1 AND credits>=$2', [id, n])).rowCount ?? 0) === 1; },
  async addCredits(db: Db, id: string, n: number): Promise<void> { await db.query('UPDATE users SET credits=credits+$2 WHERE id=$1', [id, n]); },
  async tx(db: Db, p: { userId: string; type: string; amountCents: number; creditsDelta?: number; source: string; externalRef?: string }): Promise<boolean> {
    const r = await db.query('INSERT INTO transactions (user_id,type,amount_cents,credits_delta,source,external_ref) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [p.userId, p.type, p.amountCents, p.creditsDelta ?? 0, p.source, p.externalRef ?? null]);
    return (r.rowCount ?? 0) === 1;
  },
};
