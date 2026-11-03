# ADR 0003 — SLOs como código
**Status:** aceito · **Data:** 2026-10-20 (Fase 8)
## Contexto
Precisamos de orçamento de erro e alertas multi-janela consistentes entre 7 serviços, sem regras escritas à mão.
## Decisão
`slo/*.slo.yaml` (esquema Sloth `prometheus/v1`) → `tools/slo-generator` gera regras Prometheus e dashboards; CI falha se os artefatos estiverem defasados. O app também mede SLIs (`slo_samples`) para o freeze de releases independente do Prometheus.
## Alternativas
Sloth/Pyrra como binários (dependência extra e sem acesso do app ao orçamento); regras manuais (divergência).
## Consequências
Duas implementações do cálculo (PromQL gerado e TypeScript) — mantidas coerentes por testes com cenários de burn; regras ainda não validadas com `promtool` (DEBT #2).
