# ADR 0001 — Filas BullMQ/Redis com DLQ por fila
**Status:** aceito · **Data:** retroativo (decisão tomada nas Fases 1–6)
## Contexto
Geração, dublagem e publicação são lentas, dependem de terceiros e precisam de retry, prioridade por plano e visibilidade.
## Decisão
BullMQ sobre Redis; uma fila por tipo de trabalho; concorrência por fila; DLQ `<fila>-dlq` após esgotar tentativas; prioridade business > pro > free; Bull Board para admins.
## Alternativas
SQS+workers (menos prioridade e visibilidade nativas, mais custo de integração); Temporal (poderoso, mas operação maior).
## Consequências
Redis vira dependência crítica (RTO 30 min; runbook `redis-down`); jobs idempotentes e estado no Postgres permitem reprocessar; SLO de filas (`queues-depth`, `queues-dlq`).
## Validar/reverter
Chaos `worker-kill`; trocar por SQS exigiria reescrever `src/queues`.
