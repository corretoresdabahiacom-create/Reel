import type { FastifyInstance } from 'fastify';
import { authenticate, optionalAuth, userState } from '../../middlewares/auth.js';
import { flagsFor } from '../flags.service.js';
import { usersRepo } from '../users/users.repository.js';
import { pool } from '../../db/pool.js';

export async function flagsRoutes(app: FastifyInstance): Promise<void> {
  /** Flags avaliadas para o usuário (ou anônimo). O front usa isso no lugar do bucket local ao ligar USE_REAL_APIS. */
  app.get('/flags', async (req) => { let ctx: { userId?: string; region?: string; plan?: string } = {}; const sub = await optionalAuth(req); if (sub) { const u = await usersRepo.byId(pool, sub); if (u) ctx = { userId: u.id, region: u.region, plan: u.plan }; } return { flags: await flagsFor(ctx) }; });
  void authenticate; void userState;
}
