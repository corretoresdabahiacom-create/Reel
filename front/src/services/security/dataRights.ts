import { RETENTION_DAYS, type AuditLog, type DataExportRequest, type DeletionRequest } from '../../types/phase5';
export interface RightsDb { exports: DataExportRequest[]; deletions: DeletionRequest[]; audit: AuditLog[]; collect(userId: string): Record<string, unknown>; purge(userId: string): void }
const id = () => Math.random().toString(36).slice(2, 10);
const addAudit = (db: RightsDb, actorId: string, action: string, targetId: string, metadata: Record<string, unknown> = {}) => db.audit.unshift({ id: id(), actorId, action, targetType: 'user', targetId, metadata, createdAt: new Date().toISOString() });
const SECRET_KEYS = /(token|secret|password|hash)/i;
const strip = (v: unknown): unknown => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as object).filter(([k]) => !SECRET_KEYS.test(k)).map(([k, x]) => [k, strip(x)])) : v;
/** Portabilidade (LGPD art. 18, GDPR art. 20): JSON legível por máquina, sem segredos. TODO produção: gerar em job, subir a storage privado e enviar link assinado por e-mail. */
export function requestExport(db: RightsDb, userId: string): { request: DataExportRequest; json: string } {
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), userId, data: strip(db.collect(userId)) }, null, 2);
  const request: DataExportRequest = { id: id(), userId, status: 'completed', requestedAt: new Date().toISOString(), completedAt: new Date().toISOString(), downloadUrl: 'blob:export-' + id() };
  db.exports.push(request); addAudit(db, userId, 'data.export', userId, { bytes: json.length }); return { request, json };
}
/** Exclusão: soft delete agendado para +30 dias (pode cancelar). Depois, hard delete (job diário chama processDueDeletions). */
export function requestDeletion(db: RightsDb, userId: string, now = new Date()): DeletionRequest {
  const open = db.deletions.find((d) => d.userId === userId && d.status === 'scheduled'); if (open) return open;
  const d: DeletionRequest = { id: id(), userId, status: 'scheduled', scheduledFor: new Date(now.getTime() + RETENTION_DAYS.deletionGrace * 864e5).toISOString() };
  db.deletions.push(d); addAudit(db, userId, 'account.deletion_requested', userId, { scheduledFor: d.scheduledFor }); return d;
}
export const getDeletionStatus = (db: RightsDb, userId: string) => db.deletions.filter((d) => d.userId === userId).sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor))[0];
export function cancelDeletion(db: RightsDb, userId: string): boolean { const d = db.deletions.find((x) => x.userId === userId && x.status === 'scheduled'); if (!d) return false; d.status = 'cancelled'; addAudit(db, userId, 'account.deletion_cancelled', userId); return true; }
export function processDueDeletions(db: RightsDb, now = new Date()): number {
  let n = 0; for (const d of db.deletions) if (d.status === 'scheduled' && new Date(d.scheduledFor) <= now) { db.purge(d.userId); d.status = 'completed'; d.completedAt = now.toISOString(); addAudit(db, 'system', 'account.hard_deleted', d.userId); n++; }
  return n; // obrigações legais (ex.: notas fiscais) podem exigir reter dados mínimos; ver docs/RETENTION.md
}
