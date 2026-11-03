import { pool } from '../../db/pool.js';

/** Contrato de features (MESMA ordem em `services/ml/features.json`; um teste de paridade garante). */
export const FEATURES = ['days_since_last_login', 'tenure_days', 'projects_7d', 'projects_30d', 'gen_success_rate_30d', 'publications_7d', 'publications_30d', 'platforms_connected', 'credits_remaining', 'plan_ordinal', 'marketplace_purchases_90d', 'affiliate_links_active', 'onboarding_completed', 'revenue_90d_brl'] as const;
export type FeatureName = (typeof FEATURES)[number];
export type FeatureRow = { userId: string } & Record<FeatureName, number>;
/** Features no instante atual (feature store simples = esta consulta; o treino usa a versão point-in-time em services/ml/features.py). */
export async function buildFeatures(userIds?: string[], limit = 5000, afterId?: string): Promise<FeatureRow[]> {
  const r = await pool.query<{ userId: string; days_since_last_login: number | null; tenure_days: number | null; projects_7d: number; projects_30d: number; gen_success_rate_30d: number; publications_7d: number; publications_30d: number; platforms_connected: number; credits_remaining: number; plan_ordinal: number | null; marketplace_purchases_90d: number; affiliate_links_active: number; onboarding_completed: number; revenue_90d_brl: number }>(`
    SELECT u.id AS "userId",
      EXTRACT(EPOCH FROM (now() - COALESCE(u.last_seen_at, u.created_at)))/86400 AS days_since_last_login,
      EXTRACT(EPOCH FROM (now() - u.created_at))/86400 AS tenure_days,
      COALESCE(p.p7,0) AS projects_7d, COALESCE(p.p30,0) AS projects_30d,
      COALESCE(p.ready30::float / NULLIF(p.done30,0), 1) AS gen_success_rate_30d,
      COALESCE(b.pub7,0) AS publications_7d, COALESCE(b.pub30,0) AS publications_30d,
      COALESCE(c.n,0) AS platforms_connected, u.credits AS credits_remaining,
      CASE u.plan WHEN 'free' THEN 0 WHEN 'pro' THEN 1 ELSE 2 END AS plan_ordinal,
      COALESCE(tp.n,0) AS marketplace_purchases_90d, COALESCE(al.n,0) AS affiliate_links_active,
      CASE WHEN u.onboarding_completed_at IS NOT NULL THEN 1 ELSE 0 END AS onboarding_completed,
      COALESCE(rv.brl,0) / 100.0 AS revenue_90d_brl
    FROM users u
    LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE created_at > now()-interval '7 days') p7, count(*) FILTER (WHERE created_at > now()-interval '30 days') p30, count(*) FILTER (WHERE created_at > now()-interval '30 days' AND status='ready') ready30, count(*) FILTER (WHERE created_at > now()-interval '30 days' AND status IN ('ready','failed')) done30 FROM projects WHERE user_id=u.id AND deleted_at IS NULL) p ON true
    LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE published_at > now()-interval '7 days') pub7, count(*) FILTER (WHERE published_at > now()-interval '30 days') pub30 FROM publications WHERE user_id=u.id AND status='published') b ON true
    LEFT JOIN LATERAL (SELECT count(*) n FROM connected_accounts WHERE user_id=u.id) c ON true
    LEFT JOIN LATERAL (SELECT count(*) n FROM template_purchases WHERE buyer_id=u.id AND created_at > now()-interval '90 days') tp ON true
    LEFT JOIN LATERAL (SELECT count(*) n FROM affiliate_links WHERE user_id=u.id AND status='active') al ON true
    LEFT JOIN LATERAL (SELECT sum(COALESCE(amount_brl_cents, amount_cents)) brl FROM transactions WHERE user_id=u.id AND type IN ('subscription','credit_purchase') AND created_at > now()-interval '90 days') rv ON true
    WHERE u.deleted_at IS NULL AND NOT u.banned AND ($1::uuid[] IS NULL OR u.id = ANY($1::uuid[])) AND ($3::uuid IS NULL OR u.id > $3::uuid) ORDER BY u.id LIMIT $2`, [userIds ?? null, limit, afterId ?? null]);
  return r.rows.map((x) => { const row = { userId: x.userId } as FeatureRow; for (const f of FEATURES) row[f] = Number(x[f]); return row; });
}
