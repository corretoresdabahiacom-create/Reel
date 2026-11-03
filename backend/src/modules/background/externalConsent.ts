import { asSystem, asUser, tx } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo } from '../users/users.repository.js';
import { hashIp, sha256 } from '../../utils/crypto.js';
import { audit } from '../../repositories/audit.js';
import { notFound } from '../../utils/errors.js';
import type { Row } from '../../db/rows.generated.js';

export const EXTERNAL_CONSENT_VERSION = 'ext-v1';
/** Só existe para quem tem algum módulo que pode usar provedor externo ligado (hoje: áudio e fundo). */
const MODULE_FLAGS = ['ff_audio', 'ff_background'];
async function requireAnyModule(userId: string) {
  const u = await asSystem((db) => usersRepo.byId(db, userId)); if (!u) throw notFound();
  for (const f of MODULE_FLAGS) if (await isEnabled(f, { userId, region: u.region, plan: u.plan })) return u;
  throw notFound();
}
/**
 * Consentimento `external_provider` (R6): aceite explícito, com timestamp, versão, hash de IP/UA e hash de prova.
 * Como é um aceite direto (sem amostra a conferir), `verified_at` é gravado no ato. Revogar vale na hora para todos os módulos.
 */
export const externalConsent = {
  async status(userId: string) {
    await requireAnyModule(userId);
    const r = await asUser(userId, async (db) => (await db.query<Pick<Row<'consents'>, 'id' | 'version' | 'accepted_at' | 'verified_at'>>(`SELECT id, version, accepted_at, verified_at FROM consents WHERE user_id=$1 AND type='external_provider' AND revoked_at IS NULL ORDER BY accepted_at DESC LIMIT 1`, [userId])).rows.at(0)); // .at(0): pode não haver consentimento (tipo honesto → null no contrato)
    return { granted: !!r, version: r?.version ?? null, acceptedAt: r?.accepted_at ?? null };
  },
  async grant(userId: string, meta: { ip: string; userAgent?: string }) {
    await requireAnyModule(userId);
    await tx({ userId }, async (db) => {
      const at = new Date(); const ipH = hashIp(meta.ip); const ua = meta.userAgent ? sha256(meta.userAgent) : null;
      await db.query(`UPDATE consents SET revoked_at=now() WHERE user_id=$1 AND type='external_provider' AND revoked_at IS NULL`, [userId]); // um ativo por vez
      await db.query(`INSERT INTO consents (user_id,type,version,ip_hash,accepted_at,user_agent_hash,proof_hash,verified_at) VALUES ($1,'external_provider',$2,$3,$4,$5,$6,$4)`,
        [userId, EXTERNAL_CONSENT_VERSION, ipH, at, ua, sha256([userId, 'external_provider', EXTERNAL_CONSENT_VERSION, at.toISOString(), ipH, ua ?? ''].join('|'))]);
      await audit(db, userId, 'consent.external_provider.grant', 'consent', 'external_provider', { version: EXTERNAL_CONSENT_VERSION });
    });
    return this.status(userId);
  },
  async revoke(userId: string) {
    await requireAnyModule(userId);
    await tx({ userId }, async (db) => { await db.query(`UPDATE consents SET revoked_at=now() WHERE user_id=$1 AND type='external_provider' AND revoked_at IS NULL`, [userId]); await audit(db, userId, 'consent.external_provider.revoke', 'consent', 'external_provider', {}); });
    return this.status(userId);
  },
};
