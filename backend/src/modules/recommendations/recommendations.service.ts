import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { systemScope } from '../../db/context.js';
import { notFound } from '../../utils/errors.js';
import { isEnabled } from '../flags.service.js';
import { growthSettings } from '../growth/settings.js';
import { experimentsService } from '../experiments/experiments.service.js';
import { m } from '../../observability/metrics.js';
import { PROMPTS, PHOTO_IDEAS, PLATFORM_PRIOR, PUBLISH_PRIOR, DEFAULT_TZ, type Platform, type L3 } from './catalog.js';
import type { Row } from '../../db/rows.generated.js';

const locKey = (l?: string): keyof L3 => (l === 'en' ? 'en' : l === 'es' ? 'es' : 'pt-BR');
/** Itens que o usuário já tem/usou — alimenta o filtro "não recomendar o que já possui" e o perfil de conteúdo. */
const USER_ITEMS_SQL = `SELECT template_id FROM template_purchases WHERE buyer_id=$1 UNION SELECT template_id FROM projects WHERE user_id=$1 AND template_id IS NOT NULL AND deleted_at IS NULL UNION SELECT CASE WHEN item_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN item_id::uuid END FROM recommendation_events WHERE user_id=$1 AND item_type='template' AND action IN ('use','purchase')`;
export const norm = (xs: number[]) => { const mx = Math.max(...xs, 0); return xs.map((x) => (mx > 0 ? x / mx : 0)); };
/** MMR (relevância − redundância por categoria): λ=1 só relevância; λ=0 só diversidade. */
export function mmr<T extends { score: number; category: string }>(items: T[], k: number, lambda = 0.75): T[] {
  const pool_ = [...items].sort((a, b) => b.score - a.score); const out: T[] = []; const seen = new Map<string, number>();
  while (out.length < k && pool_.length) { let bi = 0, bv = -Infinity; pool_.forEach((it, i) => { const v = lambda * it.score - (1 - lambda) * (seen.get(it.category) ?? 0) * 0.35; if (v > bv) { bv = v; bi = i; } }); const [pick] = pool_.splice(bi, 1); out.push(pick!); seen.set(pick!.category, (seen.get(pick!.category) ?? 0) + 1); }
  return out;
}
export const eventsBody = z.object({ events: z.array(z.object({ surface: z.string().min(2).max(40), itemType: z.enum(['template', 'prompt', 'platform', 'publish_time', 'photo_idea']), itemId: z.string().min(1).max(80), action: z.enum(['impression', 'click', 'use', 'purchase']), variant: z.string().max(30).optional(), position: z.number().int().min(0).max(200).optional(), requestId: z.string().uuid().optional(), context: z.record(z.union([z.string().max(100), z.number(), z.boolean()])).default({}) })).min(1).max(100) });

export const recommendationsService = {
  async interactionCount(userId: string): Promise<number> {
    return (await pool.query(`SELECT ((SELECT count(*) FROM template_purchases WHERE buyer_id=$1) + (SELECT count(*) FROM projects WHERE user_id=$1 AND template_id IS NOT NULL AND deleted_at IS NULL) + (SELECT count(*) FROM recommendation_events WHERE user_id=$1 AND item_type='template' AND action IN ('click','use','purchase')))::int n`, [userId])).rows[0].n as number;
  },
  /** Templates: cold-start por regras (popularidade × nota bayesiana × recência) e, após N interações, híbrido (CF item-item + conteúdo + baseline) com diversificação MMR. */
  async templates(userId: string, o: { limit?: number; category?: string; surface?: string } = {}) {
    const limit = Math.min(Math.max(o.limit ?? 10, 1), 30); const gs = await growthSettings(); const n = await this.interactionCount(userId);
    const flagOn = await isEnabled('recs_personalized', { userId }); const a = await experimentsService.assign(userId, 'rec_personalized', { expose: true });
    const personalized = flagOn && n >= gs.recommendations.minInteractionsForPersonalized && (!a.inExperiment || a.variant === 'personalized');
    const base = (await pool.query(`SELECT t.id, t.name, t.category, t.tags, t.price_credits, t.usage_count, t.rating_avg, t.rating_count, t.created_at FROM templates t WHERE t.moderation_status='approved' AND t.deleted_at IS NULL AND t.creator_id<>$1
      AND NOT EXISTS (SELECT 1 FROM template_purchases p WHERE p.template_id=t.id AND p.buyer_id=$1) AND ($2::text IS NULL OR t.category=$2) LIMIT 500`, [userId, o.category ?? null])).rows;
    const maxUse = Math.max(...base.map((t) => t.usage_count), 1); const now = Date.now();
    const baseline = base.map((t) => { const bayes = (t.rating_avg * t.rating_count + 4 * 5) / (t.rating_count + 5); const ageDays = (now - new Date(t.created_at).getTime()) / 86_400_000; return 0.5 * (Math.log1p(t.usage_count) / Math.log1p(maxUse)) + 0.35 * (bayes / 5) + 0.15 * Math.exp(-ageDays / 60); });
    let scores = baseline.slice(); const why: string[][] = base.map(() => ['Popular entre criadores']);
    if (personalized && base.length) {
      const mine = (await pool.query(USER_ITEMS_SQL, [userId])).rows.map((r) => r.template_id as string | null).filter(Boolean) as string[];
      const cf = new Map<string, number>(); const titles = new Map<string, string>();
      if (mine.length) {
        const rows = (await systemScope('recs: coocorrência agregada entre usuários (devolve só templates aprovados)', () => pool.query(`WITH ui AS (SELECT buyer_id AS user_id, template_id FROM template_purchases UNION SELECT user_id, template_id FROM projects WHERE template_id IS NOT NULL AND deleted_at IS NULL UNION SELECT user_id, CASE WHEN item_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN item_id::uuid END FROM recommendation_events WHERE item_type='template' AND action IN ('use','purchase')),
          ui2 AS (SELECT * FROM ui WHERE template_id IS NOT NULL), cnt AS (SELECT template_id, count(*)::float n FROM ui2 GROUP BY 1), co AS (SELECT a.template_id i, b.template_id c, count(*)::float n FROM ui2 a JOIN ui2 b ON a.user_id=b.user_id AND a.template_id<>b.template_id WHERE a.template_id = ANY($1::uuid[]) GROUP BY 1,2)
          SELECT co.c AS template_id, co.i AS via, co.n / sqrt(ci.n * cc.n) AS sim, t.name AS via_name FROM co JOIN cnt ci ON ci.template_id=co.i JOIN cnt cc ON cc.template_id=co.c JOIN templates t ON t.id=co.i`, [mine]))).rows;
        for (const r of rows) { cf.set(r.template_id, (cf.get(r.template_id) ?? 0) + r.sim); if (!titles.has(r.template_id) || r.sim > 0.01) titles.set(r.template_id, r.via_name); }
      }
      const profile = (await pool.query(`SELECT category, count(*)::float w FROM (SELECT t.category FROM templates t WHERE t.id = ANY($2::uuid[]) UNION ALL SELECT p.category FROM projects p WHERE p.user_id=$1 AND p.category IS NOT NULL AND p.deleted_at IS NULL) x GROUP BY category`, [userId, mine])).rows; const totalW = profile.reduce((s, r) => s + r.w, 0) || 1; const catW = new Map(profile.map((r) => [r.category as string, r.w / totalW]));
      const cfN = norm(base.map((t) => cf.get(t.id) ?? 0)); const contN = norm(base.map((t) => catW.get(t.category) ?? 0)); const baseN = norm(baseline);
      scores = base.map((_, i) => 0.45 * cfN[i]! + 0.35 * contN[i]! + 0.2 * baseN[i]!);
      base.forEach((t, i) => { const r: string[] = []; if (cfN[i]! > 0.3) r.push(`Quem usou “${titles.get(t.id) ?? 'seus templates'}” também usou este`); if (contN[i]! > 0.3) r.push(`Combina com sua categoria “${t.category}”`); if (!r.length) r.push('Popular entre criadores'); why[i] = r; });
    }
    const ranked = mmr(base.map((t, i) => ({ id: t.id as string, name: t.name as string, category: t.category as string, priceCredits: t.price_credits as number, score: Math.round(scores[i]! * 1000) / 1000, reasons: why[i]! })), limit, personalized ? 0.75 : 0.9);
    const requestId = crypto.randomUUID(); m.recEvents.inc({ surface: o.surface ?? 'templates', action: 'request' });
    return { requestId, mode: personalized ? 'personalized' : 'cold_start', interactions: n, minInteractionsForPersonalized: gs.recommendations.minInteractionsForPersonalized, experiment: { key: 'rec_personalized', variant: a.variant, inExperiment: a.inExperiment }, items: ranked.map((x, position) => ({ ...x, position })) };
  },
  async prompts(userId: string, o: { category?: string; objective?: 'sell' | 'audience' | 'test_ai'; locale?: string; limit?: number }) {
    const u = (await pool.query<Pick<Row<'users'>, 'onboarding_goal' | 'locale'>>('SELECT onboarding_goal, locale FROM users WHERE id=$1', [userId])).rows[0]; if (!u) throw notFound('Usuário não encontrado');
    const cat = o.category ?? ((await pool.query(`SELECT category FROM projects WHERE user_id=$1 AND category IS NOT NULL AND deleted_at IS NULL GROUP BY category ORDER BY count(*) DESC LIMIT 1`, [userId])).rows.at(0)?.category as string | undefined) ?? 'geral';
    const obj = o.objective ?? ((u.onboarding_goal as 'sell' | 'audience' | 'test_ai' | null) ?? 'sell'); const loc = locKey(o.locale ?? u.locale);
    const used = new Set((await pool.query(`SELECT item_id FROM recommendation_events WHERE user_id=$1 AND item_type='prompt' AND action IN ('use','click')`, [userId])).rows.map((r) => r.item_id as string));
    const score = (p: (typeof PROMPTS)[number]) => (p.category === cat ? 2 : p.category === 'geral' ? 0.5 : 0) + (p.objective === obj ? 1.5 : p.objective === 'any' ? 0.5 : 0) - (used.has(p.id) ? 1 : 0);
    const items = PROMPTS.map((p) => ({ p, s: score(p) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, o.limit ?? 5).map(({ p, s }, position) => ({ id: p.id, category: p.category, objective: p.objective, text: p.text[loc], score: s, position }));
    return { requestId: crypto.randomUUID(), category: cat, objective: obj, locale: loc, items };
  },
  async photoIdeas(userId: string, o: { category?: string; locale?: string; limit?: number }) {
    const u = (await pool.query<Pick<Row<'users'>, 'locale'>>('SELECT locale FROM users WHERE id=$1', [userId])).rows[0]; if (!u) throw notFound('Usuário não encontrado'); const loc = locKey(o.locale ?? u.locale); const cat = o.category ?? 'geral';
    const used = new Set((await pool.query<Pick<Row<'recommendation_events'>, 'item_id'>>(`SELECT item_id FROM recommendation_events WHERE user_id=$1 AND item_type='photo_idea' AND action='use'`, [userId])).rows.map((r) => r.item_id as string));
    const avgPhotos = (await pool.query(`SELECT COALESCE(avg(cardinality(photo_refs)),0)::float a FROM projects WHERE user_id=$1 AND deleted_at IS NULL`, [userId])).rows[0].a as number;
    const score = (i: (typeof PHOTO_IDEAS)[number]) => (i.category === cat ? 2 : i.category === 'geral' || i.category === 'context' ? 1 : 0) + (used.has(i.id) ? -1.5 : 0.5) + (avgPhotos > 0 && avgPhotos < 3 && (i.tag === 'angle' || i.tag === 'detail') ? 0.5 : 0);
    const items = PHOTO_IDEAS.map((i) => ({ i, s: score(i) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, o.limit ?? 5).map(({ i, s }, position) => ({ id: i.id, tag: i.tag, category: i.category, text: i.text[loc], reused: used.has(i.id), score: s, position }));
    return { requestId: crypto.randomUUID(), category: cat, locale: loc, avgPhotosPerProject: Math.round(avgPhotos * 10) / 10, items };
  },
  /** Plataformas: prior por objetivo × taxa de sucesso histórica (usuário, ou global do nicho) × conta conectada. */
  async platforms(userId: string, o: { category?: string; goal?: 'sell' | 'audience' | 'test_ai' }) {
    const u = (await pool.query<Pick<Row<'users'>, 'onboarding_goal'>>('SELECT onboarding_goal FROM users WHERE id=$1', [userId])).rows[0]; if (!u) throw notFound('Usuário não encontrado'); const goal = o.goal ?? (u.onboarding_goal as 'sell' | 'audience' | 'test_ai' | null) ?? 'sell';
    const conn = new Set((await pool.query<Pick<Row<'connected_accounts'>, 'platform'>>('SELECT platform FROM connected_accounts WHERE user_id=$1', [userId])).rows.map((r) => r.platform as string));
    const stats = (await systemScope('recs: taxa de sucesso agregada por plataforma no nicho', () => pool.query(`SELECT p.platform, count(*)::int total, count(*) FILTER (WHERE p.status='published')::int ok, count(*) FILTER (WHERE p.user_id=$1)::int mine_total, count(*) FILTER (WHERE p.user_id=$1 AND p.status='published')::int mine_ok
      FROM publications p JOIN projects pr ON pr.id=p.project_id WHERE ($2::text IS NULL OR pr.category=$2) GROUP BY p.platform`, [userId, o.category ?? null]))).rows; const st = new Map(stats.map((r) => [r.platform as string, r]));
    const conv = new Map((await systemScope('recs: conversão agregada de afiliados por plataforma', () => pool.query(`SELECT l.platform, count(DISTINCT c.id)::float / GREATEST(sum(l.clicks),1) AS rate FROM affiliate_links l LEFT JOIN affiliate_conversions c ON c.link_id=l.id GROUP BY l.platform`))).rows.map((r) => [r.platform as string, Number(r.rate)]));
    const items = (Object.keys(PLATFORM_PRIOR[goal]) as Platform[]).map((pl) => {
      const s = st.get(pl); const succ = s ? (s.mine_total >= 3 ? s.mine_ok / s.mine_total : s.total >= 10 ? s.ok / s.total : 0.8) : 0.8; const basis = s ? (s.mine_total >= 3 ? 'seu histórico' : s.total >= 10 ? 'histórico do nicho' : 'a priori') : 'a priori';
      const score = PLATFORM_PRIOR[goal][pl] * (0.5 + 0.5 * succ) * (conn.has(pl) ? 1.15 : 1) * (1 + Math.min(conv.get(pl) ?? 0, 0.2)); return { platform: pl, score: Math.round(score * 1000) / 1000, connected: conn.has(pl), needsConnection: !conn.has(pl), successRate: Math.round(succ * 100) / 100, basis };
    }).sort((a, b) => b.score - a.score).map((x, position) => ({ ...x, position }));
    return { requestId: crypto.randomUUID(), goal, category: o.category ?? null, items };
  },
  /** Melhores horários: dados do próprio usuário (≥30 cliques) → coorte da região (≥100 cliques, ≥5 usuários) → prior por plataforma. Sempre no fuso do usuário. */
  async publishTime(userId: string, platform: Platform) {
    const u = (await pool.query<Pick<Row<'users'>, 'region' | 'timezone'>>('SELECT region, timezone FROM users WHERE id=$1', [userId])).rows[0]; if (!u) throw notFound('Usuário não encontrado'); const tz = (u.timezone as string | null) ?? DEFAULT_TZ[u.region] ?? 'UTC';
    const slotQ = (scope: 'user' | 'region') => systemScope('recs: cliques agregados por horário (próprios ou coorte ≥5 usuários)', () => pool.query(`SELECT extract(dow FROM c.created_at AT TIME ZONE $3)::int dow, extract(hour FROM c.created_at AT TIME ZONE $3)::int AS hour, count(*)::int n, count(DISTINCT l.user_id)::int users
      FROM affiliate_clicks c JOIN affiliate_links l ON l.id=c.link_id JOIN publications p ON p.id=l.publication_id JOIN users x ON x.id=l.user_id WHERE p.platform=$1 AND $2::uuid IS NOT NULL AND ${scope === 'user' ? 'l.user_id=$2' : 'x.region=$4'} GROUP BY 1,2`, scope === 'user' ? [platform, userId, tz] : [platform, userId, tz, u.region]));
    let basis: 'user' | 'cohort' | 'prior' = 'prior'; let slots: Array<{ dow: number; hour: number; score: number }> = [];
    const mine = (await slotQ('user')).rows; if (mine.reduce((s, r) => s + r.n, 0) >= 30) { basis = 'user'; slots = mine.map((r) => ({ dow: r.dow, hour: r.hour, score: r.n })); }
    else { const co = (await slotQ('region')).rows; if (co.reduce((s, r) => s + r.n, 0) >= 100) { const uniq = (await systemScope('recs: nº de usuários distintos da coorte (k-anonimato ≥5)', () => pool.query(`SELECT count(DISTINCT l.user_id)::int n FROM affiliate_clicks c JOIN affiliate_links l ON l.id=c.link_id JOIN publications p ON p.id=l.publication_id JOIN users x ON x.id=l.user_id WHERE p.platform=$1 AND x.region=$2`, [platform, u.region]))).rows[0].n as number; if (uniq >= 5) { basis = 'cohort'; slots = co.map((r) => ({ dow: r.dow, hour: r.hour, score: r.n })); } } }
    if (!slots.length) for (const g of PUBLISH_PRIOR[platform]) for (const d of g.dow) for (const h of g.hours) slots.push({ dow: d, hour: h, score: g.w });
    const mx = Math.max(...slots.map((s) => s.score)); const top = slots.sort((a, b) => b.score - a.score).slice(0, 3).map((s) => ({ dow: s.dow, hour: s.hour, score: Math.round((s.score / mx) * 100) / 100, nextAt: nextOccurrence(s.dow, s.hour, tz) }));
    return { requestId: crypto.randomUUID(), platform, timezone: tz, basis, slots: top };
  },
  async recordEvents(userId: string, events: z.infer<typeof eventsBody>['events']) {
    await pool.query(`INSERT INTO recommendation_events (user_id,surface,item_type,item_id,action,variant,position,request_id,context_json) SELECT $1, s, it, ii, a, v, pos, rid, c::jsonb FROM unnest($2::text[],$3::text[],$4::text[],$5::text[],$6::text[],$7::int[],$8::uuid[],$9::text[]) AS t(s,it,ii,a,v,pos,rid,c)`,
      [userId, events.map((e) => e.surface), events.map((e) => e.itemType), events.map((e) => e.itemId), events.map((e) => e.action), events.map((e) => e.variant ?? null), events.map((e) => e.position ?? null), events.map((e) => e.requestId ?? null), events.map((e) => JSON.stringify(e.context))]);
    for (const e of events) m.recEvents.inc({ surface: e.surface, action: e.action }); return { recorded: events.length };
  },
  /** Métricas do loop: CTR, conversão (uso/impressão), diversidade (categorias distintas por lista) e novidade (parcela fora do top-10% de popularidade), por superfície e variante. */
  async metrics(days = 30) {
    const rows = (await pool.query(`SELECT surface, COALESCE(variant,'none') variant, count(*) FILTER (WHERE action='impression')::int impressions, count(*) FILTER (WHERE action='click')::int clicks, count(*) FILTER (WHERE action='use')::int uses, count(*) FILTER (WHERE action='purchase')::int purchases
      FROM recommendation_events WHERE created_at > now() - make_interval(days => $1) GROUP BY 1,2 ORDER BY 1,2`, [days])).rows;
    const div = (await pool.query(`WITH req AS (SELECT r.surface, COALESCE(r.variant,'none') variant, r.request_id, count(DISTINCT t.category)::float cats, count(*)::float n FROM recommendation_events r JOIN templates t ON t.id::text=r.item_id WHERE r.item_type='template' AND r.action='impression' AND r.request_id IS NOT NULL AND r.created_at > now() - make_interval(days => $1) GROUP BY 1,2,3)
      SELECT surface, variant, avg(cats / n)::float diversity FROM req GROUP BY 1,2`, [days])).rows; const nov = (await pool.query(`WITH thr AS (SELECT COALESCE(percentile_cont(0.9) WITHIN GROUP (ORDER BY usage_count),0) p FROM templates WHERE moderation_status='approved')
      SELECT r.surface, COALESCE(r.variant,'none') variant, (count(*) FILTER (WHERE t.usage_count <= (SELECT p FROM thr)))::float / GREATEST(count(*),1) novelty FROM recommendation_events r JOIN templates t ON t.id::text=r.item_id WHERE r.item_type='template' AND r.action='impression' AND r.created_at > now() - make_interval(days => $1) GROUP BY 1,2`, [days])).rows;
    const key = (r: { surface: string; variant: string }) => `${r.surface}|${r.variant}`; const dm = new Map(div.map((r) => [key(r), r.diversity as number])); const nm = new Map(nov.map((r) => [key(r), r.novelty as number]));
    return { days, items: rows.map((r) => ({ ...r, ctr: r.impressions ? r.clicks / r.impressions : null, useRate: r.impressions ? r.uses / r.impressions : null, purchaseRate: r.impressions ? r.purchases / r.impressions : null, diversity: dm.get(key(r)) ?? null, novelty: nm.get(key(r)) ?? null })) };
  },
};
/** Próxima ocorrência (ISO UTC) de `dow`/`hour` no fuso `tz`. */
export function nextOccurrence(dow: number, hour: number, tz: string, from = new Date()): string {
  for (let add = 0; add < 8 * 24; add++) { const t = new Date(from.getTime() + add * 3_600_000); const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hourCycle: 'h23', weekday: 'short' }).formatToParts(t); const h = Number(parts.find((p) => p.type === 'hour')!.value); const d = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')!.value);
    if (d === dow && h === hour && t.getTime() > from.getTime()) { t.setUTCMinutes(0, 0, 0); return t.toISOString(); } } return from.toISOString();
}
