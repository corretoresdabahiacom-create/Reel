with first_video as (select pseudo_id, min(created_date) as first_project_date from {{ ref('stg_projects') }} where status = 'ready' group by 1),
first_pub as (select pseudo_id, min({{ xdb_date('published_at') }}) as first_publish_date from {{ ref('stg_publications') }} where status = 'published' group by 1),
rev as (select pseudo_id, min(tx_date) as first_paid_date, sum(amount_brl_cents) as lifetime_revenue_brl_cents, count(*) as paid_transactions from {{ ref('stg_transactions') }} where is_revenue group by 1)
select u.pseudo_id, u.created_at, u.signup_date, u.plan, u.region, u.country, u.locale, u.attribution_source, u.partner_id, u.creator_verified, u.churn_risk, u.rfm_segment, u.onboarding_goal, u.referred,
       fv.first_project_date as first_video_date, fp.first_publish_date, r.first_paid_date, coalesce(r.lifetime_revenue_brl_cents, 0) as lifetime_revenue_brl_cents, coalesce(r.paid_transactions, 0) as paid_transactions,
       (fv.first_project_date is not null and {{ xdb_days_between('u.signup_date', 'fv.first_project_date') }} <= 7) as activated_d7,
       (fp.first_publish_date is not null) as ever_published, (r.first_paid_date is not null) as is_payer
from {{ ref('stg_users') }} u left join first_video fv using (pseudo_id) left join first_pub fp using (pseudo_id) left join rev r using (pseudo_id)
