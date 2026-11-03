with dedup as (select *, row_number() over (partition by tx_id order by _loaded_at desc) as rn from {{ source('raw', 'transactions') }})
select tx_id, pseudo_id, type as tx_type, amount_cents, coalesce(amount_brl_cents, amount_cents) as amount_brl_cents, coalesce(currency, 'BRL') as currency,
       coalesce(tax_cents, 0) as tax_cents, region, coalesce(method, 'card') as method, source, coalesce(credits_delta, 0) as credits_delta,
       created_at, {{ xdb_date('created_at') }} as tx_date,
       (type in ('subscription', 'credit_purchase') and amount_cents > 0) as is_revenue
from dedup where rn = 1
