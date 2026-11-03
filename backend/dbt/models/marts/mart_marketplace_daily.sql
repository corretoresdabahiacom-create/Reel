select purchase_date, count(*) as purchases, count(distinct buyer_pseudo) as buyers, count(distinct creator_pseudo) as creators_selling, sum(price_credits) as gmv_credits, sum(fee_credits) as fee_credits,
  case when sum(price_credits) > 0 then 1.0 * sum(fee_credits) / sum(price_credits) end as take_rate
from {{ ref('stg_template_purchases') }} group by purchase_date
