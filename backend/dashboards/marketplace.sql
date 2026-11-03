-- card: gmv | GMV e taxa do marketplace
select purchase_date, purchases, buyers, creators_selling, gmv_credits, fee_credits, take_rate from marts.mart_marketplace_daily order by 1;
