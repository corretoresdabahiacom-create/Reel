-- Eventos v?lidos (taxonomia v>0), deduplicados por event_id. Quarentena (schema_version = 0) fica fora das marts.
with src as (select * from {{ source('raw', 'events') }} where schema_version > 0),
dedup as (select *, row_number() over (partition by event_id order by _loaded_at desc) as rn from src)
select event_id, pseudo_id, anon_id, session_id, name as event_name, props, schema_version, source as event_source,
       occurred_at, {{ xdb_date('occurred_at') }} as event_date
from dedup where rn = 1
