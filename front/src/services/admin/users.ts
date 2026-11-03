import type { AuditEntry, Plan, User } from '../../types/phase4';
import { audit } from './audit';
const need = (a: User) => { if (!a.isAdmin) throw new Error('Acesso restrito a administradores.'); };
export function listUsers(actor: User, users: User[], f: { q?: string; plan?: Plan } = {}): User[] {
  need(actor); const q = (f.q ?? '').toLowerCase();
  return users.filter((u) => (!f.plan || u.plan === f.plan) && (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)));
}
const find = (users: User[], id: string) => { const u = users.find((x) => x.id === id); if (!u) throw new Error('Usuário não encontrado.'); return u; };
export function banUser(actor: User, users: User[], log: AuditEntry[], id: string, banned: boolean) { const u = find(users, id); if (u.isAdmin) throw new Error('Não é possível banir um administrador.'); need(actor); u.banned = banned; audit(log, actor, banned ? 'user.ban' : 'user.unban', u.email); return u; }
export function changePlan(actor: User, users: User[], log: AuditEntry[], id: string, plan: Plan) { need(actor); const u = find(users, id); const old = u.plan; u.plan = plan; audit(log, actor, 'user.plan', u.email, `${old} → ${plan}`); return u; }
export function resetCredits(actor: User, users: User[], log: AuditEntry[], id: string, to = 0) { need(actor); const u = find(users, id); const old = u.credits; u.credits = to; audit(log, actor, 'user.credits_reset', u.email, `${old} → ${to}`); return u; }
