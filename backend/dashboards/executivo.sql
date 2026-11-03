-- card: kpis | MAU, DAU, receita 30d, novos pagantes 30d
select (select value from semantic.sem_metrics_daily where metric_key='mau' and dimension_key='all' order by metric_date desc limit 1) as mau,
       (select value from semantic.sem_metrics_daily where metric_key='dau' and dimension_key='all' order by metric_date desc limit 1) as dau,
       (select coalesce(sum(value),0) from semantic.sem_metrics_daily where metric_key='revenue_brl_cents' and dimension_key='all') as revenue_brl_cents,
       (select coalesce(sum(value),0) from semantic.sem_metrics_daily where metric_key='new_payers') as new_payers;
-- card: receita_diaria | serie de receita (BRL centavos)
select metric_date, value as revenue_brl_cents from semantic.sem_metrics_daily where metric_key='revenue_brl_cents' and dimension_key='all' order by 1;
