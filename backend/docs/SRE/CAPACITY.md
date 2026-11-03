# Planejamento de capacidade

## Teste mensal (k6)
`load/capacity.js` em staging, dia 10 de cada mês: rampa até 1×, 2×, 5× e 10× o pico medido (`-e STAGE=2x`). Thresholds = SLOs (p95 leitura < 300 ms, escrita < 1 s, erro < 0,1%). Resultado vira linha em `resilience_exercises (kind='load')`.

## Modelo (a calibrar com dados reais)
| Recurso | Sinal | Gatilho de ação |
|---|---|---|
| API (CPU) | CPU média > 60% por 15 min | +1 réplica (HPA) |
| Workers de cena | profundidade da fila `generation-scene` > 200 por 10 min | escalar workers (`WORKER_CONCURRENCY_SCALE`) |
| Postgres | conexões > 70%, replica lag > 5 s | pool/PgBouncer, réplica de leitura (Fase 6: `readPool`) |
| Redis | memória > 70% | scale up; revisar TTLs |
| S3/CDN | custo e egress | ver `docs/FINOPS.md` |
| IA | custo/dia > 3× média 7 d | guardrail (kill switch opcional) |

## Previsão
`datascienceService.forecastAiCost()` (job a cada 6 h) e crescimento de usuários (`board.compute`) alimentam a revisão trimestral: capacidade para 2× o volume atual com folga de 30%.

## Estado
Os números acima são **hipóteses de projeto**, não medidas de produção. Sem um ambiente de staging com carga real, os limiares precisam ser calibrados após o primeiro teste mensal.
