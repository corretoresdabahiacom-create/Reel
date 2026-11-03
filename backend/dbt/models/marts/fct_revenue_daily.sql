select tx_date, currency, coalesce(region, 'unknown') as region, method, tx_type, source,
  sum(amount_brl_cents) as revenue_brl_cents, sum(tax_cents) as tax_cents_local, count(*) as transactions, count(distinct pseudo_id) as payers
from {{ ref('stg_transactions') }} where is_revenue group by 1, 2, 3, 4, 5, 6
