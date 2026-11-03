-- card: receita_moeda | receita por moeda
select dimension_value as currency, sum(value) as revenue_brl_cents from semantic.sem_metrics_daily where metric_key='revenue_brl_cents' and dimension_key='currency' group by 1 order by 2 desc;
-- card: receita_metodo | receita por metodo de pagamento
select dimension_value as method, sum(value) as revenue_brl_cents from semantic.sem_metrics_daily where metric_key='revenue_brl_cents' and dimension_key='method' group by 1 order by 2 desc;
-- card: ltv_coortes | LTV acumulado por coorte mensal (NULL = imaturo)
select cohort_month, day_offset, cohort_size, ltv_brl_cents_per_user from marts.mart_ltv_cohorts order by 1, 3;
-- card: assinaturas_vs_creditos | mix de receita
select tx_date, subscription_revenue_brl_cents, credit_revenue_brl_cents, new_payers from marts.mart_monetization_daily order by 1;
