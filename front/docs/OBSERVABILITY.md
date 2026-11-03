# Observabilidade, kill switches e operação

## Logs estruturados
JSON por linha: `{ts, level, event, traceId, spanId, ...campos}`. **Redação automática** de `token`, `authorization`, `password`, `email`, `cpf` etc. (`logger.ts` / `redact`). Sinks plugáveis (console, memória, Datadog/Sentry — stubs).

## Métricas (`metrics.ts`)
| Nome | Tipo | Quando |
|---|---|---|
| `generation_duration_ms` | histograma | fim da geração |
| `generation_failures_total` | contador | cena/vídeo com falha |
| `publication_success_total` / `publication_failure_total` | contador (label `platform`) | fim de cada publicação |
| `ai_cost_per_project` | gauge/histograma | custo estimado por projeto |
| `queue_depth` | gauge | fila B2B/geração |

## Tracing
Trace raiz por geração (`genBegin`/`genEnd`) com spans por etapa (roteiro, cena i, montagem). Propagação W3C `traceparent` (stub). OpenTelemetry: trocar o exporter em `tracing.ts` (TODO).

## Painel de desenvolvimento `/__debug`
Oculto. Abrir com `#/__debug` na URL (build DEV) ou Configurações → Diagnóstico (modo dev). Mostra logs recentes, métricas, última trace e flags, além de botões de **injeção de falhas** (dublagem/publicação) para testar retry e circuit breaker.

## Integrações (stubs)
| Serviço | Uso | Status |
|---|---|---|
| Sentry | erros web e móvel (`@sentry/capacitor`) | 🔧 DSN + sourcemaps |
| Datadog | logs/métricas via HTTP intake | 🔧 chave de API |
| OpenTelemetry | traces OTLP | 🔧 collector |
| PostHog | analytics de produto (só com consentimento) | 🔧 chave de projeto |

## Feature flags e kill switches
Chaves semeadas: `generation_enabled`, `publish_tiktok|youtube|instagram|shopee|temu|olx|mercadolivre`, `affiliates_enabled`, `dubbing_enabled`, `new_player_hls`. Campos: `value` (protótipo; `enabled` no TS) · `regions` · `plans` · `rolloutPercent` (bucket FNV por `userId`, estável). Desligar `generation_enabled` → tela de **manutenção** amigável (sem perder rascunhos). Desligar `publish_<plataforma>` → publicação daquela plataforma é bloqueada com mensagem, as demais seguem.

## Resiliência
`withRetry` (backoff exponencial + jitter) só em operações idempotentes (dublagem, CDN, sincronização offline). **Publicação não é reexecutada automaticamente** (evita post duplicado) — retry manual. `CircuitBreaker` por plataforma (abre após 4 falhas, 20 s) e para dublagem (3 falhas, 15 s) com fallback e mensagem ao usuário.

## Runbook rápido
1. Alerta de falha de geração > 5% → desligar `generation_enabled` (ou `rolloutPercent`) → investigar traces. 2. Plataforma instável → desligar `publish_<x>`. 3. Pós-incidente: registrar no `AuditLog`, reativar gradualmente (1% → 100%).
