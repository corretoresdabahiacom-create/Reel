with latest as (select *, row_number() over (partition by pseudo_id order by snapshot_at desc, _loaded_at desc) as rn from {{ source('raw', 'users') }})
select pseudo_id, created_at, {{ xdb_date('created_at') }} as signup_date, coalesce(plan, 'free') as plan, region, upper(country) as country, locale,
       coalesce(attribution_source, 'direct') as attribution_source, partner_id, coalesce(creator_verified, false) as creator_verified,
       churn_risk, rfm_segment, onboarding_goal, coalesce(referred, false) as referred
from latest where rn = 1
