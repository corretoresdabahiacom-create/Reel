-- Reten??o por coorte semanal de cadastro: D1/D7/D30/D90 (dia N exato = "classic") e rolling (ativo em N ou depois).
-- S? conta usu?rios ELEG?VEIS (cadastro + N <= data de refer?ncia): coortes imaturas d?o NULL, nunca 0 falso.
with asof as (select as_of_date from {{ ref('int_as_of') }}),
u as (select pseudo_id, signup_date, {{ xdb_trunc_week('signup_date') }} as cohort_week from {{ ref('dim_users') }}),
flags as (
  select u.cohort_week, u.pseudo_id, u.signup_date,
    {% for n in [1, 7, 30, 90] %}
    ({{ xdb_add_days('u.signup_date', n) }} <= (select as_of_date from asof)) as elig_d{{ n }},
    max(case when {{ xdb_days_between('u.signup_date', 'a.event_date') }} = {{ n }} then 1 else 0 end) as exact_d{{ n }},
    max(case when {{ xdb_days_between('u.signup_date', 'a.event_date') }} >= {{ n }} then 1 else 0 end) as rolling_d{{ n }}{% if not loop.last %},{% endif %}
    {% endfor %}
  from u left join {{ ref('int_user_activity_days') }} a on a.pseudo_id = u.pseudo_id
  group by u.cohort_week, u.pseudo_id, u.signup_date
)
select cohort_week, count(*) as cohort_size,
  {% for n in [1, 7, 30, 90] %}
  sum(case when elig_d{{ n }} then 1 else 0 end) as eligible_d{{ n }},
  sum(case when elig_d{{ n }} then exact_d{{ n }} else 0 end) as retained_d{{ n }},
  case when sum(case when elig_d{{ n }} then 1 else 0 end) = 0 then null else 1.0 * sum(case when elig_d{{ n }} then exact_d{{ n }} else 0 end) / sum(case when elig_d{{ n }} then 1 else 0 end) end as d{{ n }}_rate,
  case when sum(case when elig_d{{ n }} then 1 else 0 end) = 0 then null else 1.0 * sum(case when elig_d{{ n }} then rolling_d{{ n }} else 0 end) / sum(case when elig_d{{ n }} then 1 else 0 end) end as d{{ n }}_rolling_rate{% if not loop.last %},{% endif %}
  {% endfor %}
from flags group by cohort_week
