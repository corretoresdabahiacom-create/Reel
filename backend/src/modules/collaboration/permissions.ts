import { asSystem } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { notFound } from '../../utils/errors.js';
import { collabError } from './messages.js';

/**
 * Módulo 8 — MATRIZ DE PERMISSÕES (fonte única; `docs/modules/COLLABORATION.md` reproduz esta tabela e o teste 30
 * confere que a doc e o código batem). Toda operação — REST ou WebSocket — passa por `assertCan` NO SERVIDOR.
 */
export type Role = 'owner' | 'editor' | 'viewer';
export const MATRIX = {
  'timeline.view': ['owner', 'editor', 'viewer'],
  'timeline.edit': ['owner', 'editor'],
  'comment.create': ['owner', 'editor', 'viewer'],
  'comment.resolve': ['owner', 'editor'],
  'comment.delete_any': ['owner'],
  'collaborator.invite': ['owner'],
  'collaborator.remove': ['owner'],
  'snapshot.create': ['owner', 'editor'],
  'snapshot.restore': ['owner', 'editor'],
  'project.delete': ['owner'],
} as const satisfies Record<string, readonly Role[]>;
export type Action = keyof typeof MATRIX;
export const can = (role: Role | null, action: Action) => !!role && (MATRIX[action] as readonly Role[]).includes(role);

/** Papel do usuário no projeto (lido como system: a política de `projects` é só do dono). */
export async function roleOf(userId: string, projectId: string): Promise<Role | null> {
  return asSystem(async (db) => {
    const p = (await db.query<{ user_id: string }>('SELECT user_id FROM projects WHERE id=$1 AND deleted_at IS NULL', [projectId])).rows[0];
    if (!p) return null; if (p.user_id === userId) return 'owner';
    const c = (await db.query<{ role: Role }>(`SELECT role FROM project_collaborators WHERE project_id=$1 AND user_id=$2 AND status='accepted'`, [projectId, userId])).rows[0];
    return c?.role ?? null;
  });
}
/** Sem papel → 404 (não revela que o projeto existe). Com papel sem permissão → 403 explícito. */
export async function assertCan(userId: string, projectId: string, action: Action): Promise<Role> {
  const role = await roleOf(userId, projectId);
  if (!role) throw collabError(404, 'project_not_found', undefined, 'not_found');
  if (!can(role, action)) throw collabError(403, 'forbidden_role', { role, action });
  return role;
}
const flagUser = async (userId: string) => asSystem(async (db) => (await db.query<{ region: string; plan: string }>('SELECT region, plan FROM users WHERE id=$1', [userId])).rows[0]);
export async function flagOn(key: 'ff_collaboration' | 'ff_timeline', userId: string): Promise<boolean> {
  const u = await flagUser(userId); return !!u && isEnabled(key, { userId, region: u.region, plan: u.plan });
}
export async function requireFlag(key: 'ff_collaboration' | 'ff_timeline', userId: string): Promise<void> { if (!(await flagOn(key, userId))) throw notFound(); }
