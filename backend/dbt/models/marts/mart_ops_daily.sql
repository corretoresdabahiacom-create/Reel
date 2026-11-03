-- Opera??o: custo de IA, taxa de sucesso de publica??o e custo unit?rio (IA por v?deo pronto).
with ai as (select usage_date as d, sum(cost_cents) as ai_cost_cents, count(*) as ai_calls, sum(case when status <> 'ok' then 1 else 0 end) as ai_errors from {{ ref('stg_ai_usage') }} group by 1),
pub as (select created_date as d, count(*) as publications, sum(case when status = 'published' then 1 else 0 end) as published, sum(case when status = 'failed' then 1 else 0 end) as failed from {{ ref('stg_publications') }} group by 1),
vid as (select created_date as d, count(*) as projects_created, sum(case when status = 'ready' then 1 else 0 end) as videos_ready from {{ ref('stg_projects') }} group by 1),
days as (select d from ai union select d from pub union select d from vid)
select days.d as ops_date, coalesce(ai.ai_cost_cents, 0) as ai_cost_cents, coalesce(ai.ai_calls, 0) as ai_calls, coalesce(ai.ai_errors, 0) as ai_errors,
  coalesce(pub.publications, 0) as publications, coalesce(pub.published, 0) as published, coalesce(pub.failed, 0) as failed,
  case when coalesce(pub.published, 0) + coalesce(pub.failed, 0) > 0 then 1.0 * pub.published / (pub.published + pub.failed) end as publish_success_rate,
  coalesce(vid.projects_created, 0) as projects_created, coalesce(vid.videos_ready, 0) as videos_ready,
  case when coalesce(vid.videos_ready, 0) > 0 then 1.0 * coalesce(ai.ai_cost_cents, 0) / vid.videos_ready end as ai_cost_per_ready_video_cents
from days left join ai on ai.d = days.d left join pub on pub.d = days.d left join vid on vid.d = days.d
