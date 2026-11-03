# Arquitetura — NexusReel backend (Fase 6)

## Visão geral

```
                         ┌──────────────────────────────┐
  App/PWA (front) ─────▶ │  ALB (TLS 1.3) → API Fastify │──┐  /api/v1/* (JWT 15 min / API key nxr_…)
  Redes (webhooks) ────▶ │  /webhooks/* /integrations/* │  │  /r/:linkId (redirect afiliado, cache Redis)
  Prometheus ──────────▶ │  /metrics /healthz /readyz   │  │  /admin/queues (Bull Board, admin+TOTP)
                         └──────┬───────────────┬───────┘  │
                                │ SQL (RLS)     │ enqueue  │
                         ┌──────▼─────┐   ┌─────▼──────────▼─────┐        ┌────────────────────┐
                         │ Postgres 16│   │ Redis 7 (noeviction) │◀──────▶│ Workers (BullMQ)    │
                         │ +réplica   │   │ filas, cache, rate   │        │ 13 filas + DLQs     │
                         └────────────┘   │ limit, refresh, idem.│        │ FFmpeg, provedores  │
                                          └──────────────────────┘        └──┬─────────┬────────┘
                                                                              │         │
                                       S3 (uploads/videos/exports) ◀──────────┘         ▼
                                       CloudFront (vídeos)                     IA (Kling/ElevenLabs/OpenAI)
                                                                               Plataformas (TikTok, YouTube, IG, Shopee, Temu, OLX, ML)
                                                                               Stripe / Pix (Mercado Pago, Pagar.me)
```

Dois processos com a **mesma imagem**: `dist/server.js` (HTTP) e `dist/worker.js` (filas). Em dev, `EMBED_WORKERS=true` junta os dois. `WORKER_QUEUES=generation-assemble,dubbing-video` dedica um pool (CPU-bound/FFmpeg) com autoscaling próprio.

## Camadas

`routes (zod + controllers finos) → services (regra de negócio) → repositories (SQL `pg`) → db`. Módulos em `src/modules/<domínio>`; integrações externas em `src/integrations/<plataforma>/{oauth,publish,webhooks}.ts`; provedores de IA em `src/providers/ai`; armazenamento em `src/providers/storage.ts` (S3 ou disco local assinado). Dependência circular entre geração e lotes é evitada por `b2b/hooks.ts` (registro de ganchos).

| Módulo | Responsabilidade |
|---|---|
| auth | registro (idade/LGPD), login Argon2id + lockout, refresh rotativo com detecção de reuso, OAuth social, magic link, TOTP |
| users / compliance | perfil, consentimentos versionados, exportação assíncrona, exclusão agendada (30 d) e hard delete |
| projects / generation | projeto → storyboard → cenas **encadeadas** (último frame da cena anterior) → montagem FFmpeg → versões |
| dubbing | dublagem/legendas en/es (5 créditos/idioma, estorno em falha) |
| integrations / publication | OAuth das 7 plataformas, tokens AES‑256‑GCM, publicação **sempre em worker** com adaptação FFmpeg por plataforma |
| marketplace | templates, moderação, compra atômica com créditos (taxa 20%), avaliações, receita |
| affiliates | links `/r/:id`, buffer Redis de cliques, conversão por webhook HMAC, comissão (6%/5% − 10% de taxa) |
| payments | Stripe (assinatura/créditos), Pix, webhooks idempotentes, saques (mín. R$50; <R$500 automático) |
| b2b | catálogos, importação CSV/JSON (anti CSV‑injection), lotes de geração/publicação, API keys com escopo |
| admin / flags / analytics | métricas de negócio, moderação, auditoria, feature flags/kill switches, ingestão de eventos |

## Fluxos críticos

**Geração (pipeline).** `POST /projects/:id/storyboard {pipeline:true}` → fila `generation-storyboard` → cria cenas → `generation-scene` (cena 0) → ao concluir enfileira a cena i+1 com `last_frame` da anterior → após a última, `generation-assemble` → `projects.status='ready'` e hook `onProjectDone` (atualiza `catalog_items`/`batch_jobs`). Falha de cena: 3 tentativas com backoff exponencial; na última, a cena fica `error` (sem derrubar as demais) e o usuário pode `regenerate`.

**Publicação.** `POST /publications` valida **tudo antes de enfileirar** (kill switch → 503, conta não conectada → 409, metadados → 422, idioma pronto) e cria uma `publication` + job por plataforma. O worker: recheca o kill switch, aplica circuit breaker por plataforma, renova token (lock Redis), adapta o vídeo (9:16 1080×1920, H.264/AAC, duração/bitrate p/ caber no limite), valida regras da plataforma, envia, **persiste `provider_job_id` antes de qualquer polling** (retry retoma o polling → nunca duplica o post), faz polling e grava `external_url`. OLX depende do YouTube (criado automaticamente como *não listado*).

**Dinheiro.** Toda mutação monetária usa `UPDATE … WHERE saldo >= x` atômico, `transactions` com `UNIQUE(source, external_ref)` (idempotência a nível de banco), `Idempotency-Key` obrigatório nas rotas de compra/saque/checkout e webhooks com assinatura + deduplicação em `webhook_events`.

## Decisões e justificativa

- **Fastify + `pg` cru + zod** (em vez de Nest/Prisma): menor overhead por requisição (meta p95 < 150 ms no redirect), SQL explícito para RLS (`SET LOCAL ROLE` + `set_config`) e sem binários de engine; contratos validados na borda com zod.
- **BullMQ/Redis**: filas com prioridade por plano, retries/backoff, repetíveis (manutenção), métricas e Bull Board prontos; Redis já é necessário para rate limit/idempotência/refresh.
- **Postgres 16 + RLS**: isolamento por usuário garantido pelo banco (defesa em profundidade) além do filtro na aplicação; extensões `pgcrypto`, `pg_trgm`, `uuid-ossp`.
- **Provedores por capacidade** (`VideoProvider`, `TtsProvider`, `ModerationProvider`) com fallback e circuit breaker (3 falhas/5 min → aberto 10 min) e orçamento diário por plano (`ai_budget_exceeded`).
- **Mock com FFmpeg real**: em dev/CI todo o pipeline roda sem credenciais; o vídeo "gerado" é um MP4 real que encadeia o último frame.

## Limites conhecidos

Chamadas reais às APIs de TikTok/YouTube/Instagram/Shopee/Mercado Livre/Stripe/Kling/ElevenLabs foram escritas conforme a documentação, **mas não foram executadas** (exigem credenciais/contas aprovadas). Temu e OLX têm APIs restritas: o código real é um placeholder marcado com `TODO`. Ver o checklist final.
