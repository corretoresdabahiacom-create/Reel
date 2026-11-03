{{ config(enabled = var('golden_checks', false), tags = ['golden']) }}
-- Coorte golden sintetica (scripts/seed_synthetic.sql): D1=0.8, D7=0.5, D30=0.2, D90 imaturo=NULL; coorte recente D7 imaturo=NULL.
select 'golden_cohort_wrong' as failure from {{ ref('mart_retention_cohorts') }}
where cohort_week = cast('2026-01-05' as date) and not (abs(d1_rate - 0.8) < 1e-9 and abs(d7_rate - 0.5) < 1e-9 and abs(d30_rate - 0.2) < 1e-9 and d90_rate is null)
union all
select 'immature_cohort_not_null' from {{ ref('mart_retention_cohorts') }} where cohort_week = cast('2026-02-23' as date) and d7_rate is not null
union all
select 'quarantine_leaked' from {{ ref('stg_events') }} where event_id = 'q1'
union all
select 'refund_counted_as_revenue' from {{ ref('fct_revenue_daily') }} where revenue_brl_cents < 0
union all
select 'revenue_total_wrong' from (select sum(revenue_brl_cents) s from {{ ref('fct_revenue_daily') }}) x where s <> 8680
