-- Camada sem?ntica: UMA defini??o por m?trica (cat?logo em seeds/metric_catalog.csv). Dashboards leem s? daqui.
-- Formato longo: (metric_date, metric_key, dimension_key, dimension_value, value).
select activity_date as metric_date, 'dau' as metric_key, 'all' as dimension_key, 'all' as dimension_value, cast(dau as numeric) as value from {{ ref('mart_active_users_daily') }}
union all select activity_date, 'wau', 'all', 'all', cast(wau as numeric) from {{ ref('mart_active_users_daily') }}
union all select activity_date, 'mau', 'all', 'all', cast(mau as numeric) from {{ ref('mart_active_users_daily') }}
union all select signup_date, 'new_users', 'all', 'all', cast(count(*) as numeric) from {{ ref('dim_users') }} group by signup_date
union all select signup_date, 'new_users', 'channel', attribution_source, cast(count(*) as numeric) from {{ ref('dim_users') }} group by signup_date, attribution_source
union all select tx_date, 'revenue_brl_cents', 'all', 'all', cast(sum(revenue_brl_cents) as numeric) from {{ ref('fct_revenue_daily') }} group by tx_date
union all select tx_date, 'revenue_brl_cents', 'currency', currency, cast(sum(revenue_brl_cents) as numeric) from {{ ref('fct_revenue_daily') }} group by tx_date, currency
union all select tx_date, 'revenue_brl_cents', 'method', method, cast(sum(revenue_brl_cents) as numeric) from {{ ref('fct_revenue_daily') }} group by tx_date, method
union all select tx_date, 'paying_users', 'all', 'all', cast(paying_users as numeric) from {{ ref('mart_monetization_daily') }}
union all select tx_date, 'new_payers', 'all', 'all', cast(new_payers as numeric) from {{ ref('mart_monetization_daily') }}
union all select event_date, 'videos_assembled', 'all', 'all', cast(video_assembled as numeric) from {{ ref('mart_funnel_daily') }}
union all select ops_date, 'videos_ready', 'all', 'all', cast(videos_ready as numeric) from {{ ref('mart_ops_daily') }}
union all select ops_date, 'publications_published', 'all', 'all', cast(published as numeric) from {{ ref('mart_ops_daily') }}
union all select ops_date, 'publish_success_rate', 'all', 'all', cast(publish_success_rate as numeric) from {{ ref('mart_ops_daily') }} where publish_success_rate is not null
union all select ops_date, 'ai_cost_cents', 'all', 'all', cast(ai_cost_cents as numeric) from {{ ref('mart_ops_daily') }}
union all select ops_date, 'ai_cost_per_ready_video_cents', 'all', 'all', cast(ai_cost_per_ready_video_cents as numeric) from {{ ref('mart_ops_daily') }} where ai_cost_per_ready_video_cents is not null
union all select purchase_date, 'marketplace_gmv_credits', 'all', 'all', cast(gmv_credits as numeric) from {{ ref('mart_marketplace_daily') }}
union all select purchase_date, 'marketplace_fee_credits', 'all', 'all', cast(fee_credits as numeric) from {{ ref('mart_marketplace_daily') }}
union all select referral_date, 'referrals_rewarded', 'all', 'all', cast(rewarded as numeric) from {{ ref('mart_referrals_daily') }}
