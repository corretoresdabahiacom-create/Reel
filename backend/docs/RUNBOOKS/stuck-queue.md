# Runbook — fila travada / backlog

**Sintomas:** alerta `QueueBacklog`, usuários reclamando de geração/publicação "pendente", `queue_depth{queue=…}` alto.

1. **Qual fila?** `GET /api/v1/admin/dlq` e Bull Board (`/admin/queues`, admin+TOTP) → *waiting / active / delayed / failed*.
2. **Workers vivos?** `curl worker:9464/healthz`; ECS: serviço `worker`/`worker-assemble` com tasks `RUNNING`? Logs `workers no ar` e `job falhou`.
3. **Causa provável**
   - *Active alto e parado:* job preso em FFmpeg/provedor. Confirme no log (`traceId` do job). Jobs têm retry/backoff; se ficarem *stalled*, o BullMQ os devolve à fila após o lock expirar.
   - *Failed crescendo:* erro sistemático (provedor fora, token expirado, kill switch). Veja o `err` nos logs e o breaker (`cb:open:*` no Redis).
   - *Waiting alto, ativos baixos:* falta de capacidade → escale (`aws ecs update-service --desired-count`) ou aumente `WORKER_CONCURRENCY_SCALE`.
   - *Redis:* `maxmemory-policy` deve ser `noeviction`; memória cheia faz o Redis recusar escritas.
4. **Mitigar:** escalar workers; pausar a origem (kill switch `generation_enabled=false` via `PATCH /admin/flags/generation_enabled`); para publicação use `publish_<plataforma>`.
5. **DLQ:** cada fila tem `<fila>-dlq`. Após corrigir a causa, reenvie pelo Bull Board (*Retry*) — os workers são **idempotentes** (publicação retoma por `provider_job_id`; cobrança de crédito usa `external_ref`).
6. **Pós‑incidente:** registre causa, ajuste `attempts/backoff` ou limites e adicione teste.
