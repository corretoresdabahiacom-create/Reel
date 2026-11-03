-- card: novos_usuarios_canal | cadastros por canal
select dimension_value as channel, sum(value) as signups from semantic.sem_metrics_daily where metric_key='new_users' and dimension_key='channel' group by 1 order by 2 desc;
-- card: atribuicao | receita e conversao por canal
select channel, signups, activation_rate, payer_rate, revenue_brl_cents from marts.mart_attribution_channels order by revenue_brl_cents desc;
-- card: indicacoes | indicacoes, recompensadas e fraude bloqueada
select referral_date, referrals, rewarded, fraud_blocked from marts.mart_referrals_daily order by 1;
-- card: experimentos | resultado por variante
select experiment_key, variant, exposed_users, converted_users, revenue_per_user_brl_cents, ai_cost_per_user_cents from marts.mart_experiments order by 1, 2;
