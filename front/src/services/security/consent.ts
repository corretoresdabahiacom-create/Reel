import type { ConsentRecord, ConsentType } from '../../types/phase5';
export const CONSENT_VERSION = '2026-10'; // mude ao alterar a política: força novo aceite
export const REQUIRED: ConsentType[] = ['terms'];
export interface ConsentDb { records: ConsentRecord[] }
const id = () => Math.random().toString(36).slice(2, 10);
export function registerConsent(db: ConsentDb, userId: string, types: ConsentType[], ip?: string, version = CONSENT_VERSION): ConsentRecord[] {
  const out = types.map<ConsentRecord>((type) => ({ id: id(), userId, type, version, acceptedAt: new Date().toISOString(), ip }));
  db.records.push(...out); return out;
}
/** Consentimento vigente = registro mais recente do tipo, sem revogação e na versão atual. */
export function getConsent(db: ConsentDb, userId: string, type: ConsentType): ConsentRecord | undefined {
  const r = db.records.filter((x) => x.userId === userId && x.type === type).sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))[0];
  return r && !r.revokedAt && r.version === CONSENT_VERSION ? r : undefined;
}
export function revokeConsent(db: ConsentDb, userId: string, type: ConsentType): void {
  if (REQUIRED.includes(type)) throw new Error('O aceite dos Termos não pode ser revogado sem excluir a conta.');
  const r = getConsent(db, userId, type); if (r) r.revokedAt = new Date().toISOString();
}
export const hasAll = (db: ConsentDb, userId: string, types: ConsentType[]) => types.every((t) => !!getConsent(db, userId, t));
