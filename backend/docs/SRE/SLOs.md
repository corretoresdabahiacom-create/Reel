# SLOs e orçamento de erro

Fonte da verdade: `slo/*.slo.yaml` (15 SLOs, 7 serviços). `npm run slo:generate` produz as regras Prometheus (`infra/observability/slo-rules.generated.yml`) e os dashboards (`dashboards/sre/`); `npm run slo:check` falha no CI se estiverem defasados. Em runtime, o app também mede os SLIs sozinho (`src/modules/sre/record.ts` → `slo_samples`) e expõe `GET /api/v1/admin/ops/slo`.

## Catálogo

| Serviço | SLO (id) | Objetivo | SLI |
|---|---|---|---|
| API | api-availability | 99,9% / mês | respostas não-5xx |
| API | api-latency-read | 95% < 300 ms | GET abaixo de 300 ms (p95 < 300 ms) |
| API | api-latency-write | 95% < 1 s | escritas abaixo de 1 s (p95 < 1 s) |
| Geração | generation-success-rate | ≥ 98% | jobs de cena/montagem concluídos |
| Geração | generation-scene-latency | p95 < 90 s | duração do job de cena |
| Publicação | publication-success-rate | ≥ 97% | publicações concluídas / tentadas |
| Publicação | publication-latency | p95 < 5 min | pedido → publicado |
| Dublagem | dubbing-success-rate | ≥ 97% | |
| Dublagem | dubbing-latency | p95 < 10 min | |
| Filas | queues-depth | profundidade < 500 | amostras com fila < 500 |
| Filas | queues-dlq | DLQ < 50 | amostras com DLQ < 50 |
| CDN | cdn-availability | 99,95% | |
| CDN | cdn-thumbnail-latency | p95 < 200 ms | |
| Login | auth-availability | 99,95% | |
| Login | auth-latency | p95 < 500 ms | |

## Orçamento de erro e freeze

- Orçamento = 1 − objetivo (API: 0,1%/mês ≈ 43 min). Consumo = erros / (total × orçamento).
- **Freeze:** orçamento restante < 25% em qualquer SLO governante (api-availability, auth-availability, generation-success-rate, publication-success-rate) → flag `release_freeze` liga automaticamente; só correções de confiabilidade (`type=fix`) passam no release gate. Orçamento esgotado (≤ 0) exige override explícito do SRE com justificativa auditada (`POST /admin/ops/release-gate/unfreeze`).
- Deploy: `infra/scripts/release-gate.sh` (exit 1 = bloqueado) antes do pipeline.

## Alertas de burn rate (multi-janela)

| Janela longa / curta | Burn | Ação |
|---|---|---|
| 1 h / 5 min | > 14,4× | **page** (esgota 2% do orçamento em 1 h) |
| 6 h / 30 min | > 6× | **page** (5% em 6 h) |
| 3 d / 6 h | > 1× | **ticket** |

Duas janelas evitam alerta por pico curto e fecham rápido após a recuperação. Alerta de página abre incidente Sev2 automaticamente (`source=slo`).

## Limites conhecidos
- Regras Prometheus geradas foram validadas por parse YAML e testes de estrutura; **não** passaram por `promtool` nem rodaram contra um Prometheus real.
- Metas de latência de CDN dependem das métricas do provedor de CDN (não coletadas em código aqui).
- Os SLOs precisam de ≥ 30 dias de dados reais para o orçamento mensal ser significativo; antes disso o status é indicativo.
