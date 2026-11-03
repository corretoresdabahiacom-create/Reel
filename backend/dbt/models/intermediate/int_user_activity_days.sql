-- 1 linha por (usu?rio, dia) com ao menos uma a??o de cria??o/distribui??o (var activity_events).
select distinct pseudo_id, event_date
from {{ ref('stg_events') }}
where pseudo_id is not null and event_name in {{ in_list(var('activity_events')) }}
