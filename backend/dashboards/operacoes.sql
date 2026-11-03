-- card: custo_ia | custo de IA e custo por video pronto (guardrail)
select ops_date, ai_cost_cents, videos_ready, ai_cost_per_ready_video_cents from marts.mart_ops_daily order by 1;
-- card: publicacao | taxa de sucesso de publicacao
select ops_date, publications, published, failed, publish_success_rate from marts.mart_ops_daily order by 1;
