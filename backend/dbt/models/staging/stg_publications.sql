with dedup as (select *, row_number() over (partition by publication_id order by _loaded_at desc) as rn from {{ source('raw', 'publications') }})
select publication_id, pseudo_id, project_id, platform, status, published_at, created_at, {{ xdb_date('created_at') }} as created_date from dedup where rn = 1
