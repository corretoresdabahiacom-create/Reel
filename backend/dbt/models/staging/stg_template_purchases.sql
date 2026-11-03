with dedup as (select *, row_number() over (partition by purchase_id order by _loaded_at desc) as rn from {{ source('raw', 'template_purchases') }})
select purchase_id, template_id, buyer_pseudo, creator_pseudo, price_credits, fee_credits, created_at, {{ xdb_date('created_at') }} as purchase_date from dedup where rn = 1
