import { asSystem } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo, type UserRow } from '../users/users.repository.js';
import { notFound } from '../../utils/errors.js';

/** Módulo 5 — Salvamento. Com `ff_save` desligada as rotas respondem 404 (app idêntico). */
export const FLAG = 'ff_save';
export const loadUser = async (userId: string): Promise<UserRow> => { const u = await asSystem((db) => usersRepo.byId(db, userId)); if (!u) throw notFound(); return u; };
export async function requireSave(userId: string): Promise<UserRow> {
  const u = await loadUser(userId); if (!(await isEnabled(FLAG, { userId, region: u.region, plan: u.plan }))) throw notFound(); return u;
}
