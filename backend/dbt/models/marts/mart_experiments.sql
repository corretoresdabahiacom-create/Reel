-- Exposi??o e resultado por variante: convers?o para assinatura (14 d), receita e custo de IA por usu?rio exposto (14 d).
with ex as (select experiment_key, variant, pseudo_id, exposed_at from {{ ref('stg_experiment_assignments') }} where exposed_at is not null),
sub as (select pseudo_id, min(occurred_at) as at from {{ ref('stg_events') }} where event_name = 'subscription_started' and pseudo_id is not null group by 1),
rev as (select e.experiment_key, e.pseudo_id, sum(t.amount_brl_cents) as r from ex e join {{ ref('stg_transactions') }} t on t.pseudo_id = e.pseudo_id and t.is_revenue and t.created_at >= e.exposed_at and {{ xdb_days_between('e.exposed_at', 't.created_at') }} <= 14 group by 1, 2),
ai as (select e.experiment_key, e.pseudo_id, sum(a.cost_cents) as c from ex e join {{ ref('stg_ai_usage') }} a on a.pseudo_id = e.pseudo_id and a.created_at >= e.exposed_at and {{ xdb_days_between('e.exposed_at', 'a.created_at') }} <= 14 group by 1, 2)
select ex.experiment_key, ex.variant, count(*) as exposed_users,
  sum(case when sub.at is not null and sub.at >= ex.exposed_at and {{ xdb_days_between('ex.exposed_at', 'sub.at') }} <= 14 then 1 else 0 end) as converted_users,
  coalesce(sum(rev.r), 0) as revenue_brl_cents, coalesce(sum(ai.c), 0) as ai_cost_cents,
  1.0 * coalesce(sum(rev.r), 0) / count(*) as revenue_per_user_brl_cents, 1.0 * coalesce(sum(ai.c), 0) / count(*) as ai_cost_per_user_cents
from ex left join sub on sub.pseudo_id = ex.pseudo_id left join rev on rev.experiment_key = ex.experiment_key and rev.pseudo_id = ex.pseudo_id left join ai on ai.experiment_key = ex.experiment_key and ai.pseudo_id = ex.pseudo_id
group by ex.experiment_key, ex.variant
