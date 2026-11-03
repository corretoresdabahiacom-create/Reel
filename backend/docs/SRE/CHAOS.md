# Engenharia do caos

Ferramenta: Chaos Mesh (`infra/chaos/experiments.yaml`, todos `suspend: true` por padrão). **Staging primeiro**; produção só após 2 execuções limpas em staging e game day aprovado.

## Princípios
Hipótese explícita → raio de explosão mínimo → critério de aborto → observar SLOs → registrar em `resilience_exercises` (`POST /admin/ops/exercises` + `/complete`).

## Experimentos

| Experimento | Hipótese | Critério de sucesso | Aborto |
|---|---|---|---|
| worker-kill (50% dos workers) | filas se recuperam sozinhas, nenhum job perdido (ack tardio + retry) | profundidade volta < 500 em 10 min; DLQ não cresce | DLQ > 50 |
| ai-provider-latency (8 s) | circuit breaker abre após 3 falhas e o fallback atende | geração segue; breaker `cb:open:*` aberto; SLO de geração ≥ 98% | taxa de erro de geração > 10% por 5 min |
| redis-partition (3 min) | API degrada com segurança (rate limit tolerante, sem 5xx em leitura) | api-availability sem queda > 0,05% | 5xx > 2% |
| platform-5xx-simulation (60% perda) | retries com backoff + circuit breaker de publicação; usuário vê "tentando novamente" | publication-success-rate recupera ao fim | fila batch-publish > 500 |
| api-cpu-pressure | autoscaling mantém p95 de leitura < 300 ms | p95 < 300 ms após scale-out | p95 > 1 s por 5 min |
| postgres-failover | RTO ≤ 1 h / RPO ≤ 5 min (na prática, RTO de minutos com réplica) | API volta a 200; sem perda de transações confirmadas | indisponível > 15 min |

## Execução
1. Anunciar em #eng 24 h antes; comandante e observador definidos; SLO dashboard aberto.
2. Retirar `suspend`/anotar para iniciar; cronometrar.
3. Encerrar; coletar métricas; classificar: `passed` / `gaps_found` / `failed`.
4. Lacunas viram itens em `docs/DEBT.md` com prazo; reteste após a correção.

## Estado
**Nenhum experimento foi executado em cluster real nesta entrega.** O que existe: manifestos válidos (YAML), hipóteses, critérios e o registro em banco. A primeira execução está no calendário (`docs/SRE/CALENDAR.md`).
