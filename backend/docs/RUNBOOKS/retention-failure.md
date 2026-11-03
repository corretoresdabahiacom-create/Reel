# Runbook — job de retenção falhou ou não rodou
1. `GET /admin/ops/compliance/retention/report?days=3` — ausência de execução = alerta (job `policy-retention`, diário).
2. Rodar em modo seco: `POST /admin/ops/compliance/retention/run {"dryRun":true}`; avaliar contagens.
3. Rodar de verdade; investigar erro (lock, permissão no S3).
4. Registrar no relatório mensal de compliance; atraso > 7 dias → incidente Sev3.
