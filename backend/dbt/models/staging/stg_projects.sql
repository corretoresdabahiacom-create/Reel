with dedup as (select *, row_number() over (partition by project_id order by _loaded_at desc) as rn from {{ source('raw', 'projects') }})
select project_id, pseudo_id, status, coalesce(category, 'geral') as category, template_id, created_at, {{ xdb_date('created_at') }} as created_date from dedup where rn = 1
