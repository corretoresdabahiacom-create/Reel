-- DAU / WAU / MAU (janelas m?veis de 7 e 30 dias) a partir das a??es de cria??o/distribui??o.
with d as (select distinct event_date from {{ ref('int_user_activity_days') }}), a as (select * from {{ ref('int_user_activity_days') }})
select d.event_date as activity_date,
  count(distinct case when a.event_date = d.event_date then a.pseudo_id end) as dau,
  count(distinct case when a.event_date >= {{ xdb_add_days('d.event_date', -6) }} then a.pseudo_id end) as wau,
  count(distinct a.pseudo_id) as mau
from d join a on a.event_date between {{ xdb_add_days('d.event_date', -29) }} and d.event_date
group by d.event_date
