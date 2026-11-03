-- card: retencao | D1/D7/D30/D90 por coorte (NULL = coorte imatura)
select cohort_week, cohort_size, d1_rate, d7_rate, d30_rate, d90_rate from marts.mart_retention_cohorts order by 1;
-- card: funil_coorte | funil de ativacao por coorte semanal
select cohort_week, signups, created_project_7d, video_ready_7d, published_7d, paid_30d from marts.mart_funnel_cohort order by 1;
-- card: ativos | DAU/WAU/MAU
select activity_date, dau, wau, mau from marts.mart_active_users_daily order by 1;
