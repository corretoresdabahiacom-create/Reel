import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import type { Row } from '../../db/rows.generated.js';

/** Estado do consentimento mais recente de um tipo: 'granted' | 'revoked' | 'none'. Cache curto no Redis (60 s); `invalidateConsent` ao registrar/revogar. */
export async function consentState(userId: string, type: 'cookies' | 'marketing' | 'ai' | 'terms'): Promise<'granted' | 'revoked' | 'none'> {
  const k = `consent:${type}:${userId}`; const c = await redis.get(k).catch(() => null); if (c) return c as 'granted' | 'revoked' | 'none';
  const r = await pool.query<Pick<Row<'consents'>, 'revoked_at'>>(`SELECT revoked_at FROM consents WHERE user_id=$1 AND type=$2 ORDER BY accepted_at DESC LIMIT 1`, [userId, type]);
  const s = !r.rows[0] ? 'none' : r.rows[0].revoked_at ? 'revoked' : 'granted'; await redis.set(k, s, 'EX', 60).catch(() => undefined); return s;
}
export const invalidateConsent = async (userId: string) => { await redis.del(...(['cookies', 'marketing', 'ai', 'terms'] as const).map((t) => `consent:${t}:${userId}`)).catch(() => undefined); };
/** Analytics comportamental individual exige consentimento ativo de `cookies` (analytics). Sem ele, o evento é gravado sem identificadores. */
export const hasAnalyticsConsent = async (userId: string) => (await consentState(userId, 'cookies')) === 'granted';
/** Marketing (push/e-mail promocional) exige consentimento ativo de `marketing`. */
export const hasMarketingConsent = async (userId: string) => (await consentState(userId, 'marketing')) === 'granted';
/** Experimentação é parte da operação do produto (interesse legítimo, descrita na política de privacidade); quem REVOGOU `cookies` fica fora. */
export const optedOutOfExperiments = async (userId: string) => (await consentState(userId, 'cookies')) === 'revoked';
