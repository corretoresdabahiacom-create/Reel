import type { AuditEntry, User } from '../../types/phase4';
/** Toda ação administrativa gera uma entrada (quem, o quê, quando). Em produção: tabela append-only. */
export function audit(log: AuditEntry[], actor: User, action: string, target: string, detail = ''): AuditEntry {
  if (!actor.isAdmin) throw new Error('Acesso restrito a administradores.');
  const e: AuditEntry = { id: Math.random().toString(36).slice(2, 10), actorId: actor.id, actorName: actor.name, action, target, detail, at: new Date().toISOString() };
  log.unshift(e); return e;
}
