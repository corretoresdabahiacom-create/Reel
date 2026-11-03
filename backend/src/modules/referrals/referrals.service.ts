import { randomInt } from 'node:crypto';
import { pool, asSystem } from '../../db/pool.js';
import { systemScope } from '../../db/context.js';
import { env } from '../../config/env.js';
import { hashIp, sha256 } from '../../utils/crypto.js';
import { notFound, unprocessable, conflict } from '../../utils/errors.js';
import { audit } from '../../repositories/audit.js';
import { usersRepo } from '../users/users.repository.js';
import { isEnabled } from '../flags.service.js';
import { growthSettings } from '../growth/settings.js';
import { track } from '../analytics/analytics.service.js';
import { experimentsService } from '../experiments/experiments.service.js';
import { m } from '../../observability/metrics.js';
import type { Row } from '../../db/rows.generated.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem I/O/0/1 (evita confusão ao digitar)
const newCode = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
export const normalizeCode = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
export const deviceHash = (id?: string) => (id ? sha256(`${env.IP_HASH_SALT}:dev:${id}`).slice(0, 32) : null);
export interface FraudVerdict { fraud: boolean; reasons: string[] }

export const referralsService = {
  async codeFor(userId: string): Promise<string> {
    const cur = (await pool.query<Pick<Row<'users'>, 'referral_code'>>('SELECT referral_code FROM users WHERE id=$1', [userId])).rows.at(0)?.referral_code as string | null; if (cur) return cur;
    for (let i = 0; i < 6; i++) { const c = newCode(); try { const r = await pool.query<{ referral_code: string | null }>('UPDATE users SET referral_code=$2 WHERE id=$1 AND referral_code IS NULL RETURNING referral_code', [userId, c]); if (r.rows[0]) return r.rows[0].referral_code as string; return (await pool.query<Pick<Row<'users'>, 'referral_code'>>('SELECT referral_code FROM users WHERE id=$1', [userId])).rows[0].referral_code as string; } catch (e) { if ((e as { code?: string }).code !== '23505') throw e; } }
    throw new Error('não foi possível gerar código de indicação');
  },
  async me(userId: string) {
    const code = await this.codeFor(userId); const gs = await growthSettings();
    const s = (await pool.query<{ clicks: number; signups: number; activated: number; rewarded: number }>(`SELECT count(*) FILTER (WHERE status='clicked')::int clicks, count(*) FILTER (WHERE status IN ('signed_up','activated','rewarded'))::int signups, count(*) FILTER (WHERE status IN ('activated','rewarded'))::int activated, count(*) FILTER (WHERE status='rewarded')::int rewarded
      FROM referrals WHERE referrer_id=$1`, [userId])).rows[0];
    const earned = (await pool.query<{ c: number }>(`SELECT COALESCE(sum(credits_delta),0)::int c FROM transactions WHERE user_id=$1 AND source='referral' AND external_ref LIKE '%:referrer'`, [userId])).rows[0].c as number;
    const monthRewarded = await this.rewardedThisMonth(userId); const reward = await this.rewardAmounts(userId, false);
    return { code, link: `${env.PUBLIC_APP_URL}/r/${code}`, apiLink: `${env.PUBLIC_API_URL}/api/v1/ref/${code}`, stats: { ...s, creditsEarned: earned }, rewards: { referrerCredits: reward.referrer, referredCredits: reward.referred }, monthlyCap: gs.referral.monthlyCapPerReferrer, rewardedThisMonth: monthRewarded };
  },
  async rewardedThisMonth(referrerId: string): Promise<number> { return (await pool.query<{ n: number }>(`SELECT count(*)::int n FROM referrals WHERE referrer_id=$1 AND status='rewarded' AND reward_granted_at >= date_trunc('month', now())`, [referrerId])).rows[0].n; },
  /** Quantidade da recompensa (experimento `referral_reward` pode variar o valor do indicador). `expose=false` para só consultar. */
  async rewardAmounts(referrerId: string, expose: boolean): Promise<{ referrer: number; referred: number; variant: string }> {
    const gs = await growthSettings(); const base = gs.referral.rewardReferrerCredits; const a = await experimentsService.assign(referrerId, 'referral_reward', { expose });
    const referrer = a.variant === 'low' ? Math.round(base / 2) : a.variant === 'high' ? base * 2 : base; return { referrer, referred: gs.referral.rewardReferredCredits, variant: a.variant };
  },
  /** Clique no link: registra (deduplicado por IP+código em 10 min) e devolve `clickId` para ser repassado no cadastro. Nunca revela se o código existe. */
  async click(i: { code: string; ip: string; deviceId?: string; utm?: Record<string, string> }): Promise<{ clickId: string | null }> {
    if (!(await isEnabled('referral_enabled'))) return { clickId: null }; const code = normalizeCode(i.code); const ref = (await pool.query<Pick<Row<'users'>, 'id'>>('SELECT id FROM users WHERE referral_code=$1 AND deleted_at IS NULL AND NOT banned', [code])).rows[0]; if (!ref) return { clickId: null };
    const ip = hashIp(i.ip); const dup = (await pool.query<{ id: string }>(`SELECT id FROM referrals WHERE referrer_id=$1 AND ip_hash=$2 AND status='clicked' AND referred_id IS NULL AND created_at > now() - interval '10 minutes' LIMIT 1`, [ref.id, ip])).rows[0]; if (dup) return { clickId: dup.id };
    const r = await pool.query<{ id: string }>(`INSERT INTO referrals (referrer_id, code, status, ip_hash, device_hash, utm) VALUES ($1,$2,'clicked',$3,$4,$5) RETURNING id`, [ref.id, code, ip, deviceHash(i.deviceId), JSON.stringify(i.utm ?? {})]);
    m.referralEvents.inc({ status: 'clicked' }); await track(ref.id, 'referral_clicked', { code }); return { clickId: r.rows[0].id };
  },
  /** Heurísticas antifraude (documentadas em docs/EXPERIMENTS.md §Referral). Qualquer razão ⇒ sem recompensa. */
  async assessFraud(referrerId: string, referred: { id: string; email: string }, sig: { ip: string; deviceHash: string | null }): Promise<FraudVerdict> {
    const reasons: string[] = []; const gs = await growthSettings();
    if (referrerId === referred.id) reasons.push('self_referral');
    if (sig.deviceHash) { const d = await pool.query<{ "?column?": number | null }>('SELECT 1 FROM device_fingerprints WHERE user_id=$1 AND device_hash=$2 LIMIT 1', [referrerId, sig.deviceHash]); const c = await pool.query<{ "?column?": number | null }>(`SELECT 1 FROM referrals WHERE referrer_id=$1 AND device_hash=$2 AND status IN ('signed_up','activated','rewarded') LIMIT 1`, [referrerId, sig.deviceHash]); if (d.rowCount || c.rowCount) reasons.push('same_device'); }
    const ipH = hashIp(sig.ip); const sameIp = await pool.query<{ "?column?": number | null }>('SELECT 1 FROM consents WHERE user_id=$1 AND ip_hash=$2 LIMIT 1', [referrerId, ipH]); if (sameIp.rowCount) reasons.push('same_ip_as_referrer');
    const domain = referred.email.split('@')[1]?.toLowerCase() ?? ''; if (gs.disposableDomains.includes(domain)) reasons.push('disposable_email');
    const vel = (await pool.query<{ n: number }>(`SELECT count(*)::int n FROM referrals WHERE ip_hash=$1 AND status IN ('signed_up','activated','rewarded','fraud') AND signed_up_at > now() - interval '24 hours'`, [ipH])).rows[0].n as number; if (vel >= gs.referral.signupVelocityPerIp24h) reasons.push('signup_velocity_same_ip');
    return { fraud: reasons.length > 0, reasons };
  },
  /** O novo usuário informa o código (no cadastro ou depois, até 30 dias). Resposta sempre genérica — fraude não é revelada ao cliente. */
  async convert(userId: string, i: { code: string; clickId?: string; ip: string; deviceId?: string }): Promise<{ status: 'signed_up' }> {
    if (!(await isEnabled('referral_enabled'))) throw conflict('Programa de indicação desativado', 'referral_disabled');
    // RLS: resolver o código de outra pessoa e cruzar sinais antifraude (dispositivo/IP/velocidade) exige ler linhas de
    // terceiros. Escalonamento explícito e registrado em docs/SECURITY_RLS.md; nada dessas linhas volta ao cliente.
    return systemScope('referral: resolver código de terceiro e checar antifraude entre contas', () => this.convertAsSystem(userId, i));
  },
  async convertAsSystem(userId: string, i: { code: string; clickId?: string; ip: string; deviceId?: string }): Promise<{ status: 'signed_up' }> {
    const u = await usersRepo.byId(pool, userId); if (!u) throw notFound('Usuário não encontrado'); const code = normalizeCode(i.code);
    if (Date.now() - new Date(u.created_at).getTime() > 30 * 86_400_000) throw unprocessable('Código de indicação só pode ser aplicado nos primeiros 30 dias');
    if ((await pool.query<{ "?column?": number | null }>('SELECT 1 FROM referrals WHERE referred_id=$1', [userId])).rowCount) throw conflict('Você já usou um código de indicação', 'already_referred');
    const ref = (await pool.query<Pick<Row<'users'>, 'id'>>('SELECT id FROM users WHERE referral_code=$1 AND deleted_at IS NULL', [code])).rows[0]; if (!ref) throw notFound('Código de indicação inválido');
    const dev = deviceHash(i.deviceId); const verdict = await this.assessFraud(ref.id, { id: userId, email: u.email }, { ip: i.ip, deviceHash: dev }); const ipH = hashIp(i.ip);
    await asSystem(async (db) => {
      const click = i.clickId ? (await db.query<Pick<Row<'referrals'>, 'id'>>(`SELECT id FROM referrals WHERE id=$1 AND referrer_id=$2 AND referred_id IS NULL AND status='clicked'`, [i.clickId, ref.id])).rows[0] : null;
      const status = verdict.fraud ? 'fraud' : 'signed_up'; const reason = verdict.fraud ? verdict.reasons.join(',') : null;
      if (click) await db.query(`UPDATE referrals SET referred_id=$2, status=$3, fraud_reason=$4, signed_up_at=now(), ip_hash=$5, device_hash=COALESCE($6, device_hash) WHERE id=$1`, [click.id, userId, status, reason, ipH, dev]);
      else await db.query(`INSERT INTO referrals (referrer_id, referred_id, code, status, fraud_reason, ip_hash, device_hash, signed_up_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now())`, [ref.id, userId, code, status, reason, ipH, dev]);
      if (!verdict.fraud) await db.query('UPDATE users SET referred_by=$2 WHERE id=$1', [userId, ref.id]);
      if (dev) await db.query('INSERT INTO device_fingerprints (user_id, device_hash) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, dev]);
      await audit(db, userId, verdict.fraud ? 'referral.fraud_blocked' : 'referral.signed_up', 'user', ref.id, { code, reasons: verdict.reasons });
    });
    m.referralEvents.inc({ status: verdict.fraud ? 'fraud' : 'signed_up' }); return { status: 'signed_up' };
  },
  /** Ativação = 1º vídeo montado do indicado. Só então as recompensas são concedidas (idempotente via transactions UNIQUE). */
  async onActivated(referredId: string): Promise<{ rewarded: boolean }> {
    const r = (await pool.query<Pick<Row<'referrals'>, 'id' | 'referrer_id'>>(`SELECT id, referrer_id FROM referrals WHERE referred_id=$1 AND status='signed_up'`, [referredId])).rows[0]; if (!r) return { rewarded: false };
    const gs = await growthSettings(); const amounts = await this.rewardAmounts(r.referrer_id, true); const capped = (await this.rewardedThisMonth(r.referrer_id)) >= gs.referral.monthlyCapPerReferrer;
    const done = await asSystem(async (db) => {
      const up = await db.query<{ id: string }>(`UPDATE referrals SET status='activated', activated_at=now() WHERE id=$1 AND status='signed_up' RETURNING id`, [r.id]); if (!up.rowCount) return false;
      const a = await usersRepo.tx(db, { userId: referredId, type: 'bonus_credit', amountCents: 0, creditsDelta: amounts.referred, source: 'referral', externalRef: `${r.id}:referred` }); if (a) await usersRepo.addCredits(db, referredId, amounts.referred);
      if (!capped) { const b = await usersRepo.tx(db, { userId: r.referrer_id, type: 'bonus_credit', amountCents: 0, creditsDelta: amounts.referrer, source: 'referral', externalRef: `${r.id}:referrer` }); if (b) await usersRepo.addCredits(db, r.referrer_id, amounts.referrer); }
      await db.query(`UPDATE referrals SET status='rewarded', reward_granted_at=now() WHERE id=$1`, [r.id]); await audit(db, null, 'referral.rewarded', 'user', r.referrer_id, { referralId: r.id, referrerCredits: capped ? 0 : amounts.referrer, referredCredits: amounts.referred, capped }); return true;
    });
    if (done) { m.referralEvents.inc({ status: 'rewarded' }); await track(r.referrer_id, 'referral_converted', { code: (await pool.query<Pick<Row<'referrals'>, 'code'>>('SELECT code FROM referrals WHERE id=$1', [r.id])).rows[0].code, credits: capped ? 0 : amounts.referrer }); }
    return { rewarded: done };
  },
  async adminList(status?: string) { return (await pool.query<{ id: string; referrerId: string; referredId: string | null; code: string; status: string; fraudReason: string | null; createdAt: Date; signedUpAt: Date | null; activatedAt: Date | null; rewardGrantedAt: Date | null }>(`SELECT id, referrer_id AS "referrerId", referred_id AS "referredId", code, status, fraud_reason AS "fraudReason", created_at AS "createdAt", signed_up_at AS "signedUpAt", activated_at AS "activatedAt", reward_granted_at AS "rewardGrantedAt" FROM referrals WHERE ($1::text IS NULL OR status=$1) ORDER BY created_at DESC LIMIT 200`, [status ?? null])).rows; },
  /** Bônus de crédito genérico (review, compartilhamento): idempotente por (source, ref). */
  async grantBonus(userId: string, source: 'review' | 'share' | 'referral' | 'promo', ref: string, credits: number): Promise<boolean> {
    return asSystem(async (db) => { const fresh = await usersRepo.tx(db, { userId, type: 'bonus_credit', amountCents: 0, creditsDelta: credits, source, externalRef: ref }); if (fresh) { await usersRepo.addCredits(db, userId, credits); await audit(db, null, 'bonus.credit', 'user', userId, { source, ref, credits }); } return fresh; });
  },
};
