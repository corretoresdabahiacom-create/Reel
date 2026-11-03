import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { audit } from '../../repositories/audit.js';
import { AppError } from '../../utils/errors.js';
import { residencyFor } from '../compliance/matrix.js';
import type { Row } from '../../db/rows.generated.js';
export type Region = 'BR' | 'US' | 'EU' | 'CA';
export const REGIONS: Region[] = ['BR', 'US', 'EU', 'CA'];
/** Região de nuvem física de cada residência (Terraform: infra/terraform/envs/{br,eu,us,ca}). */
export const CLOUD_REGION: Record<Region, string> = { BR: 'sa-east-1', US: 'us-east-1', EU: 'eu-west-1', CA: 'ca-central-1' };
/**
 * Residência de dados. Mecanismo: (1) cada usuário tem `data_residency_region` (definida no cadastro por país; mudança só por admin/migração auditada);
 * (2) `data_residency_routes` mapeia (região do usuário, tipo de dado) → região de armazenamento/provedor; (3) cada deployment regional define DEPLOY_REGION e RECUSA (421) usuários
 * de outra residência, devolvendo `x-nexus-home-region` para o roteador global (Route 53/CloudFront) reenviar. Analytics agregado e pseudonimizado pode ser global.
 */
export const residencyService = {
  resolve: residencyFor,
  async assignOnSignup(userId: string, country: string | null | undefined, userRegion?: string | null): Promise<Region> { const r = residencyFor(country, userRegion); await pool.query('UPDATE users SET data_residency_region=$2 WHERE id=$1', [userId, r]); await redis.del(`resid:${userId}`).catch(() => undefined); return r; },
  async routesFor(region: Region) { return (await pool.query<Pick<Row<'data_residency_routes'>, 'data_type' | 'storage_region' | 'provider'>>(`SELECT data_type, storage_region, provider FROM data_residency_routes WHERE user_region=$1 ORDER BY data_type`, [region])).rows.map((r) => ({ dataType: r.data_type, storageRegion: r.storage_region, provider: r.provider })); },
  async forUser(userId: string) {
    const r = (await pool.query<{ region: string; country: string | null }>('SELECT data_residency_region AS region, country FROM users WHERE id=$1', [userId])).rows[0]; if (!r) throw new AppError(404, 'not_found', 'Usuário não encontrado');
    return { region: r.region as Region, cloudRegion: CLOUD_REGION[r.region as Region], country: r.country, routes: await this.routesFor(r.region as Region), analytics: 'pseudonimizado e agregável globalmente (sem identificadores diretos)' };
  },
  /** Migração de residência (ex.: mudança de país): auditada; a movimentação física dos dados é um runbook (docs/COMPLIANCE/DATA_RESIDENCY.md). */
  async migrate(adminId: string, userId: string, to: Region, reason: string) {
    const cur = (await pool.query<Pick<Row<'users'>, 'data_residency_region'>>('SELECT data_residency_region FROM users WHERE id=$1', [userId])).rows[0]; if (!cur) throw new AppError(404, 'not_found', 'Usuário não encontrado');
    await pool.query('UPDATE users SET data_residency_region=$2 WHERE id=$1', [userId, to]); await redis.del(`resid:${userId}`).catch(() => undefined); await audit(pool, adminId, 'residency.migrate', 'user', userId, { from: cur.data_residency_region, to, reason });
    return { userId, from: cur.data_residency_region as Region, to, physicalMoveRequired: cur.data_residency_region !== to };
  },
  async homeRegion(userId: string): Promise<Region | null> {
    const k = `resid:${userId}`; const c = await redis.get(k).catch(() => null); if (c) return c as Region; const r = (await pool.query<{ r: string }>('SELECT data_residency_region AS r FROM users WHERE id=$1', [userId])).rows.at(0)?.r as Region | undefined; if (r) await redis.set(k, r, 'EX', 300).catch(() => undefined); return r ?? null;
  },
  /** Chamado por authenticate(): sem DEPLOY_REGION (ou 'global') não faz nada. */
  async assertServedHere(userId: string): Promise<void> {
    const here = process.env.DEPLOY_REGION; if (!here || here === 'global') return; const home = await this.homeRegion(userId);
    if (home && home !== here) throw new AppError(421, 'wrong_region', `Dados deste usuário residem na região ${home} (${CLOUD_REGION[home]}). Reenvie para o endpoint regional correto.`, { homeRegion: home, homeCloudRegion: CLOUD_REGION[home] });
  },
  async distribution() { return (await pool.query<{ region: string; users: number }>(`SELECT data_residency_region AS region, count(*)::int users FROM users WHERE deleted_at IS NULL GROUP BY 1 ORDER BY 1`)).rows; },
};
