with dedup as (select *, row_number() over (partition by experiment_key, pseudo_id order by _loaded_at desc) as rn from {{ source('raw', 'experiment_assignments') }})
select experiment_key, pseudo_id, variant, assigned_at, exposed_at from dedup where rn = 1
