-- Funil por coorte semanal usando as tabelas transacionais (verdade do servidor, independe de consentimento de analytics).
with u as (select pseudo_id, signup_date, {{ xdb_trunc_week('signup_date') }} as cohort_week from {{ ref('dim_users') }}),
p as (select pseudo_id, min(created_date) d from {{ ref('stg_projects') }} group by 1),
r as (select pseudo_id, min(created_date) d from {{ ref('stg_projects') }} where status = 'ready' group by 1),
b as (select pseudo_id, min({{ xdb_date('published_at') }}) d from {{ ref('stg_publications') }} where status = 'published' group by 1),
t as (select pseudo_id, min(tx_date) d from {{ ref('stg_transactions') }} where is_revenue group by 1)
select u.cohort_week, count(*) as signups,
  sum(case when p.d is not null and {{ xdb_days_between('u.signup_date', 'p.d') }} <= 7 then 1 else 0 end) as created_project_7d,
  sum(case when r.d is not null and {{ xdb_days_between('u.signup_date', 'r.d') }} <= 7 then 1 else 0 end) as video_ready_7d,
  sum(case when b.d is not null and {{ xdb_days_between('u.signup_date', 'b.d') }} <= 7 then 1 else 0 end) as published_7d,
  sum(case when t.d is not null and {{ xdb_days_between('u.signup_date', 't.d') }} <= 30 then 1 else 0 end) as paid_30d
from u left join p using (pseudo_id) left join r using (pseudo_id) left join b using (pseudo_id) left join t using (pseudo_id)
group by u.cohort_week
