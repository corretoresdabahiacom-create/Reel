import { pool } from '../../db/pool.js';
import { audit } from '../../repositories/audit.js';
import { AppError } from '../../utils/errors.js';
import { finopsService } from '../finops/finops.service.js';
import type { Row } from '../../db/rows.generated.js';
import { burnMultiple, growthPct, ltvCents, magicNumber, paybackMonths, retentionKpis, runwayMonths, ruleOf40, zAnomaly } from './kpis.js';

export interface BoardInputs { marketingSpendCents?: number; prevQuarterMarketingSpendCents?: number; cashCents?: number; netBurnMonthlyCents?: number; operatingMarginPct?: number; newCustomers?: number }
/** MRR por assinante: última transação de assinatura dentro da janela [from, to). */
async function mrrByUser(from: Date, to: Date): Promise<Map<string, number>> {
  const rows = (await pool.query<{ u: string; a: number }>(`SELECT DISTINCT ON (user_id) user_id::text AS u, COALESCE(amount_brl_cents, amount_cents)::float AS a FROM transactions WHERE type='subscription' AND amount_cents > 0 AND created_at >= $1 AND created_at < $2 ORDER BY user_id, created_at DESC`, [from, to])).rows;
  return new Map(rows.map((r) => [r.u as string, Number(r.a)]));
}
const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0); const D = 86400_000;
export const boardService = {
  /** KPIs derivados do banco + entradas financeiras informadas (marketing, caixa, burn). Sem entrada => KPI nulo. Janela mensal = 30 dias terminando em `asOf`. */
  async compute(asOf = new Date(), inputs: BoardInputs = {}) {
    const cur = await mrrByUser(new Date(asOf.getTime() - 30 * D), new Date(asOf.getTime() + 1)); const prev = await mrrByUser(new Date(asOf.getTime() - 60 * D), new Date(asOf.getTime() - 30 * D)); const prevYear = await mrrByUser(new Date(asOf.getTime() - 395 * D), new Date(asOf.getTime() - 365 * D)); const prevQuarter = await mrrByUser(new Date(asOf.getTime() - 120 * D), new Date(asOf.getTime() - 90 * D));
    const mrr = sum(cur), prevMrr = sum(prev), arr = mrr * 12; const ret = retentionKpis({ prevMrr: prev, currMrr: cur });
    const gm = await finopsService.grossMargin({ from: new Date(asOf.getTime() - 30 * D), to: new Date(asOf.getTime() + 1) }); const paid = gm.segments.filter((s) => s.segment === 'pro' || s.segment === 'business'); const rev = paid.reduce((a, s) => a + s.revenueCents, 0); const cogs = paid.reduce((a, s) => a + s.cogsCents, 0);
    const grossMarginPct = rev > 0 ? +(((rev - cogs) / rev) * 100).toFixed(1) : null; const arpa = cur.size ? Math.round(mrr / cur.size) : null;
    const cac = inputs.marketingSpendCents && inputs.newCustomers ? Math.round(inputs.marketingSpendCents / inputs.newCustomers) : null; const churn = ret.logoChurnPct;
    const ltv = ltvCents(arpa, grossMarginPct, churn); const netNewArr = (mrr - prevMrr) * 12; const yoy = growthPct(mrr, sum(prevYear)); const mom = growthPct(mrr, prevMrr);
    const annualized = mom !== null ? +(((1 + mom / 100) ** 12 - 1) * 100).toFixed(1) : null; const growthForRule = yoy ?? annualized;
    return {
      asOf: asOf.toISOString().slice(0, 10), mrrCents: mrr, arrCents: arr, payingCustomers: cur.size, arpaCents: arpa, momGrowthPct: mom, yoyGrowthPct: yoy, netNewArrCents: netNewArr, ...ret,
      grossMarginPct, cacCents: cac, ltvCents: ltv, ltvToCac: ltv !== null && cac ? +(ltv / cac).toFixed(2) : null, paybackMonths: paybackMonths(cac, arpa, grossMarginPct),
      netNewArrQuarterCents: (mrr - sum(prevQuarter)) * 12, magicNumber: magicNumber((mrr - sum(prevQuarter)) * 12, inputs.prevQuarterMarketingSpendCents ?? null), ruleOf40: ruleOf40(growthForRule, inputs.operatingMarginPct ?? null), growthBasis: yoy !== null ? 'yoy' : annualized !== null ? 'mom_annualized' : null,
      burnMultiple: burnMultiple(inputs.netBurnMonthlyCents ?? null, netNewArr), cashRunwayMonths: runwayMonths(inputs.cashCents ?? null, inputs.netBurnMonthlyCents ?? null),
      missingInputs: (['marketingSpendCents', 'newCustomers', 'prevQuarterMarketingSpendCents', 'operatingMarginPct', 'cashCents', 'netBurnMonthlyCents'] as const).filter((k) => inputs[k] === undefined),
      caveats: ['Aproximação: MRR = última cobrança de assinatura na janela de 30 dias; planos anuais/trials não são modelados.', 'Nenhum KPI é "auditado": são calculados do banco e devem ser conciliados com Stripe/contabilidade antes de ir ao data room.'],
    };
  },
  /** Grava/atualiza o relatório de board do período (YYYY-MM). Publicar exige 2º par de olhos (publishedBy ≠ createdBy não é imposto aqui: use a revisão do conselho). */
  async save(adminId: string, period: string, inputs: BoardInputs = {}) {
    if (!/^\d{4}-\d{2}$/.test(period)) throw new AppError(422, 'bad_period', 'period deve ser YYYY-MM'); const end = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)), 1) - 1); const k = await this.compute(end, inputs);
    const row = (await pool.query<Row<'board_reports'>>(`INSERT INTO board_reports (period, mrr_cents, arr_cents, ndr_pct, grr_pct, churn_pct, burn_multiple, cash_runway_months, metrics) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (period) DO UPDATE SET mrr_cents=EXCLUDED.mrr_cents, arr_cents=EXCLUDED.arr_cents, ndr_pct=EXCLUDED.ndr_pct, grr_pct=EXCLUDED.grr_pct, churn_pct=EXCLUDED.churn_pct, burn_multiple=EXCLUDED.burn_multiple, cash_runway_months=EXCLUDED.cash_runway_months, metrics=EXCLUDED.metrics WHERE board_reports.published_at IS NULL RETURNING *`,
      [period, k.mrrCents, k.arrCents, k.ndrPct, k.grrPct, k.logoChurnPct, k.burnMultiple, k.cashRunwayMonths, JSON.stringify({ ...k, inputs })])).rows[0]; if (!row) throw new AppError(409, 'report_published', 'Relatório já publicado: crie uma retificação');
    await audit(pool, adminId, 'board.save', 'board_report', period, { mrr: k.mrrCents }); return row;
  },
  async publish(adminId: string, period: string) { const r = await pool.query<Row<'board_reports'>>(`UPDATE board_reports SET published_at=now() WHERE period=$1 AND published_at IS NULL RETURNING *`, [period]); if (!r.rowCount) throw new AppError(404, 'not_found', 'Relatório inexistente ou já publicado'); await audit(pool, adminId, 'board.publish', 'board_report', period, {}); return r.rows[0]; },
  async list() { return (await pool.query<Pick<Row<'board_reports'>, 'id' | 'period' | 'mrr_cents' | 'arr_cents' | 'ndr_pct' | 'grr_pct' | 'churn_pct' | 'burn_multiple' | 'cash_runway_months' | 'published_at'>>(`SELECT id, period, mrr_cents, arr_cents, ndr_pct, grr_pct, churn_pct, burn_multiple, cash_runway_months, published_at FROM board_reports ORDER BY period DESC`)).rows; },
  /** Dashboard executivo por região de residência: receita, custo de IA, MAU, novos, retenção D30 aproximada, incidentes (globais) e anomalias (z-score vs 28 dias). */
  async regional(asOf = new Date()) {
    const from = new Date(asOf.getTime() - 30 * D); const rows = (await pool.query<{ region: string; users: number; mau: number; new_users: number; revenue: number; ai_cost: number; cohort_prev: number; cohort_active: number }>(`SELECT u.data_residency_region AS region,
      (SELECT count(*)::int FROM users x WHERE x.data_residency_region=u.data_residency_region AND x.deleted_at IS NULL) AS users,
      (SELECT count(*)::int FROM users x WHERE x.data_residency_region=u.data_residency_region AND x.last_seen_at >= $1) AS mau,
      (SELECT count(*)::int FROM users x WHERE x.data_residency_region=u.data_residency_region AND x.created_at >= $1) AS new_users,
      COALESCE((SELECT sum(COALESCE(t.amount_brl_cents,t.amount_cents)) FROM transactions t JOIN users x ON x.id=t.user_id WHERE x.data_residency_region=u.data_residency_region AND t.type IN ('subscription','credit_purchase') AND t.amount_cents>0 AND t.created_at >= $1),0)::float AS revenue,
      COALESCE((SELECT sum(a.cost_cents) FROM ai_usage a JOIN users x ON x.id=a.user_id WHERE x.data_residency_region=u.data_residency_region AND a.created_at >= $1),0)::float AS ai_cost,
      (SELECT count(*)::int FROM users x WHERE x.data_residency_region=u.data_residency_region AND x.created_at BETWEEN $1 - interval '30 days' AND $1) AS cohort_prev,
      (SELECT count(*)::int FROM users x WHERE x.data_residency_region=u.data_residency_region AND x.created_at BETWEEN $1 - interval '30 days' AND $1 AND x.last_seen_at >= $1) AS cohort_active
      FROM users u GROUP BY 1 ORDER BY 1`, [from])).rows;
    const out = [];
    for (const r of rows) {
      const hist = (await pool.query<{ d: Date | null; n: number }>(`SELECT d::date, (SELECT count(*)::int FROM users x WHERE x.data_residency_region=$1 AND x.created_at >= d AND x.created_at < d + interval '1 day') n FROM generate_series(date_trunc('day',$2::timestamptz) - interval '28 days', date_trunc('day',$2::timestamptz) - interval '1 day', interval '1 day') d`, [r.region, asOf])).rows.map((x) => Number(x.n));
      const today = Number((await pool.query<{ n: number }>(`SELECT count(*)::int n FROM users WHERE data_residency_region=$1 AND created_at >= date_trunc('day',$2::timestamptz)`, [r.region, asOf])).rows[0].n); const an = zAnomaly(hist, today);
      out.push({ region: r.region, users: r.users, mau: r.mau, newUsers30d: r.new_users, revenueCents30d: r.revenue, aiCostCents30d: Math.round(r.ai_cost), marginProxyPct: r.revenue > 0 ? +(((r.revenue - r.ai_cost) / r.revenue) * 100).toFixed(1) : null, d30RetentionApprox: r.cohort_prev > 0 ? +(r.cohort_active / r.cohort_prev).toFixed(3) : null, nps: null, signupsToday: today, signupAnomaly: an });
    }
    const inc = (await pool.query<{ n: number }>(`SELECT count(*)::int n FROM incidents WHERE started_at >= $1`, [from])).rows[0].n; return { asOf: asOf.toISOString(), regions: out, incidents30d: inc, notes: ['NPS exige pesquisa in-app (não coletada ainda).', 'Incidentes não são segmentados por região no schema atual.'] };
  },
};
