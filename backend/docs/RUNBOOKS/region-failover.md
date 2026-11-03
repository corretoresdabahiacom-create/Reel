# Runbook — perda de região da nuvem
Ver procedimento completo em `docs/SRE/DR.md`. Resumo: Sev1 → congelar escritas → promover réplica Postgres → DNS/`DEPLOY_REGION` → migrations → workers → validar SLOs → comunicar. Usuários com residência na região perdida podem ter indisponibilidade; **não** migrar residência sem base legal (UE).
Drill de lógica: `npm run bcp -- run cloud_region_failure`.
