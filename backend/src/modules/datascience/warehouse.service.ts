import { mkdir, writeFile, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import { TAXONOMY_VERSION } from '../analytics/taxonomy.js';
import { pseudo } from '../analytics/analytics.service.js';
import { hmacHex } from '../../utils/crypto.js';
import type { Row } from '../../db/rows.generated.js';

/** Id opaco de linha: o uuid original não sai do banco (evita correlação por id interno). */
const opaque = (id: string | null) => (id ? hmacHex(env.ANALYTICS_PSEUDO_SALT, `row:${id}`).slice(0, 32) : null);

const CURSOR = 'warehouse:cursor:events';
/**
 * Exportação incremental events → "warehouse" (JSONL em WAREHOUSE_EXPORT_DIR; em produção o mesmo contrato alimenta Segment/BigQuery).
 * Só sai `pseudo_id` (nunca user_id/email). Eventos em quarentena (schema_version 0) vão para o arquivo `quarantine`.
 * Pedidos de eliminação (LGPD) viram tombstones `erasure-*.jsonl` que o carregador do warehouse deve aplicar.
 */
export const warehouseService = {
  async exportEvents(o: { batch?: number } = {}): Promise<{ exported: number; quarantined: number; lastId: number; file: string | null }> {
    const cur = Number((await redis.get(CURSOR).catch(() => null)) ?? 0); const cursor = Number.isFinite(cur) ? cur : 0;
    const r = await pool.query<Pick<Row<'analytics_events'>, 'id' | 'pseudo_id' | 'anon_id' | 'session_id' | 'name' | 'props' | 'schema_version' | 'source' | 'event_id' | 'created_at'>>(`SELECT id, pseudo_id, anon_id, session_id, name, props, schema_version, source, event_id, created_at FROM analytics_events WHERE id > $1 ORDER BY id LIMIT $2`, [cursor, o.batch ?? 5000]);
    if (!r.rows.length) return { exported: 0, quarantined: 0, lastId: cursor, file: null };
    await mkdir(env.WAREHOUSE_EXPORT_DIR, { recursive: true }); const stamp = new Date().toISOString().slice(0, 10);
    const ok: string[] = [], bad: string[] = [];
    for (const x of r.rows) {
      const line = JSON.stringify({ event_id: x.event_id ?? `legacy-${x.id}`, pseudo_id: x.pseudo_id, anon_id: x.anon_id, session_id: x.session_id, name: x.name, props: x.props, schema_version: x.schema_version, source: x.source, occurred_at: x.created_at });
      (x.schema_version === 0 ? bad : ok).push(line);
    }
    const file = join(env.WAREHOUSE_EXPORT_DIR, `events-v${TAXONOMY_VERSION}-${stamp}.jsonl`);
    if (ok.length) await appendFile(file, ok.join('\n') + '\n');
    if (bad.length) await appendFile(join(env.WAREHOUSE_EXPORT_DIR, `quarantine-${stamp}.jsonl`), bad.join('\n') + '\n');
    const lastId = Number(r.rows[r.rows.length - 1].id); await redis.set(CURSOR, String(lastId)).catch(() => undefined);
    const lastAt = r.rows[r.rows.length - 1].created_at as Date;
    await writeFile(join(env.WAREHOUSE_EXPORT_DIR, 'manifest.json'), JSON.stringify({ taxonomyVersion: TAXONOMY_VERSION, lastEventId: lastId, lastEventAt: lastAt, exportedAt: new Date().toISOString() }));
    return { exported: ok.length, quarantined: bad.length, lastId, file: ok.length ? file : null };
  },
  /**
   * Snapshots das dimensões/fatos para o warehouse (JSONL por tabela, recarga completa). Pseudonimizados: `user_id` nunca sai —
   * cada tabela exporta `pseudo_id` (HMAC) e ids opacos de linha. Contrato = warehouse/raw_ddl.sql.
   */
  async exportSnapshots(): Promise<Record<string, number>> {
    await mkdir(env.WAREHOUSE_EXPORT_DIR, { recursive: true }); const dir = join(env.WAREHOUSE_EXPORT_DIR, 'snapshots'); await mkdir(dir, { recursive: true });
    const out: Record<string, number> = {};
    const idRows = (await pool.query<Pick<Row<'users'>, 'id'>>('SELECT id FROM users')).rows as Array<{ id: string }>; const ps = new Map(idRows.map((r) => [r.id, pseudo(r.id)])); const px = (id: string | null) => (id ? ps.get(id) ?? pseudo(id) : null);
    const dump = async (name: string, sql: string, map: (r: Record<string, any>) => Record<string, unknown>) => {
      const r = await pool.query(sql); await writeFile(join(dir, `${name}.jsonl`), r.rows.map((x) => JSON.stringify(map(x))).join('\n') + (r.rows.length ? '\n' : '')); out[name] = r.rowCount ?? 0;
    };
    await dump('users', `SELECT id, created_at, plan, region, country, locale, attribution_source, partner_id, creator_verified, churn_risk, rfm_segment, onboarding_goal, (referred_by IS NOT NULL) AS referred FROM users WHERE deleted_at IS NULL`,
      (r) => ({ pseudo_id: px(r.id), created_at: r.created_at, plan: r.plan, region: r.region, country: r.country, locale: r.locale, attribution_source: r.attribution_source, partner_id: r.partner_id, creator_verified: r.creator_verified, churn_risk: r.churn_risk, rfm_segment: r.rfm_segment, onboarding_goal: r.onboarding_goal, referred: r.referred, snapshot_at: new Date().toISOString() }));
    await dump('transactions', `SELECT t.id, t.user_id, t.type, t.amount_cents, t.amount_brl_cents, t.currency, t.tax_cents, t.region, t.method, t.source, t.credits_delta, t.created_at FROM transactions t JOIN users u ON u.id=t.user_id WHERE u.deleted_at IS NULL`,
      (r) => ({ tx_id: opaque(r.id), pseudo_id: px(r.user_id), type: r.type, amount_cents: Number(r.amount_cents), amount_brl_cents: r.amount_brl_cents == null ? null : Number(r.amount_brl_cents), currency: r.currency?.trim() ?? null, tax_cents: r.tax_cents == null ? null : Number(r.tax_cents), region: r.region, method: r.method, source: String(r.source).split(':')[0], credits_delta: r.credits_delta, created_at: r.created_at }));
    await dump('projects', `SELECT id, user_id, status, category, template_id, created_at FROM projects WHERE deleted_at IS NULL`, (r) => ({ project_id: opaque(r.id), pseudo_id: px(r.user_id), status: r.status, category: r.category, template_id: r.template_id, created_at: r.created_at }));
    await dump('publications', `SELECT id, user_id, project_id, platform, status, published_at, created_at FROM publications`, (r) => ({ publication_id: opaque(r.id), pseudo_id: px(r.user_id), project_id: opaque(r.project_id), platform: r.platform, status: r.status, published_at: r.published_at, created_at: r.created_at }));
    await dump('ai_usage', `SELECT id, user_id, provider, operation, cost_cents, status, created_at FROM ai_usage`, (r) => ({ usage_id: opaque(r.id), pseudo_id: px(r.user_id), provider: r.provider, operation: r.operation, cost_cents: Number(r.cost_cents), status: r.status, created_at: r.created_at }));
    await dump('experiment_assignments', `SELECT e.key, a.user_id, a.variant, a.assigned_at, a.exposed_at FROM experiment_assignments a JOIN experiments e ON e.id=a.experiment_id`, (r) => ({ experiment_key: r.key, pseudo_id: px(r.user_id), variant: r.variant, assigned_at: r.assigned_at, exposed_at: r.exposed_at }));
    await dump('referrals', `SELECT id, referrer_id, referred_id, status, created_at, signed_up_at, activated_at, reward_granted_at FROM referrals`, (r) => ({ referral_id: opaque(r.id), referrer_pseudo: px(r.referrer_id), referred_pseudo: px(r.referred_id), status: r.status, created_at: r.created_at, signed_up_at: r.signed_up_at, activated_at: r.activated_at, reward_granted_at: r.reward_granted_at }));
    await dump('template_purchases', `SELECT p.id, p.template_id, p.buyer_id, t.creator_id, p.price_credits, p.fee_credits, p.created_at FROM template_purchases p JOIN templates t ON t.id=p.template_id`, (r) => ({ purchase_id: opaque(r.id), template_id: r.template_id, buyer_pseudo: px(r.buyer_id), creator_pseudo: px(r.creator_id), price_credits: r.price_credits, fee_credits: r.fee_credits, created_at: r.created_at }));
    return out;
  },
  /** Job completo: eventos (incremental) + eliminações + snapshots (no máx. 1×/hora, ou `force`). */
  async run(o: { force?: boolean } = {}) {
    const events = await this.exportEvents(); const erasures = await this.applyErasures(); let snapshots: Record<string, number> | null = null;
    if (o.force || (await redis.set('warehouse:snapshot:lock', '1', 'EX', 3600, 'NX').catch(() => 'OK'))) snapshots = await this.exportSnapshots();
    return { events, erasures, snapshots };
  },
  /** Propaga eliminações para o warehouse: grava tombstones e marca como processados. */
  async applyErasures(): Promise<{ processed: number }> {
    const r = await pool.query<Pick<Row<'erasure_queue'>, 'pseudo_id'>>(`SELECT pseudo_id FROM erasure_queue WHERE processed_at IS NULL ORDER BY requested_at LIMIT 1000`); if (!r.rows.length) return { processed: 0 };
    await mkdir(env.WAREHOUSE_EXPORT_DIR, { recursive: true });
    await appendFile(join(env.WAREHOUSE_EXPORT_DIR, `erasure-${new Date().toISOString().slice(0, 10)}.jsonl`), r.rows.map((x) => JSON.stringify({ pseudo_id: x.pseudo_id, requested: 'erase' })).join('\n') + '\n');
    await pool.query(`UPDATE erasure_queue SET processed_at=now() WHERE pseudo_id = ANY($1)`, [r.rows.map((x) => x.pseudo_id)]); return { processed: r.rows.length };
  },
  /** SLA de frescor: minutos desde o último evento exportado (null se nunca exportou). */
  async freshness(): Promise<{ minutes: number | null; exportedAt: string | null; slaMinutes: number; ok: boolean }> {
    const sla = 60; try { const m = JSON.parse(await readFile(join(env.WAREHOUSE_EXPORT_DIR, 'manifest.json'), 'utf8')) as { exportedAt: string }; const minutes = Math.round((Date.now() - new Date(m.exportedAt).getTime()) / 60000); return { minutes, exportedAt: m.exportedAt, slaMinutes: sla, ok: minutes <= sla }; } catch { return { minutes: null, exportedAt: null, slaMinutes: sla, ok: false }; }
  },
};
