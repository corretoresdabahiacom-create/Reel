-- Receita e convers?o por canal de aquisi??o (last non-direct, gravado em users.attribution_source).
select attribution_source as channel, count(*) as signups, sum(case when activated_d7 then 1 else 0 end) as activated_d7, sum(case when is_payer then 1 else 0 end) as payers,
  sum(lifetime_revenue_brl_cents) as revenue_brl_cents,
  1.0 * sum(case when activated_d7 then 1 else 0 end) / count(*) as activation_rate, 1.0 * sum(case when is_payer then 1 else 0 end) / count(*) as payer_rate,
  1.0 * sum(lifetime_revenue_brl_cents) / count(*) as revenue_per_signup_brl_cents
from {{ ref('dim_users') }} group by attribution_source
