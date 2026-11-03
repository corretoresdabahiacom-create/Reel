import { pool } from '../../db/pool.js';
import { growthSettings } from '../growth/settings.js';
import { forecastDaily, projectMonth } from './forecast.js';

const DAY = 86_400_000;
const startOfDayUtc = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
/** Preenche dias sem linha com 0 (série contínua). */
export function fillDaily(rows: Array<{ d: string | Date; v: number | string }>, from: Date, days: number): number[] {
  const m = new Map(rows.map((r) => [startOfDayUtc(new Date(r.d)).getTime(), Number(r.v)]));
  return Array.from({ length: days }, (_, i) => m.get(from.getTime() + i * DAY) ?? 0);
}
export const FUNNEL_STEPS = ['user_signed_up', 'project_created', 'video_assembled', 'video_published', 'subscription_started'] as const;

export const datascienceService = {
  async dailyRevenue(days: number, now = new Date()) {
    const from = new Date(startOfDayUtc(now).getTime() - (days - 1) * DAY);
    const r = await pool.query(`SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') d, sum(COALESCE(amount_brl_cents, amount_cents))::bigint v FROM transactions WHERE type IN ('subscription','credit_purchase') AND amount_cents>0 AND created_at >= $1 GROUP BY 1`, [from]);
    return { from, values: fillDaily(r.rows, from, days) };
  },
  async dailyAiCost(days: number, now = new Date()) {
    const from = new Date(startOfDayUtc(now).getTime() - (days - 1) * DAY);
    const r = await pool.query(`SELECT date_trunc('day', created_at AT TIME ZONE 'UTC') d, sum(cost_cents) v FROM ai_usage WHERE created_at >= $1 GROUP BY 1`, [from]);
    return { from, values: fillDaily(r.rows, from, days) };
  },
  /** Previsão de receita (BRL centavos) para os próximos `horizon` dias. */
  async forecastRevenue(o: { history?: number; horizon?: number; now?: Date } = {}) {
    const now = o.now ?? new Date(); const s = await this.dailyRevenue(o.history ?? 90, now); const horizon = o.horizon ?? 30;
    const fc = forecastDaily(s.values, horizon, s.from.getUTCDay());
    return { unit: 'brl_cents', method: fc.method, history: s.values.length, horizon, totalNext: Math.round(fc.points.reduce((a, p) => a + p.value, 0)), points: fc.points.map((p) => ({ ...p, value: Math.round(p.value), lo: Math.round(p.lo), hi: Math.round(p.hi) })) };
  },
  /** Projeta o custo de IA do mês corrente e abre alerta se superar o orçamento (um alerta aberto por mês). */
  async forecastAiCost(o: { now?: Date; alert?: boolean } = {}) {
    const now = o.now ?? new Date(); const gs = await growthSettings(); const budget = gs.aiCostMonthlyBudgetCents;
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)); const nextMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
    const daysInMonth = Math.round((nextMonth.getTime() - monthStart.getTime()) / DAY); const today = startOfDayUtc(now);
    const elapsed = Math.round((today.getTime() - monthStart.getTime()) / DAY); const remaining = daysInMonth - elapsed - 1;
    const s = await this.dailyAiCost(60, now); const spent = Number((await pool.query(`SELECT COALESCE(sum(cost_cents),0) s FROM ai_usage WHERE created_at >= $1`, [monthStart])).rows[0].s);
    const history = s.values.slice(0, -1); // exclui o dia corrente (parcial)
    const todayCost = s.values[s.values.length - 1] ?? 0;
    const startDow = s.from.getUTCDay(); const p = projectMonth(spent - todayCost, remaining + 1, history, startDow);
    // `projectMonth` prevê a partir do fim de `history`; o dia corrente é o 1º previsto.
    const projected = Math.round(p.projected), lo = Math.round(p.lo), hi = Math.round(p.hi);
    const over = projected > budget; let alerted = false;
    if (over && o.alert !== false) {
      const month = monthStart.toISOString().slice(0, 7);
      const ex = await pool.query(`SELECT 1 FROM growth_alerts WHERE kind='ai_cost_forecast' AND resolved_at IS NULL AND data->>'month'=$1`, [month]);
      if (!ex.rowCount) { await pool.query(`INSERT INTO growth_alerts (kind, severity, message, data) VALUES ('ai_cost_forecast', $1, $2, $3)`, [projected > budget * 1.25 ? 'critical' : 'warning', `Custo de IA projetado para ${month}: ${(projected / 100).toFixed(2)} BRL (orçamento ${(budget / 100).toFixed(2)})`, JSON.stringify({ month, projected, lo, hi, budget, spent })]); alerted = true; }
    }
    return { month: monthStart.toISOString().slice(0, 7), budgetCents: budget, spentCents: spent, projectedCents: projected, loCents: lo, hiCents: hi, overBudget: over, alerted, remainingDays: remaining, method: p.forecast.method };
  },
  /** Funil global por usuários distintos (eventos de servidor) e conversão passo a passo. */
  async funnel(o: { from: Date; to: Date }) {
    const r = await pool.query(`SELECT name, count(DISTINCT COALESCE(user_id::text, pseudo_id)) n FROM analytics_events WHERE name = ANY($1) AND created_at >= $2 AND created_at < $3 AND schema_version > 0 GROUP BY name`, [[...FUNNEL_STEPS], o.from, o.to]);
    const m = new Map(r.rows.map((x) => [x.name as string, Number(x.n)]));
    return { from: o.from, to: o.to, steps: FUNNEL_STEPS.map((name, i) => { const n = m.get(name) ?? 0; const prev = i ? m.get(FUNNEL_STEPS[i - 1]!) ?? 0 : n; return { name, users: n, stepConversion: i && prev ? Math.round((n / prev) * 1e4) / 1e4 : null, overall: m.get(FUNNEL_STEPS[0]) ? Math.round((n / m.get(FUNNEL_STEPS[0])!) * 1e4) / 1e4 : null }; }) };
  },
  /** LTV acumulado por coorte mensal de cadastro (receita BRL / usuários da coorte) em D0/D30/D60/D90. */
  async cohortLtv(months = 6) {
    const r = await pool.query(`WITH c AS (SELECT id, date_trunc('month', created_at) cohort, created_at su FROM users WHERE deleted_at IS NULL AND created_at >= date_trunc('month', now()) - make_interval(months => $1)),
      sz AS (SELECT cohort, count(*)::int n FROM c GROUP BY 1)
      SELECT c.cohort, sz.n, d.k,
        COALESCE(sum(COALESCE(t.amount_brl_cents, t.amount_cents)) FILTER (WHERE t.created_at < c.su + make_interval(days => d.k)),0)::bigint rev
      FROM c JOIN sz USING (cohort) CROSS JOIN (VALUES (0),(30),(60),(90)) d(k)
      LEFT JOIN transactions t ON t.user_id=c.id AND t.type IN ('subscription','credit_purchase') AND t.amount_cents>0
      GROUP BY c.cohort, sz.n, d.k ORDER BY c.cohort, d.k`, [months]);
    const by = new Map<string, { cohort: string; users: number; ltvCents: Record<string, number> }>();
    for (const x of r.rows) { const k = new Date(x.cohort).toISOString().slice(0, 7); const e = by.get(k) ?? { cohort: k, users: x.n as number, ltvCents: {} as Record<string, number> }; e.ltvCents[`d${x.k}`] = Math.round(Number(x.rev) / x.n); by.set(k, e); }
    return { items: [...by.values()] };
  },
  async propensityTop(target: 'upgrade' | 'credits', limit = 100) { return { items: (await pool.query(`SELECT p.user_id AS "userId", p.score, p.model_version AS "modelVersion" FROM propensity_scores p JOIN users u ON u.id=p.user_id AND u.deleted_at IS NULL WHERE p.target=$1 ORDER BY p.score DESC LIMIT $2`, [target, limit])).rows }; },
};
