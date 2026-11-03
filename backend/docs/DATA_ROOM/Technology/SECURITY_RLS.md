# RLS e escalonamentos — inventário (gerado)

> **Gerado** por `npx tsx scripts/gen-rls-doc.ts` a partir do código. Não edite à mão: o CI roda `--check`.
> Teste de garantia: `tests/21-rls-hardening.test.ts` (e `tests/20-idor-exposure.test.ts` na camada HTTP).

## Modelo
- **Papel:** toda conexão da aplicação assume `nexus_app` (`DB_APP_ROLE`), que **não** é dono das tabelas, então o RLS vale para todas as consultas. A troca de papel é **fail-closed**: se o `SET ROLE` falhar, a consulta não roda (`src/db/pool.ts`). Em produção, `DB_APP_ROLE` vazio impede o boot.
- **Contexto por requisição** (`src/db/context.ts`), aplicado em cada checkout de conexão: `app.user_id`, `app.is_admin` e `app.system`.
  - Requisição sem login começa **anônima** (sem usuário e sem bypass).
  - `authenticate()` troca para o usuário; `requireAdmin` troca para admin.
  - Workers, jobs e CLIs rodam como `system`.
- **Policies** (migrations 0002, 0004 e 0007):
  - **Dono:** `user_id`/`owner_id` = usuário, ou herança do pai (cenas, itens de catálogo, versões, logs, jobs de publicação, cliques/conversões).
  - **Leitura pública por policy:** templates aprovados e avaliações. Perfis públicos de terceiros só pela view `user_public_profiles` (`id`, `name`, `creator_verified`).
  - **Trilhas** (`audit_logs`, `webhook_events`, `analytics_events`): qualquer contexto grava, só admin/system lê.
  - **Dados internos** (incidentes, waitlist, parceiros, board, DPIA, FinOps, SLO etc.): só admin/system.
  - **Configuração** (preços, flags, settings, experimentos, campanhas): leitura pela app; escrita só admin/system.
  - **Colaboração** (0017 + 0021): membros aceitos LEEM timeline, histórico e comentários; só dono/editor ESCREVEM na timeline (`collab_can_edit`); `timeline_ops` é só acréscimo em nome próprio; comentário só em nome próprio, texto só o autor muda (trigger `comments_guard`), apagar = autor ou dono; convites/colaboradores só o dono. Teste: `tests/35-rls-collab-reaudit.test.ts`.
  - **Cobertura:** todas as tabelas do schema público têm RLS. A exceção é `schema_migrations`, que é do migrador — a role da aplicação não tem nenhum privilégio nela (0021).

## Rotas públicas (sem autenticação obrigatória) — 47
| Rota | Escopo | Motivo |
| --- | --- | --- |
| `GET /api/v1/billing/catalog` | anon | catálogo de planos/pacotes (configuração) |
| `GET /api/v1/cloud/:provider/callback` | **system** | Módulo 5 — OAuth de nuvem do usuário: identificado pelo `state` secreto de uso único (Redis, 10 min) + PKCE; grava só a conexão desse usuário |
| `GET /api/v1/collab/ws` | **system** | Módulo 8 — WebSocket: login pelo ticket JWT de 60 s/uso único na 1ª mensagem; papel conferido no servidor a cada operação |
| `GET /api/v1/flags` | anon | flags públicas; com JWT válido vira usuário |
| `GET /api/v1/i18n/profile` | anon | perfil regional (configuração) |
| `GET /api/v1/integrations/:platform/callback` | **system** | OAuth de plataforma: o usuário é identificado pelo `state` secreto de uso único (Redis, 10 min), não por JWT |
| `GET /api/v1/integrations/instagram/webhook` | anon | handshake de verificação (sem banco) |
| `GET /api/v1/live/:sessionId/watch` | **system** | Módulo 10 — feed público da live: só sessões no ar; devolve título, rótulo "IA", aviso, avatar sintético e produtos daquele catálogo (sem dado do lojista); soma a exibição do rótulo |
| `GET /api/v1/notifications/unsubscribe` | **system** | descadastro por link com HMAC do usuário (sem login) |
| `GET /api/v1/pricing` | anon | preços regionais; com JWT válido vira usuário |
| `GET /api/v1/pricing/regions` | anon | regiões de preço (configuração) |
| `GET /api/v1/public/sitemap.xml` | anon | sitemap de templates aprovados |
| `GET /api/v1/public/templates/:id` | anon | página SEO de template aprovado |
| `GET /api/v1/ref/:code` | **system** | clique em link de indicação: resolve o código de outra pessoa (sem revelar existência) |
| `GET /api/v1/s/:token` | **system** | Módulo 7 — link de e-mail: o token HMAC (id + validade) é a credencial; responde só nome do arquivo, remetente e validade daquele envio |
| `GET /api/v1/s/:token/download` | **system** | Módulo 7 — download pelo link HMAC (sem senha): URL assinada de 5 min daquele arquivo; conta o acesso |
| `GET /api/v1/status` | **system** | status page lê incidentes (tabela interna) e devolve só campos públicos |
| `GET /api/v1/status.rss` | **system** | idem /status em RSS |
| `GET /api/v1/status/confirm/:token` | **system** | confirmação da inscrição pelo token secreto |
| `GET /api/v1/templates` | anon | vitrine: só templates aprovados (policy templates_read); com JWT válido vira usuário |
| `GET /api/v1/templates/:id` | anon | detalhe público de template aprovado |
| `GET /api/v1/waitlist/:code` | **system** | posição na fila pelo código secreto da própria inscrição |
| `GET /healthz` | anon | liveness (sem dados) |
| `GET /metrics` | anon | métricas Prometheus (token/CIDR), sem consultas a tabelas de usuário |
| `GET /r/:linkId` | **system** | clique em link de afiliado: registra o clique do link de outra pessoa e redireciona |
| `GET /readyz` | anon | readiness: SELECT 1 |
| `POST /api/v1/analytics/events` | anon | telemetria; a gravação usa systemScope próprio após validar e pseudonimizar |
| `POST /api/v1/attribution/touch` | **system** | toques de atribuição de visitantes anônimos (anon_id) — só grava/deduplica |
| `POST /api/v1/auth/firebase` | **system** | vincula ou cria a conta pela identidade do Firebase (ID token conferido, e-mail verificado) e cria a sessão |
| `POST /api/v1/auth/login` | **system** | busca a conta pelo e-mail e cria a sessão (resposta não revela se o e-mail existe) |
| `POST /api/v1/auth/logout` | **system** | revoga o refresh token informado (pelo hash) |
| `POST /api/v1/auth/magic-link` | **system** | gera link de acesso para o e-mail (sem revelar existência) |
| `POST /api/v1/auth/magic-link/verify` | **system** | troca o token de uso único por sessão |
| `POST /api/v1/auth/oauth/:provider/callback` | **system** | vincula ou cria a conta pela identidade externa verificada |
| `POST /api/v1/auth/refresh` | **system** | valida o refresh token pelo hash e rotaciona a sessão |
| `POST /api/v1/auth/register` | **system** | cria a conta, consentimentos e sessão antes de existir usuário; aplica código de indicação/parceiro |
| `POST /api/v1/integrations/:platform/webhook` | **system** | webhook de plataforma com assinatura verificada |
| `POST /api/v1/notifications/unsubscribe` | **system** | descadastro one-click (RFC 8058) com HMAC |
| `POST /api/v1/referrals/click` | **system** | idem /ref/:code, via app |
| `POST /api/v1/s/:token/download` | **system** | Módulo 7 — download pelo link HMAC com senha (argon2id; 5 tentativas por link a cada 15 min + limite por IP) |
| `POST /api/v1/seal/verify` | anon | Módulo 10 — verificação pública do selo C2PA lendo o manifest embutido no arquivo enviado; não lê nem grava tabela de usuário |
| `POST /api/v1/status/subscribe` | **system** | inscrição na status page (tabela interna; confirmação por e-mail) |
| `POST /api/v1/waitlist` | **system** | tabela interna; resposta não devolve dados de outra inscrição |
| `POST /api/v1/webhooks/affiliates/conversion` | **system** | conversão de afiliado com HMAC verificado; credita o dono do link |
| `POST /api/v1/webhooks/local` | **system** | webhook de métodos locais (OXXO etc.) com HMAC verificado |
| `POST /api/v1/webhooks/pix` | **system** | webhook Pix com HMAC verificado |
| `POST /api/v1/webhooks/stripe` | **system** | webhook Stripe com assinatura verificada; credita assinatura/créditos do dono |

## Escalonamentos pontuais em código (`systemScope`) — 11
| Onde | Motivo |
| --- | --- |
| `src/middlewares/auth.ts` | auth: estado da conta antes de identificar a requisição |
| `src/middlewares/auth.ts` | auth: resolver API key pelo hash |
| `src/middlewares/auth.ts` | auth: last_used_at da API key |
| `src/modules/analytics/analytics.service.ts` | analytics: pipeline de telemetria grava eventos já validados/pseudonimizados |
| `src/modules/recommendations/recommendations.service.ts` | recs: coocorrência agregada entre usuários (devolve só templates aprovados) |
| `src/modules/recommendations/recommendations.service.ts` | recs: taxa de sucesso agregada por plataforma no nicho |
| `src/modules/recommendations/recommendations.service.ts` | recs: conversão agregada de afiliados por plataforma |
| `src/modules/recommendations/recommendations.service.ts` | recs: cliques agregados por horário (próprios ou coorte ≥5 usuários) |
| `src/modules/recommendations/recommendations.service.ts` | recs: nº de usuários distintos da coorte (k-anonimato ≥5) |
| `src/modules/referrals/referrals.service.ts` | referral: resolver código de terceiro e checar antifraude entre contas |
| `src/providers/ai/router.ts` | ai_usage: contabilidade de custo + total diário global do guardrail |

## Transações como system (`asSystem`) — 186 chamadas em 39 arquivos
Usadas por workers (geração, dublagem, publicação), por movimentação financeira entre contas (compra de template credita o criador, indicação credita os dois lados, webhooks de pagamento) e por jobs de manutenção. A regra: o handler valida antes quem pode pedir a operação (dono do recurso, assinatura do webhook, admin) e só então escala.
| Arquivo | Chamadas |
| --- | --- |
| `src/cli/import-music.ts` | 1 |
| `src/modules/accessibility/accessibilityService.ts` | 5 |
| `src/modules/accessibility/messages.ts` | 1 |
| `src/modules/affiliates/affiliates.service.ts` | 1 |
| `src/modules/agent/agentService.ts` | 8 |
| `src/modules/assets/derivedAssetsService.ts` | 7 |
| `src/modules/attribution/attribution.service.ts` | 1 |
| `src/modules/audio/audio.service.ts` | 9 |
| `src/modules/audio/musicLibrary.ts` | 1 |
| `src/modules/audio/voiceStudio.ts` | 6 |
| `src/modules/authenticity/authenticityService.ts` | 7 |
| `src/modules/background/backgroundService.ts` | 7 |
| `src/modules/background/externalConsent.ts` | 1 |
| `src/modules/collaboration/collaborationService.ts` | 10 |
| `src/modules/collaboration/permissions.ts` | 2 |
| `src/modules/collaboration/ws.ts` | 1 |
| `src/modules/compliance/compliance.service.ts` | 3 |
| `src/modules/dubbing/dubbing.service.ts` | 6 |
| `src/modules/elements/elementInserter.ts` | 6 |
| `src/modules/emailShare/emailShareService.ts` | 6 |
| `src/modules/experiments/experiments.service.ts` | 5 |
| `src/modules/export/flag.ts` | 1 |
| `src/modules/export/storageExportService.ts` | 7 |
| `src/modules/generation/generation.service.ts` | 16 |
| `src/modules/insights/predictiveInsights.ts` | 2 |
| `src/modules/live/liveCommerceService.ts` | 3 |
| `src/modules/m10/common.ts` | 1 |
| `src/modules/marketplace/marketplace.service.ts` | 2 |
| `src/modules/merge/mergeService.ts` | 6 |
| `src/modules/monetization/monetization.service.ts` | 3 |
| `src/modules/partners/partners.service.ts` | 3 |
| `src/modules/payments/payments.service.ts` | 6 |
| `src/modules/projects/projects.purge.ts` | 11 |
| `src/modules/publication/publication.service.ts` | 3 |
| `src/modules/referrals/referrals.service.ts` | 3 |
| `src/modules/retention/lifecycle.service.ts` | 1 |
| `src/modules/retention/retention.service.ts` | 3 |
| `src/modules/timeline/timelineService.ts` | 4 |
| `src/modules/transcript/transcriptService.ts` | 17 |

## Como adicionar
1. **Tabela nova com dado de usuário:** coloque a policy na mesma migration. O teste 21 falha se alguma tabela ficar sem RLS.
2. **Rota pública nova:** classifique-a em `PUBLIC_ROUTE_DB_SCOPE`. O teste 21 falha se alguma rota pública do OpenAPI não estiver classificada.
3. **Leitura legítima entre usuários numa rota autenticada:** use `systemScope('motivo', …)` ou `asSystem`, devolva só agregados ou campos públicos e rode `npm run rls:docs`.
