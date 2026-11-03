# Runbook — DLQ alta (> 50) ou fila profunda (> 500)
1. Identificar a fila: Bull Board (`/admin/queues`) ou métrica `queue_depth`/DLQ.
2. Amostrar 5 jobs da DLQ: erro comum? (provedor, dado inválido, bug). Bug → corrigir e reenfileirar; dado inválido → marcar como falha definitiva e notificar usuário; provedor → ver runbooks de IA/plataforma.
3. Fila profunda sem erro: aumentar `WORKER_CONCURRENCY_SCALE` ou réplicas de worker; checar dependência lenta (provedor p95).
4. Nunca limpar a DLQ sem registrar a causa (audit_logs).
5. SLO afetado: `queues-depth`, `queues-dlq`.
