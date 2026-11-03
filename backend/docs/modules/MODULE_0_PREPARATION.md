# Módulo 0 — Preparação

**Objetivo:** deixar banco e tipos prontos para os módulos 1–11 sem mudar o comportamento do app.
**Migrations:** `0008_module0_preparation` (instantânea) e `0009_scene_version_unique` (sem transação, sem travar a tabela).
**RFC:** `docs/RFC/2026-01-scene-versioning.md`. **Teste:** `tests/22-module0-preparation.test.ts` (9 casos).

## O que muda
| Item | Detalhe | Efeito no app hoje |
|---|---|---|
| `scenes.version` | `integer NOT NULL DEFAULT 1` + `CHECK (version >= 1)` | nenhum: toda cena existente fica com 1 |
| `scenes.derived_from_scene_id` | `uuid NULL`, FK `scenes(id)` `ON DELETE SET NULL`, índice parcial `idx_scenes_derived_from` | nenhum: sempre nulo até o Módulo 2 |
| Unicidade de cena | `(project_id, index)` → `(project_id, index, version)` | equivalente enquanto não houver derivados |
| Leitura de cenas | `projectsRepo.scenes()` devolve, por posição, só a versão mais recente; `sceneVersions()` lista o histórico | idêntico hoje (só existe a versão 1). O contrato da API não muda: `version` não aparece no JSON |
| `idx_scenes_chained_from` | índice parcial em `chained_from_scene_id` (faltava desde a 0001) | apagar cenas e projetos fica ~150× mais rápido (ver evidências) |
| `consents.audio_sample_url` | `text NULL`. Guarda a **chave do objeto** no storage, nunca URL pública; a leitura gera URL assinada (R5) | nenhum |
| `consents.verified_at` | `timestamptz NULL` | nenhum |
| Tipos de consentimento | + `voice_clone`, `person_image`, `avatar_live`, `external_provider` no CHECK do banco, no tipo do backend (`src/modules/compliance/consent.types.ts`) e no `ConsentType` do frontend (`src/types/phase5.ts`, só amplia a união) | a API pública (`POST /users/me/consents`) segue aceitando só os 4 antigos; cada tipo novo é liberado pelo módulo que o usa |
| 17 flags `ff_*` | `enabled=false`, `rollout_percent=0`, `ON CONFLICT DO NOTHING` (os padrões da tabela são ligado/100%, por isso explícito) | nenhum: todas avaliam `false` para qualquer usuário, plano ou região |

**Código de aplicação alterado:** só `projectsRepo.scenes()` (uma consulta, com resultado idêntico hoje) e o migrador (suporte a migration sem transação). As duas mudanças existem para eliminar os riscos de cenas repetidas e de volume alto, e foram aprovadas no Checkpoint 0.

## Por que duas migrations
- **0008 — instantânea, numa transação.** `ADD COLUMN` com default constante só altera metadados. As três constraints entram `NOT VALID`, sem varrer a tabela. `SET LOCAL lock_timeout = '5s'`: se outra transação longa estiver segurando a tabela, a migration desiste em vez de enfileirar todas as escritas atrás dela.
- **0009 — sem transação (`-- migrate:no-transaction`), um comando por `-- step`.**
  - Cria os índices com `CREATE INDEX CONCURRENTLY`, que não bloqueia escritas.
  - Anexa a nova unicidade com `ADD CONSTRAINT … USING INDEX` e solta a antiga, num único bloco atômico de lock curto.
  - Valida as constraints com `VALIDATE CONSTRAINT`, que deixa leituras e escritas seguirem.
  - **Idempotente:** índices de construção têm nome `*_build` e são descartados e refeitos. Se a migration cair no meio, basta rodar `npm run migrate` de novo.
- **R8 (sem DROP):** a única remoção é a da constraint de unicidade antiga, substituída por uma mais ampla. Nenhuma coluna ou dado é removido. A exceção está justificada na RFC.

## Estado atual (levantado antes do Módulo 0)
- **Tabelas relevantes:**
  - `scenes`: unicidade por posição; status `pending | generating | done | error`; encadeamento por `chained_from_scene_id`.
  - `consents`: id, user_id, type, version, accepted_at, revoked_at, ip_hash, jurisdiction, user_agent_hash, proof_hash.
  - `feature_flags`: key, description, enabled, rollout_percent, regions[], plans[].
  - `ai_usage`: user_id, project_id, provider, operation, cost_cents, latency_ms, status, created_at — já atende a R11.
  - Todas com RLS (`docs/SECURITY_RLS.md`).
- **Filas BullMQ** (`src/queues/index.ts`): `generation-storyboard`, `generation-scene`, `generation-assemble`, `dubbing-video`, `batch-generate`, `batch-publish`, `affiliates-tracking`, `compliance-export`, `compliance-deletion`, `emails`, `webhooks-stripe`, `webhooks-affiliates`, `maintenance`, `growth-jobs`, `ops-jobs` e `publication-<plataforma>` (7). Todas têm retry exponencial (3×), DLQ `<fila>-dlq` e as métricas `queue_depth`, `job_duration_ms` e `job_failures_total`.
- **Workers** (`src/workers.ts`): um por fila acima, selecionáveis por `WORKER_QUEUES`.
- **Flags existentes** (valor/rollout): `affiliates_enabled` on, `ai_cost_router` off, `ai_disclosure_visible` on, `ai_kill_switch` off, `ai_scene_cache` off, `dubbing_enabled` on, `experiments_enabled` on, `generation_enabled` on, `kyc_enforced` on, `lifecycle_enabled` on, `new_player_hls` on, `paywall_contextual` on, `publish_{instagram,mercadolivre,olx,shopee,temu,tiktok,youtube}` on, `recs_personalized` on, `referral_enabled` on, `release_freeze` off, `waitlist_open` on. Mais as 17 `ff_*` off/0%.
- **`export_jobs` → `destination_exports`:** fica para a migration do Módulo 5, sem impacto no legado.

## Segurança
- **RLS:** as colunas novas herdam as policies que já existem (`scenes_owner` pelo projeto; `consents_owner` por `user_id`). O teste 22 confirma que outro usuário e o anônimo não leem nem gravam.
- **PII:** a amostra de voz é dado biométrico. Fica no storage privado; no banco só a chave. Nenhum log novo, segredo ou dado pessoal.

## Aplicar e reverter
```bash
npm run migrate        # aplica 0008 e 0009 (0009 roda sem transação; pode ser repetida se cair no meio)
npm run migrate:down   # reverte a última: primeiro a 0009, depois a 0008
```
- **Rollback da 0009:** volta à unicidade antiga, também sem travar a tabela, e recusa rodar se houver cena com `version > 1`.
- **Rollback da 0008:** recusa rodar se houver cena derivada ou consentimento de tipo novo. Nesse caso, desligue as flags e trate esses registros antes.

## Evidências (PostgreSQL 16 local — `audit/evidence/module0/migration-roundtrip.txt`)
| Verificação | Resultado |
|---|---|
| `up` 0001→0009, `down` 0009, `down` 0008, `up` | OK; schema e constraints conferidos (`convalidated = true`, índices válidos) |
| 0009 refeita após "cair no meio" (sobra de `*_build` + registro apagado) | conclui sem índice duplicado |
| Rollback com consentimento `voice_clone` gravado | bloqueado com mensagem; liberado depois de remover o dado |
| **Volume: 800 mil cenas (190 MB) com escritas contínuas** | durante a 0009, a maior espera de uma escrita foi **14 ms** (linha de base: 13 ms). A abordagem antiga (`ALTER TABLE … ADD UNIQUE`) segurou as escritas por **329 ms** nesse volume, tempo que cresce linearmente com a tabela |
| `lock_timeout` com transação longa segurando `scenes` | a 0009 desiste em **5,7 s** sem deixar índice inválido; rodar de novo conclui |
| Apagar 200 cenas sem e com `idx_scenes_chained_from` | **14,0 s → 0,096 s** |
| Suíte completa, `tsc`, lint, OpenAPI (sem mudança), SLO, compliance, taxonomia, RLS, data room; `tsc` do frontend | OK |

**Não verificável aqui:**
- **Staging e produção:** não tenho acesso a esses ambientes.
- **Testcontainers:** o projeto usa PostgreSQL e Redis reais via `scripts/infra-local.sh`, com o banco recriado a cada execução. Esse é o equivalente adotado para a R9.

## Riscos residuais
- `ADD COLUMN` e `DROP CONSTRAINT` ainda pedem um lock exclusivo de milissegundos. Com `lock_timeout`, o pior caso é a migration falhar e precisar ser repetida, nunca travar o app.
- `CREATE INDEX CONCURRENTLY` leva mais tempo total que o índice comum (duas passadas na tabela). Isso aumenta a duração do deploy, não o impacto no usuário.
