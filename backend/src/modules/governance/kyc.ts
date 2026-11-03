import { pool } from '../../db/pool.js';
import { audit } from '../../repositories/audit.js';
import { AppError } from '../../utils/errors.js';
import { env } from '../../config/env.js';
import type { Row } from '../../db/rows.generated.js';
/** KYC: porta para Persona/Onfido. Provedor `stub` decide pelo `externalRef` (só para teste/dev): 'reject*' => rejeitado, 'pending*' => pendente, demais => verificado. */
export interface KycProvider { name: string; verify(i: { userId: string; documentType: string; externalRef: string }): Promise<{ status: 'pending' | 'verified' | 'rejected' }> }
export class StubKyc implements KycProvider { name = 'stub'; async verify(i: { externalRef: string }) { return { status: i.externalRef.startsWith('reject') ? 'rejected' as const : i.externalRef.startsWith('pending') ? 'pending' as const : 'verified' as const }; } }
let provider: KycProvider = new StubKyc(); export const setKycProvider = (p: KycProvider) => { provider = p; };
export const kycService = {
  async submit(userId: string, b: { documentType: 'passport' | 'national_id' | 'driver_license' | 'cnpj'; externalRef: string }) {
    if (env.KYC_PROVIDER !== 'stub' && provider.name === 'stub') throw new AppError(501, 'kyc_provider_not_integrated', `KYC_PROVIDER=${env.KYC_PROVIDER} ainda não integrado (somente stub)`);
    const r = await provider.verify({ userId, ...b });
    const row = (await pool.query<Row<'kyc_verifications'>>(`INSERT INTO kyc_verifications (user_id, provider, status, verified_at, document_type, external_ref) VALUES ($1,$2,$3,CASE WHEN $3='verified' THEN now() END,$4,$5) RETURNING *`, [userId, provider.name, r.status, b.documentType, b.externalRef])).rows[0]!;
    await pool.query(`UPDATE users SET kyc_status=$2 WHERE id=$1`, [userId, r.status]); await audit(pool, userId, 'kyc.submit', 'user', userId, { status: r.status, provider: provider.name }); return { id: row.id, status: r.status };
  },
  status: async (userId: string) => (await pool.query<Pick<Row<'users'>, 'kyc_status' | 'sanctions_cleared'>>(`SELECT kyc_status, sanctions_cleared FROM users WHERE id=$1`, [userId])).rows[0] as { kyc_status: string; sanctions_cleared: boolean },
};
