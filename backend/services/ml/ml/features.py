"""Contrato de features + geração de dados SINTÉTICOS (apenas para validar o pipeline) + extração point-in-time do banco.

IMPORTANTE: modelos treinados com dados sintéticos NÃO são modelos de produção. `train.py --source synthetic` marca o
model_card com `data_source: synthetic` e o servidor expõe isso em /model; o backend só confia no modelo se o serviço
estiver configurado e responder dentro do timeout (fallback heurístico caso contrário). Treine com `--source db` quando
houver histórico real (≥ 90 dias e algumas centenas de usuários com desfecho observado).
"""
from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
FEATURES: list[str] = json.loads((ROOT / "features.json").read_text())["features"]
CHURN_HORIZON_DAYS = 30   # churn = nenhuma atividade (projeto/publicação/login) nos próximos 30 dias
LTV_HORIZON_DAYS = 365


def synthetic(n: int = 20_000, seed: int = 7) -> pd.DataFrame:
    """População sintética com relações plausíveis e ruído. Desfechos: churn_30d, ltv_brl (365d), upgrade_30d, credits_30d."""
    r = np.random.default_rng(seed)
    tenure = r.gamma(2.0, 40, n).clip(1, 720)
    engaged = r.beta(2, 3, n)                                   # latente: engajamento
    days_since = (r.exponential(1, n) * (1.2 - engaged) * 25).clip(0, 120)
    p30 = r.poisson(engaged * 6).astype(float); p7 = np.minimum(p30, r.poisson(engaged * 1.8)).astype(float)
    pub30 = np.minimum(p30, r.poisson(engaged * 3)).astype(float); pub7 = np.minimum(pub30, r.poisson(engaged * 1.0)).astype(float)
    plat = np.minimum(3, r.poisson(engaged * 2)).astype(float); plan = (r.random(n) < 0.08 + 0.25 * engaged).astype(float) * r.choice([1, 2], n, p=[.85, .15])
    credits = np.where(plan > 0, r.integers(20, 200, n), r.integers(0, 30, n)).astype(float)
    gen_ok = (0.7 + 0.3 * engaged + r.normal(0, .05, n)).clip(0, 1); mkt = r.poisson(engaged * 0.8).astype(float); aff = r.poisson(engaged * 0.5).astype(float)
    onb = (r.random(n) < 0.4 + 0.5 * engaged).astype(float); rev = np.where(plan > 0, r.gamma(3, 30, n), r.gamma(1, 5, n) * (r.random(n) < 0.15)).clip(0, 2000)
    z = -0.6 + 0.045 * days_since - 0.35 * p30 - 0.5 * pub30 - 0.8 * (plan > 0) - 0.6 * onb - 0.3 * plat - 0.004 * np.minimum(tenure, 200) + r.normal(0, .6, n)
    churn = (r.random(n) < 1 / (1 + np.exp(-z))).astype(int)
    ltv = np.maximum(0, (rev / 3 + np.where(plan == 1, 49, np.where(plan == 2, 199, 0)) * .5) * np.minimum(24, 1 / np.maximum(0.04, (1 - engaged) * .5)) * (1 - 0.6 * churn) * r.lognormal(0, .35, n))
    up = ((plan == 0) & (r.random(n) < 1 / (1 + np.exp(-(-2.6 + 0.25 * p30 + 0.3 * pub30 + 0.8 * (credits < 6) + 0.2 * plat - 0.04 * days_since))))).astype(int)
    cr = (r.random(n) < 1 / (1 + np.exp(-(-2.2 + 0.3 * p30 + 1.1 * (credits < 6) - 0.05 * days_since + 0.8 * (rev > 0))))).astype(int)
    df = pd.DataFrame(dict(days_since_last_login=days_since, tenure_days=tenure, projects_7d=p7, projects_30d=p30, gen_success_rate_30d=gen_ok, publications_7d=pub7, publications_30d=pub30,
                           platforms_connected=plat, credits_remaining=credits, plan_ordinal=plan, marketplace_purchases_90d=mkt, affiliate_links_active=aff, onboarding_completed=onb, revenue_90d_brl=rev))
    df["snapshot_at"] = pd.Timestamp("2026-01-01") + pd.to_timedelta(r.integers(0, 180, n), unit="D")   # para split temporal
    df["churn_30d"], df["ltv_brl"], df["upgrade_30d"], df["credits_30d"] = churn, ltv, up, cr
    return df[FEATURES + ["snapshot_at", "churn_30d", "ltv_brl", "upgrade_30d", "credits_30d"]]


# Extração point-in-time (um snapshot por usuário e por semana; os desfechos olham SÓ para frente — sem vazamento).
POINT_IN_TIME_SQL = """
WITH snaps AS (
  SELECT u.id AS user_id, s::date AS snap, u.created_at, u.plan, u.credits
  FROM users u CROSS JOIN LATERAL generate_series(u.created_at::date + 7, current_date - %(horizon)s, interval '7 days') s
  WHERE u.deleted_at IS NULL
)
SELECT s.user_id, s.snap AS snapshot_at,
  EXTRACT(EPOCH FROM (s.snap - COALESCE((SELECT max(p.created_at) FROM projects p WHERE p.user_id=s.user_id AND p.created_at < s.snap), s.created_at)))/86400 AS days_since_last_login,
  EXTRACT(EPOCH FROM (s.snap - s.created_at))/86400 AS tenure_days,
  (SELECT count(*) FROM projects p WHERE p.user_id=s.user_id AND p.created_at >= s.snap - 7  AND p.created_at < s.snap) AS projects_7d,
  (SELECT count(*) FROM projects p WHERE p.user_id=s.user_id AND p.created_at >= s.snap - 30 AND p.created_at < s.snap) AS projects_30d,
  COALESCE((SELECT count(*) FILTER (WHERE status='ready')::float / NULLIF(count(*) FILTER (WHERE status IN ('ready','error')),0) FROM projects p WHERE p.user_id=s.user_id AND p.created_at >= s.snap - 30 AND p.created_at < s.snap),1) AS gen_success_rate_30d,
  (SELECT count(*) FROM publications b WHERE b.user_id=s.user_id AND b.status='published' AND b.published_at >= s.snap - 7  AND b.published_at < s.snap) AS publications_7d,
  (SELECT count(*) FROM publications b WHERE b.user_id=s.user_id AND b.status='published' AND b.published_at >= s.snap - 30 AND b.published_at < s.snap) AS publications_30d,
  (SELECT count(*) FROM connected_accounts c WHERE c.user_id=s.user_id AND c.created_at < s.snap) AS platforms_connected,
  s.credits AS credits_remaining, CASE s.plan WHEN 'free' THEN 0 WHEN 'pro' THEN 1 ELSE 2 END AS plan_ordinal,
  (SELECT count(*) FROM template_purchases t WHERE t.buyer_id=s.user_id AND t.created_at >= s.snap - 90 AND t.created_at < s.snap) AS marketplace_purchases_90d,
  (SELECT count(*) FROM affiliate_links l WHERE l.user_id=s.user_id AND l.created_at < s.snap) AS affiliate_links_active,
  CASE WHEN EXISTS (SELECT 1 FROM users x WHERE x.id=s.user_id AND x.onboarding_completed_at < s.snap) THEN 1 ELSE 0 END AS onboarding_completed,
  COALESCE((SELECT sum(COALESCE(amount_brl_cents, amount_cents)) FROM transactions t WHERE t.user_id=s.user_id AND t.type IN ('subscription','credit_purchase') AND t.created_at >= s.snap - 90 AND t.created_at < s.snap),0)/100.0 AS revenue_90d_brl,
  -- desfechos (futuro)
  (NOT EXISTS (SELECT 1 FROM projects p WHERE p.user_id=s.user_id AND p.created_at >= s.snap AND p.created_at < s.snap + %(horizon)s)
   AND NOT EXISTS (SELECT 1 FROM publications b WHERE b.user_id=s.user_id AND b.published_at >= s.snap AND b.published_at < s.snap + %(horizon)s))::int AS churn_30d,
  COALESCE((SELECT sum(COALESCE(amount_brl_cents, amount_cents)) FROM transactions t WHERE t.user_id=s.user_id AND t.type IN ('subscription','credit_purchase') AND t.created_at >= s.snap AND t.created_at < s.snap + %(ltv)s),0)/100.0 AS ltv_brl,
  (s.plan='free' AND EXISTS (SELECT 1 FROM transactions t WHERE t.user_id=s.user_id AND t.type='subscription' AND t.created_at >= s.snap AND t.created_at < s.snap + %(horizon)s))::int AS upgrade_30d,
  EXISTS (SELECT 1 FROM transactions t WHERE t.user_id=s.user_id AND t.type='credit_purchase' AND t.created_at >= s.snap AND t.created_at < s.snap + %(horizon)s)::int AS credits_30d
FROM snaps s
"""


def from_db(dsn: str) -> pd.DataFrame:  # pragma: no cover - exige Postgres com histórico real
    import psycopg
    with psycopg.connect(dsn) as con:
        df = pd.read_sql(POINT_IN_TIME_SQL % {"horizon": f"interval '{CHURN_HORIZON_DAYS} days'", "ltv": f"interval '{LTV_HORIZON_DAYS} days'"}, con)
    df["snapshot_at"] = pd.to_datetime(df["snapshot_at"])
    return df


def matrix(df: pd.DataFrame) -> np.ndarray:
    return df[FEATURES].to_numpy(dtype=float)
