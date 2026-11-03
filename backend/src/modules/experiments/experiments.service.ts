import { z } from 'zod';
import { pool, asSystem } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { audit } from '../../repositories/audit.js';
import { conflict, notFound, badRequest, unprocessable } from '../../utils/errors.js';
import { logger } from '../../observability/logger.js';
import { m } from '../../observability/metrics.js';
import { isEnabled } from '../flags.service.js';
import { growthSettings } from '../growth/settings.js';
import { optedOutOfExperiments } from '../growth/consent.js';
import { track, onEvent } from '../analytics/analytics.service.js';
import { decide, type Variant, type Target } from './assignment.js';
import { analyze, sampleSizeProportions, sampleSizeMeans, minDurationDays, mdeProportions, powerProportions, welchT, tCdf, type Correction, type Moments } from './stats.js';
import type { Row } from '../../db/rows.generated.js';

export interface Metric { type: 'conversion' | 'mean'; event: string; label?: string }
export interface Guardrail { metric: string; direction: 'increase_bad' | 'decrease_bad'; maxRelativeChange: number; minHours: number; minSample?: number; alpha?: number }
export interface Exp {
  id: string; key: string; name: string; hypothesis: string; status: 'draft' | 'running' | 'paused' | 'concluded' | 'archived'; variants: Variant[]; primary: Metric; secondary: Metric[]; guardrails: Guardrail[]; target: Target;
  trafficPct: number; salt: string; respectsHoldout: boolean; baselineRate: number | null; mdeRelative: number | null; alpha: number; power: number; requiredPerVariant: number | null; windowDays: number;
  decision: string | null; decisionNotes: string | null; winner: string | null; startAt: Date | null; endAt: Date | null; guardrailBreachSince: Date | null; pausedReason: string | null; createdAt: Date;
}
const toExp = (r: Record<string, any>): Exp => ({
  id: r.id, key: r.key, name: r.name, hypothesis: r.hypothesis, status: r.status, variants: r.variants_json, primary: r.primary_metric, secondary: r.secondary_metrics ?? [], guardrails: r.guardrails_json ?? [], target: r.target_json ?? {},
  trafficPct: r.traffic_pct, salt: r.salt, respectsHoldout: r.respects_holdout, baselineRate: r.baseline_rate, mdeRelative: r.mde_relative, alpha: r.alpha, power: r.power, requiredPerVariant: r.required_per_variant, windowDays: r.conversion_window_days,
  decision: r.decision, decisionNotes: r.decision_notes, winner: r.winner, startAt: r.start_at ? new Date(r.start_at) : null, endAt: r.end_at ? new Date(r.end_at) : null, guardrailBreachSince: r.guardrail_breach_since ? new Date(r.guardrail_breach_since) : null, pausedReason: r.paused_reason, createdAt: new Date(r.created_at),
});
// ───────── Validação de entrada (admin) ─────────
const metricSchema = z.object({ type: z.enum(['conversion', 'mean']), event: z.string().regex(/^[a-z0-9_]{2,60}$/), label: z.string().max(80).optional() });
const guardrailSchema = z.object({ metric: z.string().regex(/^(ai_cost_cents|event:[a-z0-9_]{2,60})$/), direction: z.enum(['increase_bad', 'decrease_bad']), maxRelativeChange: z.number().gt(0).max(10), minHours: z.number().min(0).max(24 * 30), minSample: z.number().int().min(2).optional(), alpha: z.number().gt(0).lt(1).optional() });
export const experimentInput = z.object({
  key: z.string().regex(/^[a-z0-9_]{3,60}$/), name: z.string().min(3).max(120), hypothesis: z.string().max(600).default(''),
  variants: z.array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,30}$/), name: z.string().max(80).optional(), weight: z.number().int().min(1).max(100) })).min(2).max(6)
    .refine((v) => new Set(v.map((x) => x.key)).size === v.length, 'chaves de variante duplicadas').refine((v) => v.reduce((a, x) => a + x.weight, 0) === 100, 'a soma dos pesos deve ser 100'),
  primaryMetric: metricSchema, secondaryMetrics: z.array(metricSchema).max(6).default([]), guardrails: z.array(guardrailSchema).max(6).default([]),
  target: z.object({ plans: z.array(z.enum(['free', 'pro', 'business'])).optional(), regions: z.array(z.enum(['LATAM', 'EU', 'US'])).optional(), countries: z.array(z.string().length(2)).optional(), newUsersOnly: z.boolean().optional() }).default({}),
  trafficPct: z.number().int().min(0).max(100).default(100), respectsHoldout: z.boolean().default(true),
  baselineRate: z.number().gt(0).lt(1).optional(), mdeRelative: z.number().gt(0).max(5).optional(), alpha: z.number().gt(0).lt(0.5).default(0.05), power: z.number().gt(0.5).lt(0.99).default(0.8), conversionWindowDays: z.number().int().min(1).max(90).default(14),
});
export type ExperimentInput = z.infer<typeof experimentInput>;

// ───────── Cache de definições e índice de eventos ─────────
const defKey = (k: string) => `exp:def:${k}`; const IDX = 'exp:evidx';
export async function invalidateExperimentCaches(key?: string): Promise<void> { await redis.del(IDX, ...(key ? [defKey(key)] : [])).catch(() => undefined); }
async function loadDef(key: string): Promise<Exp | null> {
  const c = await redis.get(defKey(key)).catch(() => null);
  if (c) { if (c === 'null') return null; const o = JSON.parse(c) as Exp; return { ...o, startAt: o.startAt ? new Date(o.startAt) : null, endAt: o.endAt ? new Date(o.endAt) : null, guardrailBreachSince: o.guardrailBreachSince ? new Date(o.guardrailBreachSince) : null, createdAt: new Date(o.createdAt) }; }
  const r = await pool.query<Row<'experiments'>>('SELECT * FROM experiments WHERE key=$1', [key]); const e = r.rows[0] ? toExp(r.rows[0]) : null; await redis.set(defKey(key), e ? JSON.stringify(e) : 'null', 'EX', 30).catch(() => undefined); return e;
}
/** evento → experimentos RUNNING que o medem (primária, secundárias e guardrails `event:`). */
async function eventIndex(): Promise<Record<string, string[]>> {
  const c = await redis.get(IDX).catch(() => null); if (c) return JSON.parse(c);
  const rows = (await pool.query<{ id: string; key: string; name: string; hypothesis: string; status: string; variants_json: unknown; primary_metric: unknown; secondary_metrics: unknown; guardrails_json: unknown; target_json: unknown; traffic_pct: number; salt: string; respects_holdout: boolean; baseline_rate: number | null; mde_relative: number | null; alpha: number; power: number; required_per_variant: number | null; conversion_window_days: number; decision: string | null; decision_notes: string | null; winner: string | null; decided_by: string | null; decided_at: Date | null; guardrail_breach_since: Date | null; paused_reason: string | null; start_at: Date | null; end_at: Date | null; created_by: string | null; created_at: Date; updated_at: Date }>(`SELECT * FROM experiments WHERE status='running'`)).rows.map(toExp); const idx: Record<string, string[]> = {};
  for (const e of rows) for (const ev of new Set([e.primary.event, ...e.secondary.map((s) => s.event), ...e.guardrails.filter((g) => g.metric.startsWith('event:')).map((g) => g.metric.slice(6))])) (idx[ev] ??= []).push(e.id);
  await redis.set(IDX, JSON.stringify(idx), 'EX', 15).catch(() => undefined); return idx;
}
export interface AssignResult { key: string; variant: string; inExperiment: boolean; reason: string; fallback?: boolean; exposed?: boolean }
const fallbackAssign = (key: string, variant: string, reason: string): AssignResult => ({ key, variant, inExperiment: false, reason, fallback: true });

async function expose(e: Exp, userId: string, variant: string): Promise<boolean> {
  const flag = `exp:ex:${e.id}:${userId}`; if (await redis.get(flag).catch(() => null)) return true;
  const r = await pool.query(`UPDATE experiment_assignments SET exposed_at=now() WHERE experiment_id=$1 AND user_id=$2 AND exposed_at IS NULL`, [e.id, userId]);
  await redis.set(flag, '1', 'EX', 3600).catch(() => undefined);
  if (r.rowCount) { m.experimentExposures.inc({ experiment: e.key, variant }); await track(userId, 'experiment_exposed', { experiment_key: e.key, variant }); }
  return true;
}
async function stickyVariant(e: Exp, userId: string): Promise<string | null> {
  const ck = `exp:as:${e.id}:${userId}`; const c = await redis.get(ck).catch(() => null); if (c) return c;
  const r = await pool.query<Pick<Row<'experiment_assignments'>, 'variant'>>('SELECT variant FROM experiment_assignments WHERE experiment_id=$1 AND user_id=$2', [e.id, userId]); const v = r.rows.at(0)?.variant as string | undefined; if (v) await redis.set(ck, v, 'EX', 3600).catch(() => undefined); return v ?? null;
}
async function userFacts(userId: string) { const r = await pool.query<Pick<Row<'users'>, 'id' | 'plan' | 'region' | 'country' | 'created_at'>>('SELECT id, plan, region, country, created_at FROM users WHERE id=$1 AND deleted_at IS NULL', [userId]); const u = r.rows[0]; return u ? { id: u.id as string, plan: u.plan as string, region: u.region as string, country: u.country as string | null, createdAt: new Date(u.created_at) } : null; }

/** Decisão pura de variante SEM efeitos colaterais (usada por /experiments/active e pelo debug). */
async function peek(e: Exp, userId: string, holdoutPct: number): Promise<AssignResult> {
  const control = e.variants[0]!.key;
  if (e.status === 'concluded' && e.decision === 'ship' && e.winner) return { key: e.key, variant: e.winner, inExperiment: false, reason: 'shipped' };
  if (e.status !== 'running') return { key: e.key, variant: control, inExperiment: false, reason: 'not_running' };
  if (await optedOutOfExperiments(userId)) return { key: e.key, variant: control, inExperiment: false, reason: 'opted_out' };
  const sticky = await stickyVariant(e, userId); if (sticky) return { key: e.key, variant: e.variants.some((v) => v.key === sticky) ? sticky : control, inExperiment: true, reason: 'sticky' };
  const u = await userFacts(userId); if (!u) return { key: e.key, variant: control, inExperiment: false, reason: 'unknown_user' };
  const d = decide({ key: e.key, salt: e.salt, variants: e.variants, trafficPct: e.trafficPct, target: e.target, startAt: e.startAt, respectsHoldout: e.respectsHoldout }, u, holdoutPct);
  return { key: e.key, ...d };
}
export const experimentsService = {
  /** Atribui (e persiste) a variante e registra a exposição. Qualquer falha ⇒ controle (fallback seguro) — nunca quebra a tela. */
  async assign(userId: string, key: string, opts: { expose?: boolean } = {}): Promise<AssignResult> {
    const doExpose = opts.expose ?? true;
    try {
      const e = await loadDef(key); if (!e) return fallbackAssign(key, 'control', 'unknown_experiment'); const control = e.variants[0]!.key;
      if (!(await isEnabled('experiments_enabled', { userId }))) return { key, variant: control, inExperiment: false, reason: 'kill_switch' };
      const gs = await growthSettings(); const p = await peek(e, userId, gs.holdoutPct);
      if (p.reason === 'shipped' || !p.inExperiment) return p;
      if (p.reason !== 'sticky') { // primeira atribuição: persiste (o vencedor da corrida de INSERT é o que vale)
        await pool.query(`INSERT INTO experiment_assignments (experiment_id,user_id,variant) VALUES ($1,$2,$3) ON CONFLICT (experiment_id,user_id) DO NOTHING`, [e.id, userId, p.variant]);
        const v = await stickyVariant(e, userId); if (v) p.variant = v; m.experimentAssignments.inc({ experiment: e.key, variant: p.variant });
      }
      if (doExpose) { await expose(e, userId, p.variant); p.exposed = true; }
      return p;
    } catch (err) { m.experimentFallbacks.inc(); logger.warn({ key, err: (err as Error).message }, 'assign falhou — usando controle'); return fallbackAssign(key, 'control', 'error'); }
  },
  /** Variantes de todos os experimentos em andamento/entregues, sem registrar exposição (o front busca isto no boot → sem flicker). */
  async active(userId: string): Promise<Record<string, { variant: string; inExperiment: boolean; reason: string }>> {
    const out: Record<string, { variant: string; inExperiment: boolean; reason: string }> = {};
    try {
      if (!(await isEnabled('experiments_enabled', { userId }))) return out; const gs = await growthSettings();
      const rows = (await pool.query<{ id: string; key: string; name: string; hypothesis: string; status: string; variants_json: unknown; primary_metric: unknown; secondary_metrics: unknown; guardrails_json: unknown; target_json: unknown; traffic_pct: number; salt: string; respects_holdout: boolean; baseline_rate: number | null; mde_relative: number | null; alpha: number; power: number; required_per_variant: number | null; conversion_window_days: number; decision: string | null; decision_notes: string | null; winner: string | null; decided_by: string | null; decided_at: Date | null; guardrail_breach_since: Date | null; paused_reason: string | null; start_at: Date | null; end_at: Date | null; created_by: string | null; created_at: Date; updated_at: Date }>(`SELECT * FROM experiments WHERE status='running' OR (status='concluded' AND decision='ship' AND winner IS NOT NULL)`)).rows.map(toExp);
      for (const e of rows) { const p = await peek(e, userId, gs.holdoutPct); out[e.key] = { variant: p.variant, inExperiment: p.inExperiment, reason: p.reason }; }
    } catch (err) { logger.warn({ err: (err as Error).message }, 'experiments.active falhou — front usará controles'); }
    return out;
  },
  /** Gancho de eventos: registra a conversão do usuário nos experimentos (running) em que ele foi EXPOSTO e que medem esse evento. */
  async recordEvent(userId: string, name: string, value = 0): Promise<void> {
    const ids = (await eventIndex())[name]; if (!ids?.length) return;
    for (const id of ids) await pool.query(`INSERT INTO experiment_events (experiment_id,user_id,event,value) SELECT $1,$2,$3,$4 WHERE EXISTS (SELECT 1 FROM experiment_assignments WHERE experiment_id=$1 AND user_id=$2 AND exposed_at IS NOT NULL)`, [id, userId, name, value]);
  },
  async convert(userId: string, key: string, event: string, value = 0): Promise<{ recorded: boolean }> {
    const e = await loadDef(key); if (!e) throw notFound('Experimento não encontrado'); const names = new Set([e.primary.event, ...e.secondary.map((s) => s.event)]); if (!names.has(event)) throw badRequest('Evento não faz parte das métricas deste experimento');
    const r = await pool.query(`INSERT INTO experiment_events (experiment_id,user_id,event,value) SELECT $1,$2,$3,$4 WHERE EXISTS (SELECT 1 FROM experiment_assignments WHERE experiment_id=$1 AND user_id=$2 AND exposed_at IS NOT NULL)`, [e.id, userId, event, Math.max(0, Math.min(value, 1_000_000))]);
    return { recorded: (r.rowCount ?? 0) > 0 };
  },

  // ───────── Admin ─────────
  async list() { return (await pool.query<Row<'experiments'>>('SELECT * FROM experiments ORDER BY created_at DESC')).rows.map(toExp); },
  async get(key: string): Promise<Exp> { const r = await pool.query<Row<'experiments'>>('SELECT * FROM experiments WHERE key=$1', [key]); if (!r.rows[0]) throw notFound('Experimento não encontrado'); return toExp(r.rows[0]); },
  async create(actor: string, i: ExperimentInput): Promise<Exp> {
    if ((await pool.query<{ "?column?": number | null }>('SELECT 1 FROM experiments WHERE key=$1', [i.key])).rowCount) throw conflict('Já existe um experimento com essa chave', 'experiment_exists');
    const r = await asSystem(async (db) => { const x = await db.query<Row<'experiments'>>(`INSERT INTO experiments (key,name,hypothesis,variants_json,primary_metric,secondary_metrics,guardrails_json,target_json,traffic_pct,respects_holdout,baseline_rate,mde_relative,alpha,power,conversion_window_days,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`, [i.key, i.name, i.hypothesis, JSON.stringify(i.variants), JSON.stringify(i.primaryMetric), JSON.stringify(i.secondaryMetrics), JSON.stringify(i.guardrails), JSON.stringify(i.target), i.trafficPct, i.respectsHoldout, i.baselineRate ?? null, i.mdeRelative ?? null, i.alpha, i.power, i.conversionWindowDays, actor]);
      await audit(db, actor, 'experiment.create', 'experiment', i.key); return x.rows[0]; }); return toExp(r);
  },
  async update(actor: string, key: string, patch: Partial<ExperimentInput>): Promise<Exp> {
    const e = await this.get(key); const locked = e.status !== 'draft'; const allowedLocked = new Set(['name', 'hypothesis', 'trafficPct']);
    if (e.status === 'concluded' || e.status === 'archived') throw conflict('Experimento encerrado não pode ser editado', 'experiment_closed');
    for (const k of Object.keys(patch)) if (locked && !allowedLocked.has(k)) throw conflict(`Campo '${k}' só pode ser alterado em rascunho (preserva a validade estatística)`, 'experiment_locked');
    const map: Record<string, [string, (v: any) => unknown]> = { name: ['name', (v) => v], hypothesis: ['hypothesis', (v) => v], variants: ['variants_json', JSON.stringify], primaryMetric: ['primary_metric', JSON.stringify], secondaryMetrics: ['secondary_metrics', JSON.stringify], guardrails: ['guardrails_json', JSON.stringify], target: ['target_json', JSON.stringify],
      trafficPct: ['traffic_pct', (v) => v], respectsHoldout: ['respects_holdout', (v) => v], baselineRate: ['baseline_rate', (v) => v], mdeRelative: ['mde_relative', (v) => v], alpha: ['alpha', (v) => v], power: ['power', (v) => v], conversionWindowDays: ['conversion_window_days', (v) => v] };
    const sets: string[] = []; const vals: unknown[] = [key]; for (const [k, v] of Object.entries(patch)) { const mm = map[k]; if (!mm || v === undefined) continue; vals.push(mm[1](v)); sets.push(`${mm[0]}=$${vals.length}`); }
    if (!sets.length) return e; await asSystem(async (db) => { await db.query(`UPDATE experiments SET ${sets.join(',')}, updated_at=now() WHERE key=$1`, vals); await audit(db, actor, 'experiment.update', 'experiment', key, patch as Record<string, unknown>); });
    await invalidateExperimentCaches(key); return this.get(key);
  },
  async start(actor: string, key: string): Promise<Exp> {
    const e = await this.get(key); if (e.status !== 'draft' && e.status !== 'paused') throw conflict('Só é possível iniciar rascunhos ou retomar pausados', 'invalid_state');
    let required = e.requiredPerVariant; if (e.status === 'draft' && e.baselineRate && e.mdeRelative && e.primary.type === 'conversion') required = sampleSizeProportions({ baseline: e.baselineRate, mdeRelative: e.mdeRelative, alpha: e.alpha, power: e.power });
    await asSystem(async (db) => { await db.query(`UPDATE experiments SET status='running', start_at=COALESCE(start_at, now()), required_per_variant=$2, guardrail_breach_since=NULL, paused_reason=NULL, updated_at=now() WHERE key=$1`, [key, required]); await audit(db, actor, 'experiment.start', 'experiment', key, { requiredPerVariant: required }); });
    await invalidateExperimentCaches(key); return this.get(key);
  },
  async pause(actor: string, key: string, reason = 'manual'): Promise<Exp> {
    const e = await this.get(key); if (e.status !== 'running') throw conflict('Só experimentos em andamento podem ser pausados', 'invalid_state');
    await asSystem(async (db) => { await db.query(`UPDATE experiments SET status='paused', paused_reason=$2, updated_at=now() WHERE key=$1`, [key, reason]); await audit(db, actor, 'experiment.pause', 'experiment', key, { reason }); });
    await invalidateExperimentCaches(key); return this.get(key);
  },
  async conclude(actor: string, key: string, d: { decision: 'ship' | 'keep_control' | 'iterate' | 'inconclusive'; winner?: string; notes?: string }): Promise<Exp> {
    const e = await this.get(key); if (e.status === 'concluded' || e.status === 'archived') throw conflict('Experimento já encerrado', 'invalid_state'); if (e.status === 'draft') throw conflict('Inicie o experimento antes de encerrar', 'invalid_state');
    if (d.decision === 'ship') { if (!d.winner || !e.variants.some((v) => v.key === d.winner)) throw unprocessable('Para "ship" informe a variante vencedora (uma das variantes do experimento)'); }
    await asSystem(async (db) => { await db.query(`UPDATE experiments SET status='concluded', decision=$2, winner=$3, decision_notes=$4, decided_by=$5, decided_at=now(), end_at=now(), updated_at=now() WHERE key=$1`, [key, d.decision, d.decision === 'ship' ? d.winner : null, d.notes ?? null, actor]); await audit(db, actor, 'experiment.conclude', 'experiment', key, d); });
    await invalidateExperimentCaches(key); return this.get(key);
  },
  async plan(i: { baseline?: number; mdeRelative?: number; sd?: number; deltaAbs?: number; alpha?: number; power?: number; variants: number; eligiblePerDay?: number; trafficPct?: number; nPerVariant?: number }) {
    const alpha = i.alpha ?? 0.05, power = i.power ?? 0.8; const comparisons = Math.max(1, i.variants - 1); const alphaAdj = alpha / comparisons; // Bonferroni conservador p/ A/B/n
    let requiredPerVariant: number; if (i.baseline && i.mdeRelative) requiredPerVariant = sampleSizeProportions({ baseline: i.baseline, mdeRelative: i.mdeRelative, alpha: alphaAdj, power }); else if (i.sd && i.deltaAbs) requiredPerVariant = sampleSizeMeans({ sd: i.sd, delta: i.deltaAbs, alpha: alphaAdj, power }); else throw badRequest('Informe (baseline e mdeRelative) ou (sd e deltaAbs)');
    return { alpha, alphaPerComparison: alphaAdj, power, requiredPerVariant, totalRequired: requiredPerVariant * i.variants, minDurationDays: i.eligiblePerDay ? minDurationDays({ requiredPerVariant, variants: i.variants, eligiblePerDay: i.eligiblePerDay, trafficPct: i.trafficPct ?? 100 }) : null,
      ...(i.baseline && i.nPerVariant ? { mdeAtN: mdeProportions({ baseline: i.baseline, n: i.nPerVariant, alpha: alphaAdj, power }), powerAtN: i.mdeRelative ? powerProportions({ baseline: i.baseline, mdeRelative: i.mdeRelative, n: i.nPerVariant, alpha: alphaAdj }) : null } : {}) };
  },

  // ───────── Resultados ─────────
  async conversionCounts(e: Exp, event: string): Promise<Record<string, { n: number; conv: number }>> {
    const r = await pool.query<{ variant: string; n: number; conv: number }>(`SELECT a.variant, count(*)::int n, count(*) FILTER (WHERE EXISTS (SELECT 1 FROM experiment_events ev WHERE ev.experiment_id=a.experiment_id AND ev.user_id=a.user_id AND ev.event=$2 AND ev.created_at >= a.exposed_at AND ev.created_at < a.exposed_at + make_interval(days => $3)))::int conv
      FROM experiment_assignments a WHERE a.experiment_id=$1 AND a.exposed_at IS NOT NULL GROUP BY a.variant`, [e.id, event, e.windowDays]); return Object.fromEntries(r.rows.map((x) => [x.variant, { n: x.n, conv: x.conv }]));
  },
  /** Momentos (n, média, variância amostral) por variante de uma métrica por usuário exposto. */
  async moments(e: Exp, spec: { kind: 'sum' | 'count' | 'ai_cost'; event?: string }): Promise<Record<string, Moments>> {
    const expr = spec.kind === 'ai_cost' ? `COALESCE((SELECT sum(u.cost_cents) FROM ai_usage u WHERE u.user_id=a.user_id AND u.created_at >= a.exposed_at AND u.created_at < a.exposed_at + make_interval(days => $3)),0)`
      : `COALESCE((SELECT ${spec.kind === 'sum' ? 'sum(ev.value)' : 'count(*)'} FROM experiment_events ev WHERE ev.experiment_id=a.experiment_id AND ev.user_id=a.user_id AND ev.event=$2 AND ev.created_at >= a.exposed_at AND ev.created_at < a.exposed_at + make_interval(days => $3)),0)`;
    const r = await pool.query(`WITH pu AS (SELECT a.variant, ${expr}::float8 v FROM experiment_assignments a WHERE a.experiment_id=$1 AND a.exposed_at IS NOT NULL AND $2::text IS NOT NULL) SELECT variant, count(*)::int n, COALESCE(avg(v),0)::float8 mean, COALESCE(var_samp(v),0)::float8 variance FROM pu GROUP BY variant`, [e.id, spec.event ?? '', e.windowDays]);
    return Object.fromEntries(r.rows.map((x) => [x.variant, { n: x.n, mean: x.mean, variance: x.variance }]));
  },
  async results(key: string, o: { correction?: Correction; bayes?: boolean } = {}) {
    const e = await this.get(key); const correction = o.correction ?? 'holm'; const ordered = e.variants;
    const metricOut = async (mt: Metric, primary: boolean) => {
      if (mt.type === 'conversion') { const c = await this.conversionCounts(e, mt.event); const data = ordered.map((v) => ({ key: v.key, weight: v.weight, n: c[v.key]?.n ?? 0, conversions: c[v.key]?.conv ?? 0 })); return { event: mt.event, label: mt.label, primary, ...analyze(data, { metricType: 'conversion', alpha: e.alpha, correction, bayes: o.bayes }) }; }
      const mo = await this.moments(e, { kind: 'sum', event: mt.event }); const data = ordered.map((v) => ({ key: v.key, weight: v.weight, n: mo[v.key]?.n ?? 0, mean: mo[v.key]?.mean ?? 0, variance: mo[v.key]?.variance ?? 0 })); return { event: mt.event, label: mt.label, primary, ...analyze(data, { metricType: 'mean', alpha: e.alpha, correction }) };
    };
    const primary = await metricOut(e.primary, true); const secondary: Awaited<ReturnType<typeof metricOut>>[] = []; for (const s of e.secondary) secondary.push(await metricOut(s, false));
    const ai = await this.moments(e, { kind: 'ai_cost' }); const guardrails = await this.evaluateGuardrails(e);
    const nPer = Math.min(...primary.variants.map((v) => v.n)); const enough = e.requiredPerVariant ? nPer >= e.requiredPerVariant : null; const winnerCand = primary.variants.filter((v) => v.vsControl?.significant && (v.vsControl.diff > 0)).sort((a, b) => b.vsControl!.diff - a.vsControl!.diff)[0];
    const hint = primary.srm.mismatch ? 'invalid_srm' : guardrails.some((g) => g.breached) ? 'guardrail_breach' : enough === false ? 'keep_running' : winnerCand ? `ship_candidate:${winnerCand.key}` : 'inconclusive_or_keep_control';
    return { experiment: { key: e.key, name: e.name, status: e.status, startAt: e.startAt, windowDays: e.windowDays, requiredPerVariant: e.requiredPerVariant, decision: e.decision, winner: e.winner }, correction, primary, secondary,
      aiCostPerUserCents: Object.fromEntries(ordered.map((v) => [v.key, { n: ai[v.key]?.n ?? 0, mean: ai[v.key]?.mean ?? 0 }])), guardrails, sampleSufficient: enough, decisionHint: hint };
  },
  /** Avalia cada guardrail (variante vs controle). Viola quando a mudança relativa passa do limite NA direção ruim, com amostra mínima e significância unilateral. */
  async evaluateGuardrails(e: Exp): Promise<Array<{ metric: string; variant: string; relativeChange: number | null; breached: boolean; p: number | null; n: number }>> {
    const out: Array<{ metric: string; variant: string; relativeChange: number | null; breached: boolean; p: number | null; n: number }> = [];
    for (const g of e.guardrails) {
      const mo = await this.moments(e, g.metric === 'ai_cost_cents' ? { kind: 'ai_cost' } : { kind: 'count', event: g.metric.slice(6) }); const c = mo[e.variants[0]!.key];
      for (const v of e.variants.slice(1)) { const t = mo[v.key]; if (!c || !t) { out.push({ metric: g.metric, variant: v.key, relativeChange: null, breached: false, p: null, n: 0 }); continue; } out.push({ metric: g.metric, variant: v.key, ...evaluateGuardrail(g, c, t) }); }
    }
    return out;
  },
  /** Job periódico: pausa o experimento se um guardrail ficar violado de forma contínua por `minHours`. */
  async checkGuardrails(now = new Date()): Promise<Array<{ key: string; action: 'ok' | 'breach_started' | 'breach_ongoing' | 'paused'; detail?: unknown }>> {
    const out: Array<{ key: string; action: 'ok' | 'breach_started' | 'breach_ongoing' | 'paused'; detail?: unknown }> = [];
    for (const e of (await this.list()).filter((x) => x.status === 'running' && x.guardrails.length)) {
      const ev = await this.evaluateGuardrails(e); const bad = ev.filter((x) => x.breached);
      if (!bad.length) { if (e.guardrailBreachSince) await pool.query('UPDATE experiments SET guardrail_breach_since=NULL WHERE id=$1', [e.id]); out.push({ key: e.key, action: 'ok' }); continue; }
      const since = e.guardrailBreachSince ?? now; if (!e.guardrailBreachSince) await pool.query('UPDATE experiments SET guardrail_breach_since=$2 WHERE id=$1', [e.id, now]);
      const needH = Math.max(...e.guardrails.filter((g) => bad.some((b) => b.metric === g.metric)).map((g) => g.minHours)); const hours = (now.getTime() - since.getTime()) / 3_600_000;
      if (hours >= needH) {
        const reason = `guardrail violado por ${hours.toFixed(1)}h: ${bad.map((b) => `${b.metric}/${b.variant} ${((b.relativeChange ?? 0) * 100).toFixed(0)}%`).join(', ')}`;
        await this.pause('system', e.key, reason); await pool.query(`INSERT INTO growth_alerts (kind, severity, message, data) VALUES ('experiment_guardrail','critical',$1,$2)`, [`Experimento ${e.key} pausado automaticamente: ${reason}`, JSON.stringify({ key: e.key, breaches: bad })]);
        m.experimentGuardrailPauses.inc({ experiment: e.key }); out.push({ key: e.key, action: 'paused', detail: bad });
      } else out.push({ key: e.key, action: e.guardrailBreachSince ? 'breach_ongoing' : 'breach_started', detail: { hours, needH, bad } });
    }
    return out;
  },
};
/** Pura (testável): c = controle, t = tratamento. */
export function evaluateGuardrail(g: Guardrail, c: Moments, t: Moments): { relativeChange: number | null; breached: boolean; p: number | null; n: number } {
  const minN = g.minSample ?? 100; const n = Math.min(c.n, t.n); if (n < minN || c.n < 2 || t.n < 2) return { relativeChange: null, breached: false, p: null, n };
  const rel = c.mean === 0 ? (t.mean === 0 ? 0 : Infinity * Math.sign(t.mean)) : (t.mean - c.mean) / Math.abs(c.mean); const w = welchT(c, t, g.alpha ?? 0.05);
  const pOne = w.stat === 0 ? 0.5 : w.stat > 0 ? 1 - tCdf(w.stat, w.df) : tCdf(w.stat, w.df); // unilateral na direção observada
  const badDir = g.direction === 'increase_bad' ? rel > g.maxRelativeChange : -rel > g.maxRelativeChange; const sigDir = g.direction === 'increase_bad' ? w.stat > 0 : w.stat < 0;
  return { relativeChange: Number.isFinite(rel) ? rel : null, breached: badDir && sigDir && pOne < (g.alpha ?? 0.05), p: pOne, n };
}
onEvent(async (userId, name, props) => { if (name.startsWith('experiment_')) return; const v = typeof props.amount_cents === 'number' ? props.amount_cents : typeof props.credits === 'number' ? props.credits : 0; await experimentsService.recordEvent(userId, name, name === 'revenue_recorded' ? Number(props.amount_cents ?? 0) : v); });
