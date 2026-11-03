with dedup as (select *, row_number() over (partition by usage_id order by _loaded_at desc) as rn from {{ source('raw', 'ai_usage') }})
select usage_id, pseudo_id, provider, operation, cost_cents, status, created_at, {{ xdb_date('created_at') }} as usage_date from dedup where rn = 1
