-- LTV acumulado por coorte mensal em D0/D30/D60/D90 (BRL centavos por usu?rio do cohort). S? maturidade completa; imaturo = NULL.
with asof as (select as_of_date from {{ ref('int_as_of') }}),
u as (select pseudo_id, signup_date, {{ xdb_trunc_month('signup_date') }} as cohort_month from {{ ref('dim_users') }}),
sz as (select cohort_month, count(*) as users from u group by 1),
x as (select u.cohort_month, k.k,
        sum(case when {{ xdb_add_days('u.signup_date', 'k.k') }} <= (select as_of_date from asof) then 1 else 0 end) as eligible_users,
        sum(case when t.tx_date is not null and {{ xdb_days_between('u.signup_date', 't.tx_date') }} <= k.k and {{ xdb_add_days('u.signup_date', 'k.k') }} <= (select as_of_date from asof) then t.amount_brl_cents else 0 end) as revenue
      from u cross join (select 0 as k union all select 30 union all select 60 union all select 90) k
      left join {{ ref('stg_transactions') }} t on t.pseudo_id = u.pseudo_id and t.is_revenue
      group by u.cohort_month, k.k)
select x.cohort_month, sz.users as cohort_size, x.k as day_offset, x.eligible_users, x.revenue as cumulative_revenue_brl_cents,
  case when x.eligible_users = sz.users and sz.users > 0 then 1.0 * x.revenue / sz.users end as ltv_brl_cents_per_user
from x join sz using (cohort_month)
