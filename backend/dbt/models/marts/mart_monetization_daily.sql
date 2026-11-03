with rev as (select tx_date, sum(amount_brl_cents) as revenue_brl_cents, count(distinct pseudo_id) as paying_users, count(*) as transactions,
    sum(case when tx_type = 'subscription' then amount_brl_cents else 0 end) as subscription_revenue_brl_cents, sum(case when tx_type = 'credit_purchase' then amount_brl_cents else 0 end) as credit_revenue_brl_cents
  from {{ ref('stg_transactions') }} where is_revenue group by 1),
newp as (select first_paid_date as tx_date, count(*) as new_payers from {{ ref('dim_users') }} where first_paid_date is not null group by 1)
select r.tx_date, r.revenue_brl_cents, r.paying_users, r.transactions, r.subscription_revenue_brl_cents, r.credit_revenue_brl_cents, coalesce(n.new_payers, 0) as new_payers,
  a.dau, case when a.dau > 0 then 1.0 * r.revenue_brl_cents / a.dau end as revenue_per_dau_brl_cents
from rev r left join newp n using (tx_date) left join {{ ref('mart_active_users_daily') }} a on a.activity_date = r.tx_date
