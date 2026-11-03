import { pool, asSystem } from '../../db/pool.js';
import { notFound } from '../../utils/errors.js';
import { audit } from '../../repositories/audit.js';
import { buildFeatures } from './features.js';
import { scoreMany, scoreOne, mlHealth, FALLBACK_VERSION } from './churn.client.js';

export function rfmSegment(r: number, f: number, m: number, tenureDays: number, neverActive: boolean): string {
  if (neverActive) return 'inactive'; if (r >= 4 && f >= 4 && m >= 4) return 'champions'; if (tenureDays <= 14) return 'new'; if (r <= 2 && f >= 4 && m >= 4) return 'cant_lose'; if (r <= 2 && f >= 3) return 'at_risk';
  if (r >= 3 && f >= 4) return 'loyal'; if (r >= 4 && f >= 2) return 'potential_loyalist'; if (r <= 2 && f <= 2) return 'hibernating'; return 'needs_attention';
}
export const retentionService = {
  /** Job diário: features → modelo (ou fallback) → churn_scores / ltv_predictions / propensity_scores / users.churn_risk. Paginação por id. */
  async refreshScores(o: { userIds?: string[]; pageSize?: number } = {}): Promise<{ scored: number; model: number; fallback: number; ms: number }> {
    const t0 = Date.now(); let scored = 0, model = 0, fallback = 0; let after: string | undefined;
    for (;;) {
      const rows = await buildFeatures(o.userIds, o.pageSize ?? 1000, after); if (!rows.length) break; after = rows[rows.length - 1]!.userId; const res = await scoreMany(rows);
      await asSystem(async (db) => {
        await db.query(`INSERT INTO churn_scores (user_id,score,top_features_json,model_version,source,updated_at) SELECT u,s,t::jsonb,v,src,now() FROM unnest($1::uuid[],$2::real[],$3::text[],$4::text[],$5::text[]) AS x(u,s,t,v,src) ON CONFLICT (user_id) DO UPDATE SET score=EXCLUDED.score, top_features_json=EXCLUDED.top_features_json, model_version=EXCLUDED.model_version, source=EXCLUDED.source, updated_at=now()`,
          [res.map((x) => x.churn.userId), res.map((x) => x.churn.score), res.map((x) => JSON.stringify(x.churn.top)), res.map((x) => x.churn.version), res.map((x) => x.churn.source)]);
        await db.query(`INSERT INTO ltv_predictions (user_id,predicted_ltv_cents,model_version,updated_at) SELECT u,l,v,now() FROM unnest($1::uuid[],$2::bigint[],$3::text[]) AS x(u,l,v) ON CONFLICT (user_id) DO UPDATE SET predicted_ltv_cents=EXCLUDED.predicted_ltv_cents, model_version=EXCLUDED.model_version, updated_at=now()`, [res.map((x) => x.churn.userId), res.map((x) => x.ltvCents), res.map((x) => x.ltvVersion)]);
        for (const tgt of ['upgrade', 'credits'] as const) await db.query(`INSERT INTO propensity_scores (user_id,target,score,model_version,updated_at) SELECT u,$4,s,v,now() FROM unnest($1::uuid[],$2::real[],$3::text[]) AS x(u,s,v) ON CONFLICT (user_id,target) DO UPDATE SET score=EXCLUDED.score, model_version=EXCLUDED.model_version, updated_at=now()`, [res.map((x) => x.churn.userId), res.map((x) => x.propensity[tgt]), res.map((x) => x.propVersion), tgt]);
        await db.query(`UPDATE users u SET churn_risk=x.s, ltv_predicted_cents=x.l FROM unnest($1::uuid[],$2::real[],$3::bigint[]) AS x(id,s,l) WHERE u.id=x.id`, [res.map((x) => x.churn.userId), res.map((x) => x.churn.score), res.map((x) => x.ltvCents)]);
      });
      scored += res.length; for (const x of res) { if (x.churn.source === 'model') model++; else fallback++; } if (o.userIds || rows.length < (o.pageSize ?? 1000)) break;
    }
    return { scored, model, fallback, ms: Date.now() - t0 };
  },
  /** Pontuação sob demanda (ex.: oferta contextual): usa o score diário em cache e só calcula online (≤ ML_TIMEOUT_MS, com fallback) se não houver ou estiver velho (> 3 dias). */
  async churnFor(userId: string): Promise<{ score: number; source: string; ageHours: number | null }> {
    const r = (await pool.query(`SELECT score, source, EXTRACT(EPOCH FROM (now()-updated_at))/3600 AS age FROM churn_scores WHERE user_id=$1`, [userId])).rows[0]; if (r && r.age < 72) return { score: r.score, source: r.source, ageHours: Math.round(r.age) };
    const f = (await buildFeatures([userId]))[0]; if (!f) throw notFound('Usuário não encontrado'); const s = await scoreOne(f); return { score: s.churn.score, source: s.churn.source, ageHours: null };
  },
  async distribution() {
    const rows = (await pool.query(`SELECT width_bucket(score, 0, 1.0000001, 10) AS b, count(*)::int n, avg(score)::float avg FROM churn_scores GROUP BY 1 ORDER BY 1`)).rows; const srcs = (await pool.query(`SELECT source, model_version AS "modelVersion", count(*)::int n, max(updated_at) AS "lastUpdated" FROM churn_scores GROUP BY 1,2`)).rows;
    return { buckets: rows.map((r) => ({ from: (r.b - 1) / 10, to: r.b / 10, count: r.n })), sources: srcs, highRisk: (await pool.query(`SELECT count(*)::int n FROM churn_scores WHERE score >= 0.6`)).rows[0].n, ml: await mlHealth(), fallbackVersion: FALLBACK_VERSION };
  },
  /** RFM semanal: R/F/M em quintis (empates recebem o mesmo quintil; zeros ficam no nível 1) → users.rfm_segment. */
  async refreshRfm(): Promise<{ users: number; segments: Record<string, number> }> {
    const rows = (await pool.query(`WITH b AS (SELECT u.id, EXTRACT(EPOCH FROM (now() - u.created_at))/86400 AS tenure, EXTRACT(EPOCH FROM (now() - COALESCE((SELECT max(created_at) FROM projects p WHERE p.user_id=u.id AND p.deleted_at IS NULL), u.created_at)))/86400 AS rec_days,
        (SELECT count(*) FROM projects p WHERE p.user_id=u.id AND p.deleted_at IS NULL AND p.created_at > now() - interval '90 days')::float AS freq, (SELECT COALESCE(sum(COALESCE(amount_brl_cents, amount_cents)),0) FROM transactions t WHERE t.user_id=u.id AND t.type IN ('subscription','credit_purchase'))::float AS mon,
        NOT EXISTS (SELECT 1 FROM projects p WHERE p.user_id=u.id) AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.user_id=u.id AND t.type IN ('subscription','credit_purchase')) AS never FROM users u WHERE u.deleted_at IS NULL AND NOT u.banned)
      SELECT id, tenure, never, CEIL(5 * cume_dist() OVER (ORDER BY rec_days DESC))::int AS r, CASE WHEN freq = 0 THEN 1 ELSE 1 + CEIL(4 * cume_dist() OVER (PARTITION BY (freq > 0) ORDER BY freq))::int END AS f, CASE WHEN mon = 0 THEN 1 ELSE 1 + CEIL(4 * cume_dist() OVER (PARTITION BY (mon > 0) ORDER BY mon))::int END AS m FROM b`)).rows;
    const segs: Record<string, number> = {}; const ids: string[] = []; const vals: string[] = []; for (const x of rows) { const s = rfmSegment(Math.min(5, x.r), Math.min(5, x.f), Math.min(5, x.m), x.tenure, x.never); ids.push(x.id); vals.push(s); segs[s] = (segs[s] ?? 0) + 1; }
    if (ids.length) await asSystem((db) => db.query(`UPDATE users u SET rfm_segment=x.s FROM unnest($1::uuid[],$2::text[]) AS x(id,s) WHERE u.id=x.id`, [ids, vals])); return { users: rows.length, segments: segs };
  },
  async segments() { return { items: (await pool.query(`SELECT COALESCE(rfm_segment,'unscored') AS segment, count(*)::int n FROM users WHERE deleted_at IS NULL GROUP BY 1 ORDER BY n DESC`)).rows }; },
  async audit(actor: string, action: string, meta: Record<string, unknown>) { await asSystem((db) => audit(db, actor, action, 'retention', 'batch', meta)); },
};
