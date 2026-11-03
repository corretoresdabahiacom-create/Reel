import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from '../../db/pool.js';
import { audit } from '../../repositories/audit.js';
import { invalidateFlags } from '../flags.service.js';
import { AppError, notFound } from '../../utils/errors.js';
import { m } from '../../observability/metrics.js';
import { budgetRemaining, evaluateBurn, freezePolicy, hoursToExhaustion, FREEZE_THRESHOLD, type Sample } from './slo.js';
import { parseSpec, specToDefinitions } from './spec.js';
import { readBuckets, flushLocal, bucketOf } from './record.js';
import { incidentsService } from '../incidents/incidents.service.js';
import type { Row } from '../../db/rows.generated.js';

/** SLOs que governam o freeze de features (disponibilidade e sucesso dos fluxos críticos). */
export const GOVERNING = ['api-availability', 'auth-availability', 'generation-success-rate', 'publication-success-rate'];
const SLO_DIR = () => process.env.SLO_DIR ?? join(process.cwd(), 'slo');
const COMPONENT: Record<string, string> = { api: 'api', auth: 'auth', generation: 'generation', publication: 'publishing', dubbing: 'dubbing', cdn: 'cdn', queues: 'api' };

async function setFreeze(on: boolean, actor: string, reason: string): Promise<void> {
  await pool.query(`UPDATE feature_flags SET enabled=$1, updated_at=now() WHERE key='release_freeze'`, [on]); await invalidateFlags();
  await audit(pool, actor, on ? 'sre.freeze' : 'sre.unfreeze', 'flag', 'release_freeze', { reason });
}
export const sreService = {
  /** Sincroniza slo/*.slo.yaml (fonte da verdade versionada) com a tabela slo_definitions. */
  async syncDefinitions(dir = SLO_DIR()): Promise<number> {
    if (!existsSync(dir)) return 0; let n = 0;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.slo.yaml'))) for (const d of specToDefinitions(parseSpec(readFileSync(join(dir, f), 'utf8')))) {
      await pool.query(`INSERT INTO slo_definitions (id, service, sli_type, target, window_days, description, owner) VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET service=$2, sli_type=$3, target=$4, window_days=$5, description=$6, owner=$7, updated_at=now()`, [d.id, d.service, d.sliType, d.target, d.windowDays, d.description, d.owner]); n++;
    }
    return n;
  },
  async definitions() { return (await pool.query<Row<'slo_definitions'>>('SELECT * FROM slo_definitions ORDER BY service, id')).rows; },
  /** Ingestão genérica (sondas sintéticas externas, ex.: CDN, ou testes). */
  async ingest(sloId: string, samples: Array<{ ts: number | string | Date; good: number; total: number }>): Promise<number> {
    if (!(await pool.query<{ "?column?": number | null }>('SELECT 1 FROM slo_definitions WHERE id=$1', [sloId])).rowCount) throw notFound('SLO não encontrado');
    for (const s of samples) { if (s.good > s.total || s.good < 0) throw new AppError(422, 'bad_sample', 'good deve estar entre 0 e total'); await pool.query(`INSERT INTO slo_samples (slo_id, ts, good, total) VALUES ($1,$2,$3,$4) ON CONFLICT (slo_id, ts) DO UPDATE SET good=EXCLUDED.good, total=EXCLUDED.total`, [sloId, new Date(s.ts), s.good, s.total]); }
    return samples.length;
  },
  /** Move buckets do Redis (gravados por sloRecord) e amostras de filas/DLQ para slo_samples. */
  async collect(now = Date.now()): Promise<{ samples: number }> {
    await flushLocal(); const ids = (await pool.query<Pick<Row<'slo_definitions'>, 'id'>>('SELECT id FROM slo_definitions')).rows.map((r) => r.id as string); let n = 0;
    for (const id of ids) for (const b of await readBuckets(id, now - 6 * 3600_000, now + 1)) { await pool.query(`INSERT INTO slo_samples (slo_id, ts, good, total) VALUES ($1,$2,$3,$4) ON CONFLICT (slo_id, ts) DO UPDATE SET good=EXCLUDED.good, total=EXCLUDED.total`, [id, new Date(b.ts), b.good, b.total]); n++; }
    // Saturação de filas: 1 amostra por coleta por fila (lê os gauges de queue_depth / dlq_size)
    const g = async (name: string) => ((await (m as any)[name].get()).values as Array<{ value: number }>); const bucket = new Date(bucketOf(now));
    for (const [sloId, gauge, limit, cmp] of [['queues-depth', 'queueDepth', 500, 'lt'], ['queues-dlq', 'dlqSize', 50, 'lt']] as const) {
      if (!ids.includes(sloId)) continue; const vals = await g(gauge); if (!vals.length) continue; const total = vals.length; const good = vals.filter((v) => (cmp === 'lt' ? v.value < limit : true)).length;
      await pool.query(`INSERT INTO slo_samples (slo_id, ts, good, total) VALUES ($1,$2,$3,$4) ON CONFLICT (slo_id, ts) DO UPDATE SET good=EXCLUDED.good, total=EXCLUDED.total`, [sloId, bucket, good, total]); n++;
    }
    await pool.query(`DELETE FROM slo_samples WHERE ts < now() - interval '95 days'`); return { samples: n };
  },
  async samples(id: string, days: number): Promise<Sample[]> { return (await pool.query<{ ts: Date; good: number; total: number }>(`SELECT ts, good, total FROM slo_samples WHERE slo_id=$1 AND ts > now() - ($2 || ' days')::interval ORDER BY ts`, [id, String(days)])).rows.map((r) => ({ ts: new Date(r.ts).getTime(), good: Number(r.good), total: Number(r.total) })); },
  async status(now = Date.now()) {
    const defs = await this.definitions(); const out = [];
    for (const d of defs) {
      const smp = await this.samples(d.id, d.window_days); const target = Number(d.target); const b = budgetRemaining(smp, target, d.window_days, now); const alerts = evaluateBurn(smp, target, now);
      const burn1h = alerts[0]!.burn; out.push({ id: d.id, service: d.service, sliType: d.sli_type, target, windowDays: d.window_days, owner: d.owner, events: b.total, goodRatio: b.goodRatio, budgetRemaining: b.remaining, budgetConsumed: b.consumed, burn: Object.fromEntries(alerts.map((a) => [a.window, +a.burn.toFixed(3)])), alerts, hoursToExhaustion: hoursToExhaustion(b.remaining, burn1h, d.window_days), governing: GOVERNING.includes(d.id), freeze: freezePolicy(b.remaining).level });
    }
    return out;
  },
  /** Avalia burn rate multi-janela, abre/fecha alertas, abre incidente em page e aplica a política de freeze. */
  async evaluate(now = Date.now(), o: { openIncidents?: boolean } = {}) {
    const st = await this.status(now); const fired: Array<{ slo: string; window: string; burn: number; severity: string }> = [];
    for (const s of st) {
      for (const a of s.alerts) {
        const open = (await pool.query<Pick<Row<'slo_burn_alerts'>, 'id'>>(`SELECT id FROM slo_burn_alerts WHERE slo_id=$1 AND alert_window=$2 AND resolved_at IS NULL`, [s.id, a.window])).rows[0];
        if (a.firing && !open) { await pool.query(`INSERT INTO slo_burn_alerts (slo_id, alert_window, burn_rate, severity, fired_at) VALUES ($1,$2,$3,$4,$5)`, [s.id, a.window, a.burn.toFixed(3), a.severity, new Date(now)]); fired.push({ slo: s.id, window: a.window, burn: a.burn, severity: a.severity });
          if (a.severity === 'page' && o.openIncidents !== false) { const title = `SLO ${s.id}: burn rate ${a.burn.toFixed(1)}x (${a.window})`; if (!(await pool.query<{ "?column?": number | null }>(`SELECT 1 FROM incidents WHERE source='slo' AND title=$1 AND status <> 'resolved'`, [title])).rowCount) await incidentsService.open({ severity: 'sev2', title, components: [COMPONENT[s.service] ?? 'api'], source: 'slo', actor: 'system' }); } }
        if (!a.firing && open) await pool.query(`UPDATE slo_burn_alerts SET resolved_at=$2 WHERE id=$1`, [open.id, new Date(now)]);
      }
    }
    const gov = st.filter((s) => s.governing && s.events > 0); const worst = gov.length ? Math.min(...gov.map((s) => s.budgetRemaining)) : 1; const pol = freezePolicy(worst);
    const flag = (await pool.query<Pick<Row<'feature_flags'>, 'enabled'>>(`SELECT enabled FROM feature_flags WHERE key='release_freeze'`)).rows.at(0)?.enabled as boolean | undefined; let froze = false;
    if (pol.freeze && !flag) { await setFreeze(true, 'system', `error budget restante ${(worst * 100).toFixed(1)}% < ${FREEZE_THRESHOLD * 100}%`); froze = true; }
    return { fired, worstBudget: worst, policy: pol, froze, frozen: !!(flag || froze) };
  },
  /** Gate consultado pelo CI/CD antes de liberar features (infra/scripts/release-gate.sh). Fixes de segurança/estabilidade passam com `type=fix`. */
  async releaseGate(type: 'feature' | 'fix' = 'feature') {
    const frozen = !!(await pool.query<Pick<Row<'feature_flags'>, 'enabled'>>(`SELECT enabled FROM feature_flags WHERE key='release_freeze'`)).rows.at(0)?.enabled; const st = await this.status();
    const gov = st.filter((s) => s.governing && s.events > 0); const worst = gov.length ? Math.min(...gov.map((s) => s.budgetRemaining)) : 1;
    const allowed = type === 'fix' || !frozen; return { allowed, frozen, type, worstBudget: worst, reason: allowed ? (frozen ? 'fix permitido durante freeze' : 'ok') : `freeze de features: error budget ${(worst * 100).toFixed(1)}% (< 25%). Prioridade: estabilidade; liberação exige aprovação de SRE.` };
  },
  /** Descongelar: exige motivo; com budget esgotado exige aprovação explícita de SRE (override). */
  async unfreeze(adminId: string, b: { reason: string; sreApproval?: boolean }) {
    const g = await this.releaseGate('feature'); if (g.worstBudget <= 0 && !b.sreApproval) throw new AppError(409, 'sre_approval_required', 'Error budget esgotado: descongelar exige aprovação de SRE (sreApproval=true)');
    if (g.worstBudget >= FREEZE_THRESHOLD || b.sreApproval) { await setFreeze(false, adminId, b.reason); return { frozen: false, override: g.worstBudget < FREEZE_THRESHOLD }; }
    throw new AppError(409, 'budget_low', `Error budget ${(g.worstBudget * 100).toFixed(1)}% < 25%: informe sreApproval=true para liberar`);
  },
  async alerts(limit = 100) { return (await pool.query<Row<'slo_burn_alerts'>>(`SELECT * FROM slo_burn_alerts ORDER BY fired_at DESC LIMIT $1`, [limit])).rows; },
};
