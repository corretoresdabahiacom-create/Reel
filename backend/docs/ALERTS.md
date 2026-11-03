# Alertas

Regras Prometheus em `infra/observability/alerts.yml` (carregadas pelo compose com `--profile observability`). `page` acorda o plantão; `ticket` entra na fila do próximo dia útil. Cada alerta aponta o runbook.

| Alerta | Condição | Sev. | Ação |
|---|---|---|---|
| HighErrorRate | 5xx > 2% por 5 min | page | olhar `traceId` nos logs/Sentry; se começou após deploy → [rollback](RUNBOOKS/rollback.md) |
| RedirectLatencyP95 | `/r/:linkId` p95 > 150 ms por 5 min | page | Redis saturado? checar `INFO` e CPU; escalar API; ver `load/redirect.js` |
| HighLatencyP95 | p95 geral > 1 s por 10 min | ticket | `/__debug` (últimas requisições), consultas lentas (`log_min_duration_statement=500`) |
| QueueBacklog | `queue_depth` > 500 por 10 min | page | [fila travada](RUNBOOKS/stuck-queue.md) |
| DeadLetterQueueGrowing | `dlq_size` > 0 por 15 min | ticket | inspecionar no Bull Board, corrigir causa e reprocessar |
| AIProviderFailures | > 10 falhas/10 min de um provedor | page | [falha de provedor](RUNBOOKS/ai-provider-failure.md) (o breaker já desvia para o fallback) |
| PublicationFailureRate | > 30% de falhas em 30 min por plataforma | ticket | verificar status da API da plataforma/tokens expirados; usar kill switch `publish_<plataforma>` se necessário |
| AICostSpike | > R$ 200 de IA na última hora | page | [pico de custo](RUNBOOKS/cost-spike.md) |
| ReadinessFailing | API fora do scrape por 2 min | page | `/readyz` (Postgres/Redis), ECS events |

Além disso, a aplicação loga `warn` quando o custo diário de IA ultrapassa `AI_DAILY_COST_ALERT_CENTS` e o Sentry captura exceções não tratadas (com `userId`/`traceId`, sem corpo de requisição). Alarme CloudWatch `alb-5xx` complementa a regra de 5xx.


## Fase 8 — alertas de SLO
Alertas de burn rate multi-janela são **gerados** a partir de `slo/*.slo.yaml` (`infra/observability/slo-rules.generated.yml`; ver `docs/SRE/SLOs.md`) e roteados pelo Alertmanager (`infra/alertmanager/alertmanager.yml`): `severity=page` → PagerDuty + #incidents; `severity=ticket` → #sre-tickets. Runbook: `docs/RUNBOOKS/slo-burn.md`.
