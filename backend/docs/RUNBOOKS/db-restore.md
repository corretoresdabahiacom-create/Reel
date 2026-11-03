# Runbook — restauração do banco

1. **Decidir o ponto no tempo** (antes do erro/corrupção). RDS mantém PITR por 14 dias.
2. **Restaurar para uma instância nova** (nunca por cima): `aws rds restore-db-instance-to-point-in-time --source-db-instance-identifier nexusreel-production-pg --target-db-instance-identifier nexusreel-production-pg-restore --restore-time <UTC> --db-subnet-group-name … --vpc-security-group-ids …`.
3. **Validar** na instância restaurada: contagem de `users`, `transactions`, últimas migrations (`SELECT * FROM schema_migrations`), integridade de saldos (`SELECT count(*) FROM users WHERE credits < 0`).
4. **Cortar:** pôr a API em manutenção (`generation_enabled=false`, e escalar workers a 0), atualizar o segredo `DATABASE_URL`/`DATABASE_READ_URL` para a nova instância, redeploy de api/worker, reabilitar.
5. **Reconciliar:** eventos de pagamento/webhooks do intervalo perdido — reenviar pelo painel Stripe/Pix (são idempotentes); conferir `payout_requests` e `transactions`. Redis não precisa de restauração (filas perdidas são recriáveis; sessões/refresh ficam inválidos só se o Redis também caiu).
6. **Desastre regional:** réplica cross‑region promovida (`aws rds promote-read-replica`) + Route 53 failover — ver `DEPLOY.md#multi-região`.
7. **Teste de restauração:** executar trimestralmente em staging e registrar o tempo (RTO alvo 60 min, RPO alvo 5 min).
