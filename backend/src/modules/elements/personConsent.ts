import { randomInt } from 'node:crypto';
import { asUser, tx } from '../../db/pool.js';
import { storage, refLocation, sniffMime } from '../../providers/storage.js';
import { hashIp, sha256 } from '../../utils/crypto.js';
import { audit } from '../../repositories/audit.js';
import { elError, elMsg } from './messages.js';

export const PERSON_CONSENT_VERSION = 'person-v1';
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
interface Row { id: string; type: string; revoked_at: string | null; verified_at: string | null; challenge_hash: string | null; evidence_url: string | null; accepted_at: string }
async function load(userId: string, id: string): Promise<Row> {
  const r = await asUser(userId, async (db) => (await db.query<Row>('SELECT id, type, revoked_at, verified_at, challenge_hash, evidence_url, accepted_at FROM consents WHERE id=$1', [id])).rows[0]);
  if (!r || r.type !== 'person_image') throw elError(404, 'consent_not_found', undefined, 'not_found'); return r;
}
const status = (r: Row) => (r.revoked_at ? 'revoked' : r.verified_at ? 'verified' : 'pending');

/**
 * Consentimento `person_image` (R6) para inserir uma pessoa real: frase única + upload opcional de autorização + timestamp.
 * 1) `request` devolve a frase (só o hash dela é guardado); 2) `confirm` exige a frase digitada igual e, se houver,
 * o arquivo de autorização (imagem do próprio usuário); só então grava `verified_at`. Revogar vale na hora.
 */
export const personConsent = {
  async request(userId: string, meta: { ip: string; userAgent?: string; locale?: string }) {
    const code = String(randomInt(100000, 1000000)); const phrase = elMsg('person_phrase', meta.locale).replace('{code}', code);
    const id = await tx({ userId }, async (db) => {
      const at = new Date(); const ipH = hashIp(meta.ip); const ua = meta.userAgent ? sha256(meta.userAgent) : null;
      const r = await db.query<{ id: string }>(`INSERT INTO consents (user_id,type,version,ip_hash,accepted_at,user_agent_hash,proof_hash,challenge_hash) VALUES ($1,'person_image',$2,$3,$4,$5,$6,$7) RETURNING id`,
        [userId, PERSON_CONSENT_VERSION, ipH, at, ua, sha256([userId, 'person_image', PERSON_CONSENT_VERSION, at.toISOString(), ipH, ua ?? ''].join('|')), sha256(normalize(phrase))]);
      await audit(db, userId, 'consent.person_image.request', 'consent', r.rows[0].id, { version: PERSON_CONSENT_VERSION }); return r.rows[0].id as string;
    });
    return { consentId: id, phrase, status: 'pending' as const };
  },
  async confirm(userId: string, consentId: string, b: { phrase: string; evidenceRef?: string }) {
    const c = await load(userId, consentId);
    if (c.revoked_at) throw elError(409, 'consent_revoked');
    if (c.verified_at) return { consentId, status: 'verified' as const, verifiedAt: new Date(c.verified_at).toISOString() };
    if (!c.challenge_hash || sha256(normalize(b.phrase)) !== c.challenge_hash) throw elError(422, 'phrase_mismatch');
    if (b.evidenceRef) {
      const l = refLocation(b.evidenceRef);
      const ok = b.evidenceRef.startsWith(`uploads/${userId}/`) && (await storage.exists(l.bucket, l.key)) && !!sniffMime((await storage.get(l.bucket, l.key)).subarray(0, 64))?.startsWith('image/');
      if (!ok) throw elError(422, 'evidence_invalid');
    }
    const at = await tx({ userId }, async (db) => {
      const r = await db.query<{ verified_at: Date | null }>(`UPDATE consents SET verified_at=now(), evidence_url=$2 WHERE id=$1 AND verified_at IS NULL RETURNING verified_at`, [consentId, b.evidenceRef ?? null]);
      await audit(db, userId, 'consent.person_image.verified', 'consent', consentId, { evidence: !!b.evidenceRef }); return r.rows.at(0)?.verified_at as Date | undefined;
    });
    return { consentId, status: 'verified' as const, verifiedAt: (at ?? new Date()).toISOString() };
  },
  async revoke(userId: string, consentId: string) {
    const c = await load(userId, consentId); if (c.revoked_at) return { consentId, status: 'revoked' as const };
    await tx({ userId }, async (db) => { await db.query(`UPDATE consents SET revoked_at=now() WHERE id=$1`, [consentId]); await audit(db, userId, 'consent.person_image.revoke', 'consent', consentId, {}); });
    return { consentId, status: 'revoked' as const };
  },
  async list(userId: string) {
    const rows = await asUser(userId, async (db) => (await db.query<Row>(`SELECT id, type, revoked_at, verified_at, challenge_hash, evidence_url, accepted_at FROM consents WHERE user_id=$1 AND type='person_image' ORDER BY accepted_at DESC LIMIT 20`, [userId])).rows);
    return rows.map((r) => ({ consentId: r.id, status: status(r), requestedAt: r.accepted_at, verifiedAt: r.verified_at, hasEvidence: !!r.evidence_url }));
  },
  /** Usado ANTES de qualquer envio ao provedor (na requisição) e de novo no worker: verificado, ativo e do próprio usuário. */
  async assertUsable(userId: string, consentId: string | undefined): Promise<string> {
    if (!consentId) throw elError(403, 'person_consent_required');
    const r = await asUser(userId, async (db) => (await db.query<Row>(`SELECT id, type, revoked_at, verified_at, challenge_hash, evidence_url, accepted_at FROM consents WHERE id=$1 AND user_id=$2`, [consentId, userId])).rows[0]);
    if (!r || r.type !== 'person_image' || !r.verified_at || r.revoked_at) throw elError(403, 'person_consent_required');
    return r.id;
  },
};
