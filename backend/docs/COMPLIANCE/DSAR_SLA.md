# Direitos do titular (DSAR) — SLA por jurisdição

Medido por região de residência: **BR 15 dias (LGPD) · UE 30 dias (GDPR) · CA 30 dias (PIPEDA) · US 45 dias (CCPA/estados)**. **Escopo medido hoje: exportações (acesso/portabilidade)** — pedido → conclusão do arquivo. **Exclusão não é medida**: ao concluir, o hard delete remove o usuário e o `deletion_requests` em cascata, então não resta registro para calcular o prazo (pendência: gravar um registro anonimizado de conclusão antes do hard delete). A carência de 30 dias da exclusão é arrependimento opcional do titular e não conta contra o SLA.
Relatório: `GET /admin/ops/compliance/dsar?days=90` — por região: total, concluídos no prazo, vencidos (`overdue`), próximos do vencimento (`nearDue`: > 80% do prazo consumido), tempo médio.
