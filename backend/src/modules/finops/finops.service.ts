import { pool } from '../../db/pool.js';
import { AppError } from '../../utils/errors.js';
import { simulate, DEFAULT_PROFILES, type UnitCosts } from './pricing-sim.js';
import { costGuard, sceneCache } from '../cost-optimization/index.js';
import type { Row } from '../../db/rows.generated.js';

export const REQUIRED_TAGS = ['env', 'service', 'region', 'team', 'cost-center'] as const;
const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const opsCfg = async (): Promise<Record<string, any>> => (await pool.query<Pick<Row<'settings'>, 'value'>>(`SELECT value FROM settings WHERE key='ops'`)).rows.at(0)?.value ?? {};
export interface Range { from: Date; to: Date }
export const monthRange = (month?: string): Range => { const d = month ? new Date(`${month}-01T00:00:00Z`) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)); return { from: d, to: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)) }; };

export const finopsService = {
  /** Custo unitário a partir de ai_usage + projetos/publicações/dublagens. Infra só entra se houver cost_snapshots importados (tags obrigatórias). */
  async unitEconomics(r: Range) {
    const q = async (sql: string, p: unknown[] = []) => (await pool.query(sql, [r.from, r.to, ...p])).rows;
    const [vid] = await q(`WITH c AS (SELECT project_id, SUM(cost_cents) cost FROM ai_usage WHERE project_id IS NOT NULL AND created_at >= $1 AND created_at < $2 GROUP BY 1)
      SELECT count(*)::int videos, COALESCE(sum(c.cost),0)::float cost FROM projects p JOIN c ON c.project_id=p.id WHERE p.status='ready'`);
    const byPlan = await q(`WITH c AS (SELECT project_id, SUM(cost_cents) cost FROM ai_usage WHERE project_id IS NOT NULL AND created_at >= $1 AND created_at < $2 GROUP BY 1)
      SELECT u.plan::text plan, count(*)::int videos, COALESCE(sum(c.cost),0)::float cost FROM projects p JOIN users u ON u.id=p.user_id JOIN c ON c.project_id=p.id WHERE p.status='ready' GROUP BY 1 ORDER BY 1`);
    const byProvider = await q(`SELECT provider, operation, count(*)::int calls, COALESCE(sum(cost_cents),0)::float cost, COALESCE(avg(latency_ms),0)::int avg_ms FROM ai_usage WHERE created_at >= $1 AND created_at < $2 GROUP BY 1,2 ORDER BY cost DESC`);
    const byDuration = await q(`WITH c AS (SELECT project_id, SUM(cost_cents) cost FROM ai_usage WHERE project_id IS NOT NULL AND created_at >= $1 AND created_at < $2 GROUP BY 1)
      SELECT CASE WHEN COALESCE(p.duration_sec,0) <= 15 THEN '<=15s' WHEN p.duration_sec <= 30 THEN '16-30s' ELSE '31-60s' END bucket, count(*)::int videos, COALESCE(sum(c.cost),0)::float cost FROM projects p JOIN c ON c.project_id=p.id WHERE p.status='ready' GROUP BY 1 ORDER BY 1`);
    const [dub] = await q(`SELECT count(*)::int calls, COALESCE(sum(cost_cents),0)::float cost FROM ai_usage WHERE operation='tts' AND created_at >= $1 AND created_at < $2`);
    const dubLocale = await q(`SELECT locale, count(*)::int versions FROM localized_versions WHERE status='done' AND created_at >= $1 AND created_at < $2 GROUP BY 1 ORDER BY 2 DESC`);
    const [pub] = await q(`SELECT count(*) FILTER (WHERE status='published')::int published, COALESCE(sum(retry_count),0)::int retries FROM publications WHERE created_at >= $1 AND created_at < $2`);
    const [usr] = await q(`SELECT count(DISTINCT user_id)::int ai_users, (SELECT count(*)::int FROM users WHERE last_seen_at >= $1 AND last_seen_at < $2) mau FROM ai_usage WHERE user_id IS NOT NULL AND created_at >= $1 AND created_at < $2`);
    const [proj] = await q(`SELECT count(DISTINCT project_id)::int projects, COALESCE(sum(cost_cents),0)::float cost FROM ai_usage WHERE project_id IS NOT NULL AND created_at >= $1 AND created_at < $2`);
    const infra = await q(`SELECT service, region, COALESCE(sum(cost_cents),0)::float cost FROM cost_snapshots WHERE date >= $1::date AND date < $2::date AND service NOT LIKE 'ai-%' GROUP BY 1,2`);
    const mauByRegion = await q(`SELECT data_residency_region region, count(*)::int mau FROM users WHERE last_seen_at >= $1 AND last_seen_at < $2 GROUP BY 1`);
    const infraTotal = infra.reduce((a, x) => a + x.cost, 0); const pubInfra = infra.filter((x) => /publi|worker/.test(x.service)).reduce((a, x) => a + x.cost, 0);
    const aiTotal = n((await q(`SELECT COALESCE(sum(cost_cents),0)::float s FROM ai_usage WHERE created_at >= $1 AND created_at < $2`))[0].s);
    const per = (a: number, b: number) => (b > 0 ? +(a / b).toFixed(2) : null);
    return {
      period: { from: r.from.toISOString().slice(0, 10), to: r.to.toISOString().slice(0, 10) }, aiCostTotalCents: aiTotal, infraCostTotalCents: infraTotal, infraCostAvailable: infra.length > 0,
      costPerVideoCents: per(vid.cost, vid.videos), videos: vid.videos, costPerVideoByPlan: byPlan.map((x) => ({ plan: x.plan, videos: x.videos, costPerVideoCents: per(x.cost, x.videos) })), costPerVideoByDuration: byDuration.map((x) => ({ bucket: x.bucket, videos: x.videos, costPerVideoCents: per(x.cost, x.videos) })),
      costByProvider: byProvider.map((x) => ({ provider: x.provider, operation: x.operation, calls: x.calls, costCents: +x.cost.toFixed(2), avgLatencyMs: x.avg_ms })),
      costPerDubbingCents: per(dub.cost, dub.calls), dubbingVersionsByLocale: dubLocale, dubbingNote: 'ai_usage não guarda o idioma: custo por idioma = custo médio por síntese; contagem por idioma vem de localized_versions.',
      costPerPublicationCents: pub.published > 0 && infra.length ? per(pubInfra, pub.published) : null, publicationRetries: pub.retries, publicationNote: infra.length ? undefined : 'Publicação não consome IA; custo depende de cost_snapshots de infraestrutura (importar via /admin/finops/cost-import).',
      aiCostPerUserMonthCents: per(aiTotal, usr.ai_users), aiCostPerProjectCents: per(proj.cost, proj.projects), infraCostPer1kMauCents: infra.length ? per(infraTotal, usr.mau / 1000) : null, infraCostPer1kMauByRegion: mauByRegion.map((m) => { const c = infra.filter((i) => i.region === m.region).reduce((a, x) => a + x.cost, 0); return { region: m.region, mau: m.mau, costPer1kMauCents: c > 0 ? per(c, m.mau / 1000) : null }; }),
    };
  },
  /** Margem bruta por segmento. Receita real (transactions) − custo de IA − taxa de pagamento (premissa em settings.ops.paymentFeePct) − infra alocada pelo peso de custo de IA. */
  async grossMargin(r: Range) {
    const cfg = await opsCfg(); const feePct = Number(cfg.paymentFeePct ?? 3.99); const creditCents = Number(cfg.creditValueCents ?? 5);
    const rev = (await pool.query<{ plan: string; revenue: number }>(`SELECT u.plan::text plan, COALESCE(sum(COALESCE(t.amount_brl_cents, t.amount_cents)),0)::float revenue FROM transactions t JOIN users u ON u.id=t.user_id WHERE t.type IN ('subscription','credit_purchase') AND t.amount_cents > 0 AND t.created_at >= $1 AND t.created_at < $2 GROUP BY 1`, [r.from, r.to])).rows;
    const ai = (await pool.query<{ plan: string; cost: number }>(`SELECT u.plan::text plan, COALESCE(sum(a.cost_cents),0)::float cost FROM ai_usage a JOIN users u ON u.id=a.user_id WHERE a.created_at >= $1 AND a.created_at < $2 GROUP BY 1`, [r.from, r.to])).rows;
    const mk = (await pool.query<{ fee: number }>(`SELECT COALESCE(sum(fee_credits),0)::float fee FROM template_purchases WHERE created_at >= $1 AND created_at < $2`, [r.from, r.to])).rows[0]; const infra = n((await pool.query<{ s: number }>(`SELECT COALESCE(sum(cost_cents),0)::float s FROM cost_snapshots WHERE date >= $1::date AND date < $2::date AND service NOT LIKE 'ai-%'`, [r.from, r.to])).rows[0].s);
    const aiTotal = ai.reduce((a, x) => a + x.cost, 0);
    const seg = (plan: string) => { const revenue = n(rev.find((x) => x.plan === plan)?.revenue); const aiC = n(ai.find((x) => x.plan === plan)?.cost); const fees = (revenue * feePct) / 100; const infraAlloc = aiTotal > 0 ? (infra * aiC) / aiTotal : 0; const cogs = aiC + fees + infraAlloc; return { segment: plan, revenueCents: Math.round(revenue), aiCostCents: Math.round(aiC), paymentFeesCents: Math.round(fees), infraAllocatedCents: Math.round(infraAlloc), cogsCents: Math.round(cogs), grossMarginPct: revenue > 0 ? +(((revenue - cogs) / revenue) * 100).toFixed(1) : null, subsidyCents: revenue === 0 ? Math.round(cogs) : 0 }; };
    const marketRev = mk.fee * creditCents; const marketplace = { segment: 'marketplace', revenueCents: Math.round(marketRev), aiCostCents: 0, paymentFeesCents: 0, infraAllocatedCents: 0, cogsCents: 0, grossMarginPct: marketRev > 0 ? 100 : null, subsidyCents: 0, note: `Comissão em créditos × ${creditCents}¢/crédito (settings.ops.creditValueCents); custo marginal ≈ 0.` };
    return { period: { from: r.from.toISOString().slice(0, 10), to: r.to.toISOString().slice(0, 10) }, assumptions: { paymentFeePct: feePct, infraAllocation: 'proporcional ao custo de IA', infraCostAvailable: infra > 0 }, segments: [seg('free'), seg('pro'), seg('business'), marketplace] };
  },
  async topProjects(r: Range, limit = 10) {
    return (await pool.query<{ id: string; title: string; status: string; plan: string; duration_sec: number | null; calls: number; cost_cents: number }>(`SELECT p.id, p.title, p.status, u.plan::text plan, p.duration_sec, count(a.*)::int calls, COALESCE(sum(a.cost_cents),0)::float cost_cents FROM ai_usage a JOIN projects p ON p.id=a.project_id JOIN users u ON u.id=p.user_id WHERE a.created_at >= $1 AND a.created_at < $2 GROUP BY p.id, u.plan ORDER BY cost_cents DESC LIMIT $3`, [r.from, r.to, limit])).rows.map((x) => ({ projectId: x.id, title: x.title, status: x.status, plan: x.plan, durationSec: x.duration_sec, aiCalls: x.calls, costCents: +x.cost_cents.toFixed(2) }));
  },
  /** Importa linhas do Cost Explorer/OpenCost. Recurso sem as 5 tags obrigatórias é REJEITADO e contabilizado (enforcement de tagging). */
  async importCosts(rows: Array<{ date: string; service: string; provider?: string; costCents: number; tags?: Record<string, string> }>) {
    let ok = 0; const rejected: Array<{ service: string; missing: string[] }> = [];
    for (const x of rows) {
      const missing = REQUIRED_TAGS.filter((t) => !x.tags?.[t]); if (missing.length) { rejected.push({ service: x.service, missing }); continue; }
      await pool.query(`INSERT INTO cost_snapshots (date, service, region, provider, cost_cents, metadata) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (date, service, region, provider) DO UPDATE SET cost_cents=EXCLUDED.cost_cents, metadata=EXCLUDED.metadata`, [x.date, x.service, x.tags!.region, x.provider ?? 'aws', Math.round(x.costCents), JSON.stringify({ tags: x.tags })]); ok++;
    }
    return { imported: ok, rejected, tagCompliancePct: rows.length ? +((ok / rows.length) * 100).toFixed(1) : 100 };
  },
  /** Snapshot diário: custo de IA por provedor/operação em cost_snapshots + métricas de custo unitário em unit_economics. */
  async snapshot(day: Date = new Date(Date.now() - 86400_000)) {
    const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate())); const next = new Date(d.getTime() + 86400_000); const ds = d.toISOString().slice(0, 10);
    const rows = (await pool.query<{ provider: string; operation: string; c: number }>(`SELECT provider, operation, COALESCE(sum(cost_cents),0)::float c FROM ai_usage WHERE created_at >= $1 AND created_at < $2 GROUP BY 1,2`, [d, next])).rows;
    for (const x of rows) await pool.query(`INSERT INTO cost_snapshots (date, service, region, provider, cost_cents, metadata) VALUES ($1,$2,'global',$3,$4,'{"source":"ai_usage"}') ON CONFLICT (date, service, region, provider) DO UPDATE SET cost_cents=EXCLUDED.cost_cents`, [ds, `ai-${x.operation}`, x.provider, Math.round(x.c)]);
    const ue = await this.unitEconomics({ from: d, to: next }); const put = (metric: string, value: number | null, plan = 'all') => value === null ? Promise.resolve() : pool.query(`INSERT INTO unit_economics (date, metric, value, plan) VALUES ($1,$2,$3,$4) ON CONFLICT (date, metric, region, plan, cohort) DO UPDATE SET value=EXCLUDED.value`, [ds, metric, value, plan]);
    await put('cost_per_video_cents', ue.costPerVideoCents); await put('ai_cost_total_cents', ue.aiCostTotalCents); await put('ai_cost_per_user_cents', ue.aiCostPerUserMonthCents); await put('cost_per_dubbing_cents', ue.costPerDubbingCents);
    for (const p of ue.costPerVideoByPlan) await put('cost_per_video_cents', p.costPerVideoCents, p.plan); return { date: ds, snapshots: rows.length };
  },
  /** Custos unitários medidos (ou premissas quando não há dados) para o simulador. */
  async measuredUnitCosts(): Promise<UnitCosts & { source: 'measured' | 'assumed' }> {
    const r = (await pool.query<{ c: number; s: number }>(`SELECT COALESCE(sum(a.cost_cents),0)::float c, COALESCE(sum(p.duration_sec),0)::float s FROM (SELECT project_id, sum(cost_cents) cost_cents FROM ai_usage WHERE operation='generate_scene' AND provider <> 'mock' AND created_at > now() - interval '30 days' GROUP BY 1) a JOIN projects p ON p.id=a.project_id WHERE p.duration_sec > 0`)).rows[0];
    const tts = (await pool.query<{ c: number }>(`SELECT COALESCE(avg(cost_cents),0)::float c FROM ai_usage WHERE operation='tts' AND provider <> 'mock' AND created_at > now() - interval '30 days'`)).rows[0];
    const measured = r.s > 0 && r.c > 0; return { aiCentsPerVideoSecond: measured ? r.c / r.s : 2.8, ttsCentsPerLanguage: tts.c > 0 ? tts.c : 9, infraCentsPerPublication: 2, infraCentsPerUserMonth: 15, source: measured ? 'measured' : 'assumed' };
  },
  async simulate(b: { priceCents: number; taxPct?: number; paymentFeePct?: number; profile?: string | Partial<typeof DEFAULT_PROFILES.pro>; optimizations?: { cacheHitRate?: number; routingSavingsPct?: number; distillShare?: number; distillSavingsPct?: number } }) {
    const base = typeof b.profile === 'string' ? DEFAULT_PROFILES[b.profile] : { ...DEFAULT_PROFILES.pro!, ...(b.profile ?? {}) }; if (!base) throw new AppError(422, 'unknown_profile', 'Perfil desconhecido (free|pro|business ou objeto)');
    const costs = await this.measuredUnitCosts(); const a = { priceCents: b.priceCents, taxPct: b.taxPct ?? 0, paymentFeePct: b.paymentFeePct ?? 3.99, paymentFixedCents: 39 };
    const before = simulate(base, costs, a); const after = b.optimizations ? simulate(base, costs, { ...a, ...b.optimizations }) : null;
    return { unitCostsSource: costs.source, unitCosts: costs, before, after, projectedImpact: after ? { marginPointsGained: before.grossMarginPct !== null && after.grossMarginPct !== null ? +(after.grossMarginPct - before.grossMarginPct).toFixed(1) : null, monthlySavingsCentsPerUser: before.cogsCents - after.cogsCents } : null };
  },
  /** Top oportunidades de otimização priorizadas por economia estimada (sobre custo medido; sem dados => estimativa qualitativa marcada). */
  async opportunities(r: Range) {
    const ue = await this.unitEconomics(r); const ai = ue.aiCostTotalCents; const cache = await sceneCache.stats(); const g = await this.grossMargin(r);
    const retry = (await pool.query<{ retried: number; total: number }>(`SELECT count(*) FILTER (WHERE retried)::int retried, count(*)::int total FROM scenes s JOIN projects p ON p.id=s.project_id WHERE p.created_at >= $1 AND p.created_at < $2`, [r.from, r.to])).rows[0];
    const free = g.segments.find((s) => s.segment === 'free')!; const kling = ue.costByProvider.filter((x) => x.provider === 'kling').reduce((a, x) => a + x.costCents, 0); const longVideos = ue.costPerVideoByDuration.find((d) => d.bucket === '31-60s');
    const retryRate = retry.total ? retry.retried / retry.total : 0; const data = ai > 0;
    const est = (pct: number) => (data ? Math.round(ai * pct) : null);
    const list = [
      { id: 'scene-cache', title: 'Cache de cenas (hash de prompt+referências+frame anterior)', estSavingsCents: est(0.08), basis: `Retries/regenerações repetem inputs idênticos; taxa de retry medida ${(retryRate * 100).toFixed(1)}%. Cache hoje: ${cache.hits} hits, ${cache.savedCents.toFixed(0)}¢ economizados.`, effort: 'baixo', status: 'implementado (flag ai_scene_cache)' },
      { id: 'cost-router', title: 'Roteamento por custo/qualidade (provedor mais barato que cumpre SLA)', estSavingsCents: est(0.12), basis: `Kling = ${kling.toFixed(0)}¢ no período; depende de 2º provedor integrado.`, effort: 'médio', status: 'implementado (flag ai_cost_router); provedores candidatos não integrados' },
      { id: 'distill-simple', title: 'Modelo menor para cenas simples (transição/close-up)', estSavingsCents: est(0.06), basis: 'Classificador de complexidade pronto; economia estimada = 30% das cenas × 50% de custo.', effort: 'médio', status: 'classificador implementado; modelo lite não integrado' },
      { id: 'free-limit', title: 'Reduzir subsídio do plano Free (limite de cenas/resolução)', estSavingsCents: data ? Math.round(free.subsidyCents * 0.3) : null, basis: `Subsídio Free no período: ${free.subsidyCents}¢.`, effort: 'baixo', status: 'proposta (testar via experimento de watermark/limite)' },
      { id: 'long-videos', title: 'Preço/limite por duração (vídeos de 31-60 s)', estSavingsCents: longVideos && data ? Math.round(longVideos.videos * (longVideos.costPerVideoCents ?? 0) * 0.15) : null, basis: 'Custo cresce linearmente com a duração; cobrar créditos proporcionais.', effort: 'baixo', status: 'proposta' },
      { id: 'tts-provider', title: 'Segundo TTS mais barato para idiomas comuns', estSavingsCents: ue.costPerDubbingCents && data ? Math.round(ue.costPerDubbingCents * 0.3 * (ue.costByProvider.find((x) => x.operation === 'tts')?.calls ?? 0)) : null, basis: 'TTS de menor custo cobre PT/EN/ES com qualidade aceitável.', effort: 'médio', status: 'proposta' },
      { id: 'spot-workers', title: 'Workers batch em spot com checkpoint', estSavingsCents: null, basis: 'Requer custo de compute importado (cost-import). Tipicamente 50–70% sobre on-demand.', effort: 'médio', status: 'requer dados de infra' },
      { id: 'savings-plan', title: 'Savings plan/RI para Postgres, Redis e base de workers', estSavingsCents: null, basis: 'Carga previsível; 1 ano sem entrada costuma render 20–30%.', effort: 'baixo', status: 'requer 3 meses de histórico' },
      { id: 'cdn-cache', title: 'Aumentar TTL/otimizar thumbnails e egress (WebP/AVIF)', estSavingsCents: null, basis: 'Egress costuma ser o 2º maior custo em apps de vídeo.', effort: 'baixo', status: 'requer dados de CDN' },
      { id: 'rightsizing', title: 'Rightsizing mensal (Postgres/Redis/pods)', estSavingsCents: null, basis: 'Revisar p95 de CPU/memória vs. requests (OpenCost).', effort: 'baixo', status: 'processo mensal (docs/FINOPS/MONTHLY_REVIEW.md)' },
    ];
    return { period: ue.period, dataAvailable: data, note: data ? 'Economias estimadas sobre o custo de IA medido no período.' : 'Sem custo de IA no período: economias numéricas indisponíveis (dependem de histórico).', opportunities: list.sort((a, b) => (b.estSavingsCents ?? -1) - (a.estSavingsCents ?? -1)) };
  },
  async guard() { return costGuard.evaluate(); },
};
