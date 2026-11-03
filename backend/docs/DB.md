# Banco de dados (PostgreSQL 16)

Migrations SQL versionadas e **reversíveis** em `migrations/NNNN_nome.{up,down}.sql`, aplicadas por `src/db/migrate.ts` (advisory lock → um migrador por vez; modos `up | down | dry | status`; arquivo iniciado por `-- migrate:no-transaction` roda fora de transação, um comando por `-- step`, para `CREATE INDEX CONCURRENTLY`). O CI executa `up → down×3 → up`.

| # | Migration | Conteúdo |
|---|---|---|
| 0001 | init | extensões `pgcrypto`, `pg_trgm`, `uuid-ossp`; 34 tabelas; índices (inclui GIN trigram em `templates.name`, únicos parciais p/ soft delete) |
| 0002 | rls | papel `nexus_app`; funções `app_uid()/app_is_admin()/app_system()`; policies em `projects`, `scenes`, `publications`, `templates` |
| 0003 | seed_flags | feature flags e kill switches iniciais + `settings.platform` |
| 0004 | growth | Fase 7: experimentos, recomendação, retenção/ciclo de vida, monetização regional, indicação, atribuição, parceiros, analytics; RLS por dono nas tabelas de growth |
| 0005 | growth_seed | regiões de preço, catálogo de 10 experimentos, campanhas, settings de growth |
| 0006 | operations | Fase 8: SLOs, incidentes, status page, on-call, FinOps, compliance (DPIA/ROPA/AI Act), KYC/sanções, residência, board, BCP, subprocessadores, contratos |
| 0007 | rls_full | auditoria pós-Fase 8: RLS em **todas** as tabelas (dono, herança do pai, trilhas só-escrita, internas só admin/system, configuração só-leitura para a app); view `user_public_profiles` |
| 0008 | module0_preparation | Módulo 0 (instantânea): `scenes.version` (padrão 1) e `scenes.derived_from_scene_id`; constraints `NOT VALID`; `consents.audio_sample_url` (chave no storage, nunca URL pública) e `consents.verified_at`; 4 tipos novos de consentimento; 17 flags `ff_*` desligadas. Rollback bloqueia se houver cena derivada ou consentimento de tipo novo (`docs/modules/MODULE_0_PREPARATION.md`) |
| 0009 | scene_version_unique | **sem transação**: índices `CONCURRENTLY` (`idx_scenes_derived_from`, `idx_scenes_chained_from`), unicidade de cena `(project_id, index, version)` anexada `USING INDEX`, validação das constraints da 0008. Idempotente, com `lock_timeout` de 5 s |
| 0010 | audio | Módulo 1 (`ff_audio`): `music_tracks` (biblioteca por região + trilhas geradas), `audio_versions` (três stems em colunas separadas, vídeo e mix novos), `voice_models`, `projects.active_audio_version_id` (FK `NOT VALID`), `consents.challenge_hash`; RLS nas 3 tabelas; seed de 8 faixas sintéticas. Rollback bloqueia se houver dados de áudio de usuários (`docs/modules/AUDIO.md`) |
| 0011 | background | Módulo 2 (`ff_background`): `background_edits` (operação, alvo vídeo/foto, origem, resultado, alfa, cena derivada, provedor, status) com RLS herdado do projeto; `scenes.selected` (versão escolhida no seletor; default false = leitura igual a antes). Rollback bloqueia se houver edições ou versões escolhidas (`docs/modules/BACKGROUND.md`) |
| 0012 | elements | Módulo 3 (`ff_elements`): `element_insertions` (ação insert/replace, tipo pessoa/animal/objeto, referência, consentimento usado, resultado, cena derivada) com RLS herdado do projeto; `scenes.inserted_elements` (jsonb, default `[]`); `consents.evidence_url` (autorização opcional do person_image). Rollback bloqueia se houver dados de usuário (`docs/modules/ELEMENTS.md`) |
| 0013 | merge | Módulo 4 (`ff_merge`): `project_merges` (dono, projetos A e B, `result_project_id` — fonte de verdade da origem de um vídeo unido; não há `mergedFrom` em `projects`), transição pedida/escolhida com as medidas, etapa e progresso; RLS por dono. Rollback bloqueia se houver uniões (`docs/modules/MERGE.md`) |
| 0014 | save | Módulo 5 (`ff_save`): `destination_exports` (um salvamento por destino — aparelho, pasta local, iCloud, Google Drive, Dropbox, OneDrive, Nuvem NexusReel; ZIP por produto com `batch_id`; nome escolhido para não confundir com `data_export_requests`; **não existe `export_jobs`**) e `cloud_connections` (tokens só cifrados em envelope AES-256-GCM com chave do KMS, escopos mínimos; revogar apaga a linha). RLS por dono. Rollback bloqueia se houver conexões ou salvamentos (`docs/modules/SAVE.md`) |
| 0015 | assets | Módulo 6 (`ff_assets`): `derived_assets` (GIF, sticker, wallpaper, multimídia automotiva, screensaver; `cache_key` = sha256 de `user_id` + projeto + vídeo de origem + configuração; arquivo em `derived/<user_id>/`; validade `ASSETS_TTL_DAYS`). RLS por dono. Rollback bloqueia se houver assets (`docs/modules/ASSETS.md`) |
| 0016 | email_share | Módulo 7 (`ff_email`): `email_shares` (link HMAC de até 7 dias, senha opcional em argon2id, destinatários só como HMAC-SHA256 em `recipients_hash`, contagem de acessos, lote B2B por item ou ZIP). RLS por dono. Rollback bloqueia se houver envios (`docs/modules/EMAIL_SHARE.md`) |
| 0017 | collab_timeline | Módulo 8 (`ff_collaboration`/`ff_timeline`): `project_collaborators` (convite preso ao HMAC do e-mail, token só como hash e apagado no aceite), `timeline_tracks`/`timeline_clips` (versão por entidade), `timeline_meta` (revisão), `timeline_snapshots` (auto/manual/fork/restore), `timeline_ops` (histórico e conflitos), `comments` (ancorados no tempo; autor anonimizável). Função `collab_can()` dá acesso ao dono e a colaboradores aceitos; a política de `projects` não mudou. Rollback bloqueia se houver dados (`docs/modules/COLLABORATION.md`) |
| 0018 | transcript_agent | Módulo 9 (`ff_transcript`/`ff_agent`): `transcripts` (palavras com tempo, **cifradas** em `segments_json`; `expires_at` 90 dias; apagadas com o projeto), `transcript_edits` (apagar/substituir → prévia → aplicar), `agent_runs` (comando, plano, prévia, `applied`/`applied_by`). RLS só dono. Rollback bloqueia se houver dados (`docs/modules/TRANSCRIPT_AGENT.md`) |
| 0019 | insights_series_seal_live | Módulo 10 (`ff_insights`/`ff_series`/`ff_seal`/`ff_live`): `predictions` (rótulo fixo `estimativa`, features só agregadas), `series`/`series_episodes` (ordem única adiável, CTA https), `authenticity_records` (C2PA **embutido**: `c2pa_manifest_embedded`, `verify_url` NULL), `live_sessions` (CHECK `ai_label_enabled = true`, opt-in do lojista) e `live_session_events` (aviso de IA registrado). RLS só dono. Rollback bloqueia se houver dados (`docs/modules/INSIGHTS_SERIES_SEAL_LIVE.md`) |
| 0020 | accessibility_teleprompter | Módulo 11 (`ff_accessibility`/`ff_teleprompter`): `accessibility_assets` (legendas animadas, audiodescrição, transcrições SRT/VTT/TXT assinadas; texto cifrado; CHECK: audiodescrição pronta exige revisão; exportações expiram em 90 d) e `teleprompter_sessions` (CHECK: gravação no servidor exige opt-in). RLS só dono. Rollback bloqueia se houver dados (`docs/modules/ACCESSIBILITY_TELEPROMPTER.md`) |
| 0021 | rls_collab_hardening | Reauditoria 2026-10-21 (sem colunas, sem dados): políticas por comando em `timeline_tracks/clips/meta/snapshots` (escrita só dono/editor via `collab_can_edit`), `timeline_ops` só acréscimo em nome próprio, `comments` (autor próprio; texto só o autor — trigger `comments_guard`; apagar = autor/dono), `project_collaborators` (escrita só o dono); `REVOKE ALL ON schema_migrations FROM nexus_app`. Down restaura as políticas de 0017. |

## Regras
- **Soft delete:** `users`, `projects`, `templates` (`deleted_at`); consultas filtram `deleted_at IS NULL`. Exclusão LGPD faz *hard delete* + anonimização preservando `transactions` (obrigação fiscal).
- **RLS:** toda conexão da aplicação assume `nexus_app` (fail-closed) e recebe o contexto da requisição (`app.user_id`, `app.is_admin`, `app.system`) antes de cada consulta. Requisição sem login é anônima (só vê o que é público por policy); workers usam `app.system=true`. Todas as tabelas têm RLS — inventário e escalonamentos em [`SECURITY_RLS.md`](SECURITY_RLS.md).
- **Dinheiro:** sempre em centavos (`bigint`) e créditos inteiros; `CHECK (saldo >= 0)`.
- **Auditoria:** `audit_logs(actor_id, action, target_type, target_id, metadata)` para login, moderação, saques, ajustes de admin, exclusão etc.
- **Expand/contract:** migrations destrutivas só em duas etapas (adicionar → migrar código → remover), para permitir rollback de código sem rollback de schema.

## Tabelas (geradas do schema migrado — `npx tsx scripts/gen-db-doc.ts`)

### `affiliate_accounts` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| platform | text | não |  |
| external_user_id | text | não |  |
| token_enc | text | não |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `affiliate_accounts_pkey`, `affiliate_accounts_user_id_platform_key`

### `affiliate_clicks` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('affiliate_clicks_id_seq'::regclass)` |
| link_id | uuid | não |  |
| ip_hash | text | não |  |
| user_agent | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `affiliate_clicks_link_idx`, `affiliate_clicks_pkey`

### `affiliate_conversions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| link_id | uuid | não |  |
| order_id | text | não |  |
| amount_cents | bigint | não |  |
| commission_cents | bigint | não |  |
| status | text | não | `'confirmed'::text` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `affiliate_conversions_link_id_order_id_key`, `affiliate_conversions_pkey`

### `affiliate_links` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| publication_id | uuid | sim |  |
| user_id | uuid | não |  |
| platform | text | não |  |
| original_url | text | não |  |
| tracking_url | text | não |  |
| price_cents | bigint | não | `0` |
| clicks | integer | não | `0` |
| conversions | integer | não | `0` |
| commission_cents | bigint | não | `0` |
| status | text | não | `'active'::text` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `affiliate_links_pkey`, `affiliate_links_publication_idx`

### `agent_runs` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| command | text | não |  |
| plan_json | jsonb | não |  |
| applied | boolean | não | `false` |
| created_at | timestamp with time zone | não | `now()` |
| applied_by | uuid | sim |  |
| user_id | uuid | não |  |
| status | text | não | `'planned'::text` |
| error_code | text | sim |  |
| preview_video_key | text | sim |  |
| result_json | jsonb | sim |  |
| previous_video_key | text | sim |  |
| applied_at | timestamp with time zone | sim |  |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `agent_runs_pkey`, `idx_agent_runs_project`

### `ai_act_registrations` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| model_provider | text | não |  |
| purpose | text | não |  |
| risk_classification | text | não |  |
| mitigations | ARRAY | não | `ARRAY[]::text[]` |
| dpia_id | uuid | sim |  |
| data_region | text | sim |  |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `ai_act_registrations_model_provider_purpose_key`, `ai_act_registrations_pkey`

### `ai_scene_cache` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| cache_key | text | não |  |
| provider | text | não |  |
| video_key | text | não |  |
| last_frame_key | text | não |  |
| duration_sec | numeric | não |  |
| cost_saved_cents | numeric | não | `0` |
| hits | integer | não | `0` |
| created_at | timestamp with time zone | não | `now()` |
| last_hit_at | timestamp with time zone | sim |  |

Índices: `ai_scene_cache_pkey`

### `ai_usage` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | sim |  |
| project_id | uuid | sim |  |
| provider | text | não |  |
| operation | text | não |  |
| cost_cents | numeric | não | `0` |
| latency_ms | integer | não | `0` |
| status | text | não | `'ok'::text` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `ai_usage_pkey`, `ai_usage_project_idx`, `ai_usage_user_idx`

### `analytics_events` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('analytics_events_id_seq'::regclass)` |
| user_id | uuid | sim |  |
| name | text | não |  |
| props | jsonb | não | `'{}'::jsonb` |
| created_at | timestamp with time zone | não | `now()` |
| pseudo_id | text | sim |  |
| anon_id | text | sim |  |
| session_id | text | sim |  |
| schema_version | smallint | não | `1` |
| source | text | não | `'client'::text` |
| event_id | uuid | sim |  |

Índices: `analytics_events_event_id_uq`, `analytics_events_name_time_idx`, `analytics_events_pkey`, `analytics_events_user_time_idx`

### `api_keys` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| name | text | não |  |
| prefix | text | não |  |
| key_hash | text | não |  |
| scopes | ARRAY | não | `ARRAY['catalogs:generate'::text]` |
| last_used_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| revoked_at | timestamp with time zone | sim |  |

Índices: `api_keys_key_hash_key`, `api_keys_pkey`

### `attribution_touches` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('attribution_touches_id_seq'::regclass)` |
| touch_key | text | não |  |
| user_id | uuid | sim |  |
| anon_id | text | sim |  |
| source | text | não |  |
| medium | text | não | `''::text` |
| campaign | text | não | `''::text` |
| content | text | não | `''::text` |
| term | text | não | `''::text` |
| landing | text | sim |  |
| first_seen_at | timestamp with time zone | não | `now()` |
| last_seen_at | timestamp with time zone | não | `now()` |
| touch_count | integer | não | `1` |

Índices: `attribution_touches_anon_idx`, `attribution_touches_pkey`, `attribution_touches_touch_key_key`, `attribution_touches_user_idx`

### `audio_versions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| scene_id | uuid | sim |  |
| source_video_key | text | não |  |
| music_track_id | uuid | sim |  |
| voice_source | text | não | `'original'::text` |
| voice_model_id | uuid | sim |  |
| settings | jsonb | não | `'{}'::jsonb` |
| sfx_events | jsonb | não | `'[]'::jsonb` |
| voice_url | text | sim |  |
| music_url | text | sim |  |
| sfx_url | text | sim |  |
| voice_stem_url | text | sim |  |
| music_stem_url | text | sim |  |
| sfx_stem_url | text | sim |  |
| mixed_url | text | sim |  |
| video_url | text | sim |  |
| loudness_lufs | real | sim |  |
| status | text | não | `'queued'::text` |
| error_code | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `audio_versions_pkey`, `idx_audio_versions_project`

### `audit_logs` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| actor_id | uuid | sim |  |
| action | text | não |  |
| target_type | text | sim |  |
| target_id | text | sim |  |
| metadata | jsonb | não | `'{}'::jsonb` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `audit_logs_actor_idx`, `audit_logs_pkey`

### `auth_identities` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| provider | text | não |  |
| provider_user_id | text | não |  |
| user_id | uuid | não |  |
| email | text | sim |  |

Índices: `auth_identities_pkey`, `auth_identities_user_idx`

### `authenticity_records` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| c2pa_manifest_embedded | boolean | não | `false` |
| verify_url | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| user_id | uuid | não |  |
| status | text | não | `'queued'::text` |
| error_code | text | sim |  |
| source_video_key | text | não |  |
| signed_video_key | text | sim |  |
| manifest_label | text | sim |  |
| signed_sha256 | text | sim |  |
| signer_subject | text | sim |  |
| seal_text | text | sim |  |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `authenticity_records_pkey`, `idx_authenticity_project`

### `background_edits` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| scene_id | uuid | sim |  |
| operation | text | não |  |
| target | text | não | `'video'::text` |
| params | jsonb | não | `'{}'::jsonb` |
| source_media_url | text | não |  |
| result_media_url | text | sim |  |
| result_alpha_url | text | sim |  |
| derived_scene_id | uuid | sim |  |
| provider | text | sim |  |
| status | text | não | `'queued'::text` |
| error_code | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `background_edits_pkey`, `idx_background_edits_scene`

### `batch_jobs` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| owner_id | uuid | não |  |
| type | text | não |  |
| catalog_id | uuid | não |  |
| total_items | integer | não | `0` |
| completed_items | integer | não | `0` |
| failed_items | integer | não | `0` |
| status | text | não | `'queued'::text` |
| params | jsonb | não | `'{}'::jsonb` |
| created_at | timestamp with time zone | não | `now()` |
| finished_at | timestamp with time zone | sim |  |

Índices: `batch_jobs_pkey`

### `bcp_scenarios` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| name | text | não |  |
| rto_minutes | integer | não |  |
| rpo_minutes | integer | não |  |
| procedure_url | text | não |  |
| last_tested_at | timestamp with time zone | sim |  |
| last_measured_minutes | integer | sim |  |

Índices: `bcp_scenarios_name_key`, `bcp_scenarios_pkey`

### `board_reports` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| period | text | não |  |
| mrr_cents | bigint | não |  |
| arr_cents | bigint | não |  |
| ndr_pct | numeric | sim |  |
| grr_pct | numeric | sim |  |
| churn_pct | numeric | sim |  |
| burn_multiple | numeric | sim |  |
| cash_runway_months | numeric | sim |  |
| metrics | jsonb | não | `'{}'::jsonb` |
| published_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `board_reports_period_key`, `board_reports_pkey`

### `catalog_items` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| catalog_id | uuid | não |  |
| name | text | não |  |
| description | text | não | `''::text` |
| price | numeric | não | `0` |
| category | text | não | `''::text` |
| sku | text | não |  |
| photo_urls | ARRAY | não | `ARRAY[]::text[]` |
| project_id | uuid | sim |  |
| status | text | não | `'pending'::text` |
| error | text | sim |  |

Índices: `catalog_items_catalog_id_sku_key`, `catalog_items_catalog_idx`, `catalog_items_pkey`

### `catalogs` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| owner_id | uuid | não |  |
| name | text | não |  |
| description | text | não | `''::text` |
| niche | text | não | `''::text` |
| default_template_id | uuid | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `catalogs_pkey`

### `churn_scores` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| user_id | uuid | não |  |
| score | real | não |  |
| updated_at | timestamp with time zone | não | `now()` |
| top_features_json | jsonb | não | `'[]'::jsonb` |
| model_version | text | não | `'fallback'::text` |
| source | text | não | `'fallback'::text` |

Índices: `churn_scores_pkey`

### `cloud_connections` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| provider | text | não |  |
| access_token_enc | text | não |  |
| refresh_token_enc | text | sim |  |
| expires_at | timestamp with time zone | sim |  |
| scopes | ARRAY | não | `ARRAY[]::text[]` |
| kms_key_id | text | não |  |
| status | text | não | `'connected'::text` |
| refresh_count | integer | não | `0` |
| rotated_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `cloud_connections_pkey`, `cloud_connections_user_id_provider_key`

### `comments` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| author_id | uuid | sim |  |
| time_ms | integer | não |  |
| clip_id | uuid | sim |  |
| body | text | não |  |
| anonymized | boolean | não | `false` |
| resolved_at | timestamp with time zone | sim |  |
| resolved_by | uuid | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `comments_pkey`, `idx_comments_project`

### `compliance_ropa` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| processing_activity | text | não |  |
| purpose_basis | text | não |  |
| data_categories | ARRAY | não |  |
| recipients | ARRAY | não | `ARRAY[]::text[]` |
| retention | text | não |  |
| jurisdiction | ARRAY | não | `ARRAY['BR'::text]` |
| source | text | não | `'manual'::text` |
| owner | text | sim |  |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `compliance_ropa_pkey`, `compliance_ropa_processing_activity_key`

### `connected_accounts` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| platform | USER-DEFINED | não |  |
| handle | text | sim |  |
| external_user_id | text | sim |  |
| access_token_enc | text | não |  |
| refresh_token_enc | text | sim |  |
| expires_at | timestamp with time zone | sim |  |
| scope | text | sim |  |
| status | text | não | `'connected'::text` |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `connected_accounts_pkey`, `connected_accounts_user_id_platform_key`

### `consents` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| type | text | não |  |
| version | text | não |  |
| accepted_at | timestamp with time zone | não | `now()` |
| revoked_at | timestamp with time zone | sim |  |
| ip_hash | text | sim |  |
| jurisdiction | text | sim |  |
| user_agent_hash | text | sim |  |
| proof_hash | text | sim |  |
| audio_sample_url | text | sim |  |
| verified_at | timestamp with time zone | sim |  |
| challenge_hash | text | sim |  |
| evidence_url | text | sim |  |

Índices: `consents_pkey`, `consents_user_idx`

### `cost_snapshots` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('cost_snapshots_id_seq'::regclass)` |
| date | date | não |  |
| service | text | não |  |
| region | text | não | `'global'::text` |
| provider | text | não | `'internal'::text` |
| cost_cents | bigint | não |  |
| metadata | jsonb | não | `'{}'::jsonb` |

Índices: `cost_snapshots_date_service_region_provider_key`, `cost_snapshots_pkey`

### `data_export_requests` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| status | text | não | `'processing'::text` |
| storage_key | text | sim |  |
| download_url | text | sim |  |
| requested_at | timestamp with time zone | não | `now()` |
| expires_at | timestamp with time zone | sim |  |

Índices: `data_export_requests_pkey`

### `data_residency_routes` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_region | text | não |  |
| data_type | text | não |  |
| storage_region | text | não |  |
| provider | text | não |  |

Índices: `data_residency_routes_pkey`, `data_residency_routes_user_region_data_type_key`

### `deletion_requests` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| status | text | não | `'scheduled'::text` |
| scheduled_for | timestamp with time zone | não |  |
| completed_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `deletion_requests_pkey`

### `derived_assets` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| source_project_id | uuid | sim |  |
| type | text | não |  |
| device_profile | text | sim |  |
| file_url | text | sim |  |
| size_bytes | bigint | sim |  |
| cache_key | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| output_config | jsonb | não | `'{}'::jsonb` |
| status | text | não | `'queued'::text` |
| error_code | text | sim |  |
| mime | text | sim |  |
| file_name | text | sim |  |
| cache_hit | boolean | não | `false` |
| info | jsonb | não | `'{}'::jsonb` |
| expires_at | timestamp with time zone | sim |  |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `derived_assets_pkey`, `idx_derived_assets_cache`, `idx_derived_assets_expiry`, `idx_derived_assets_user`

### `destination_exports` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| project_id | uuid | sim |  |
| destination | text | não |  |
| status | text | não | `'queued'::text` |
| external_url | text | sim |  |
| error | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| kind | text | não | `'video'::text` |
| batch_id | uuid | sim |  |
| catalog_id | uuid | sim |  |
| catalog_item_id | uuid | sim |  |
| file_name | text | sim |  |
| storage_key | text | sim |  |
| bytes | bigint | sim |  |
| sha256 | text | sim |  |
| expires_at | timestamp with time zone | sim |  |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `destination_exports_pkey`, `idx_destination_exports_batch`, `idx_destination_exports_expiry`, `idx_destination_exports_user`

### `device_fingerprints` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| user_id | uuid | não |  |
| device_hash | text | não |  |
| first_seen_at | timestamp with time zone | não | `now()` |

Índices: `device_fingerprints_hash_idx`, `device_fingerprints_pkey`

### `dpia_records` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| name | text | não |  |
| status | text | não | `'draft'::text` |
| subject | jsonb | não | `'{}'::jsonb` |
| content | jsonb | não | `'{}'::jsonb` |
| generated_by | text | não | `'template'::text` |
| reviewed_by | uuid | sim |  |
| reviewed_at | timestamp with time zone | sim |  |
| document_url | text | sim |  |
| next_review_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `dpia_records_pkey`

### `element_insertions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| source_scene_id | uuid | sim |  |
| derived_scene_id | uuid | sim |  |
| action | text | não | `'insert'::text` |
| type | text | não |  |
| mode | text | sim |  |
| reference_url | text | sim |  |
| description | text | não | `''::text` |
| params | jsonb | não | `'{}'::jsonb` |
| consent_id | uuid | sim |  |
| result_url | text | sim |  |
| provider | text | sim |  |
| status | text | não | `'queued'::text` |
| error_code | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `element_insertions_pkey`, `idx_element_insertions_project`

### `email_shares` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| asset_id | uuid | sim |  |
| recipients_hash | ARRAY | não | `ARRAY[]::text[]` |
| sent_at | timestamp with time zone | sim |  |
| expires_at | timestamp with time zone | não |  |
| password_hash | text | sim |  |
| access_count | integer | não | `0` |
| project_id | uuid | sim |  |
| asset_kind | text | não | `'video'::text` |
| catalog_id | uuid | sim |  |
| catalog_item_id | uuid | sim |  |
| batch_id | uuid | sim |  |
| file_ref | text | sim |  |
| file_name | text | sim |  |
| sender_name | text | não | `''::text` |
| message | text | não | `''::text` |
| locale | text | não | `'pt-BR'::text` |
| recipient_count | integer | não | `0` |
| include_self | boolean | não | `false` |
| status | text | não | `'sent'::text` |
| last_access_at | timestamp with time zone | sim |  |
| revoked_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `email_shares_pkey`, `idx_email_shares_batch`, `idx_email_shares_user`

### `erasure_queue` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| pseudo_id | text | não |  |
| requested_at | timestamp with time zone | não | `now()` |
| processed_at | timestamp with time zone | sim |  |

Índices: `erasure_queue_pkey`

### `experiment_assignments` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('experiment_assignments_id_seq'::regclass)` |
| experiment_id | uuid | não |  |
| user_id | uuid | não |  |
| variant | text | não |  |
| assigned_at | timestamp with time zone | não | `now()` |
| exposed_at | timestamp with time zone | sim |  |

Índices: `experiment_assignments_experiment_id_user_id_key`, `experiment_assignments_pkey`, `experiment_assignments_user_idx`

### `experiment_events` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('experiment_events_id_seq'::regclass)` |
| experiment_id | uuid | não |  |
| user_id | uuid | não |  |
| event | text | não |  |
| value | numeric | não | `0` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `experiment_events_idx`, `experiment_events_pkey`

### `experiments` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| key | text | não |  |
| name | text | não |  |
| hypothesis | text | não | `''::text` |
| status | text | não | `'draft'::text` |
| variants_json | jsonb | não |  |
| primary_metric | jsonb | não |  |
| secondary_metrics | jsonb | não | `'[]'::jsonb` |
| guardrails_json | jsonb | não | `'[]'::jsonb` |
| target_json | jsonb | não | `'{}'::jsonb` |
| traffic_pct | integer | não | `100` |
| salt | text | não | `encode(gen_random_bytes(8), 'hex'::text)` |
| respects_holdout | boolean | não | `true` |
| baseline_rate | real | sim |  |
| mde_relative | real | sim |  |
| alpha | real | não | `0.05` |
| power | real | não | `0.8` |
| required_per_variant | integer | sim |  |
| conversion_window_days | integer | não | `14` |
| decision | text | sim |  |
| decision_notes | text | sim |  |
| winner | text | sim |  |
| decided_by | uuid | sim |  |
| decided_at | timestamp with time zone | sim |  |
| guardrail_breach_since | timestamp with time zone | sim |  |
| paused_reason | text | sim |  |
| start_at | timestamp with time zone | sim |  |
| end_at | timestamp with time zone | sim |  |
| created_by | uuid | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `experiments_key_key`, `experiments_pkey`

### `feature_flags` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| key | text | não |  |
| description | text | não | `''::text` |
| enabled | boolean | não | `true` |
| rollout_percent | integer | não | `100` |
| regions | ARRAY | não | `ARRAY[]::text[]` |
| plans | ARRAY | não | `ARRAY[]::text[]` |
| updated_at | timestamp with time zone | não | `now()` |
| updated_by | uuid | sim |  |

Índices: `feature_flags_pkey`

### `fx_rates` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| currency | character | não |  |
| brl_per_major | numeric | não |  |
| exponent | smallint | não | `2` |
| updated_at | timestamp with time zone | não | `now()` |
| source | text | não | `'seed'::text` |

Índices: `fx_rates_pkey`

### `generation_logs` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('generation_logs_id_seq'::regclass)` |
| project_id | uuid | não |  |
| scene_id | uuid | sim |  |
| step | text | não |  |
| message | text | não |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `generation_logs_pkey`, `generation_logs_project_idx`

### `growth_alerts` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('growth_alerts_id_seq'::regclass)` |
| kind | text | não |  |
| severity | text | não | `'warning'::text` |
| message | text | não |  |
| data | jsonb | não | `'{}'::jsonb` |
| created_at | timestamp with time zone | não | `now()` |
| resolved_at | timestamp with time zone | sim |  |

Índices: `growth_alerts_open_idx`, `growth_alerts_pkey`

### `incident_updates` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| incident_id | uuid | não |  |
| message | text | não |  |
| status | text | não |  |
| public | boolean | não | `true` |
| created_at | timestamp with time zone | não | `now()` |
| author_id | uuid | sim |  |

Índices: `incident_updates_inc_idx`, `incident_updates_pkey`

### `incidents` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| severity | text | não |  |
| title | text | não |  |
| status | text | não | `'investigating'::text` |
| components | ARRAY | não | `ARRAY[]::text[]` |
| channel | text | sim |  |
| roles | jsonb | não | `'{}'::jsonb` |
| started_at | timestamp with time zone | não | `now()` |
| detected_at | timestamp with time zone | sim |  |
| mitigated_at | timestamp with time zone | sim |  |
| resolved_at | timestamp with time zone | sim |  |
| commander_id | uuid | sim |  |
| postmortem_url | text | sim |  |
| impact_summary | text | sim |  |
| source | text | não | `'manual'::text` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `incidents_pkey`, `incidents_status_idx`

### `kyc_verifications` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| provider | text | não |  |
| status | text | não |  |
| verified_at | timestamp with time zone | sim |  |
| document_type | text | sim |  |
| external_ref | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `kyc_user_idx`, `kyc_verifications_pkey`

### `lifecycle_campaigns` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| key | text | não |  |
| description | text | não | `''::text` |
| trigger_json | jsonb | não |  |
| channel | text | não |  |
| template_id | text | não |  |
| active | boolean | não | `true` |
| cooldown_days | integer | não | `30` |
| requires_marketing_consent | boolean | não | `true` |
| priority | integer | não | `50` |

Índices: `lifecycle_campaigns_key_key`, `lifecycle_campaigns_pkey`

### `lifecycle_sends` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| campaign_id | uuid | não |  |
| user_id | uuid | não |  |
| channel | text | não |  |
| status | text | não | `'sent'::text` |
| suppress_reason | text | sim |  |
| dedupe_key | text | não |  |
| sent_at | timestamp with time zone | não | `now()` |
| opened_at | timestamp with time zone | sim |  |
| clicked_at | timestamp with time zone | sim |  |
| converted_at | timestamp with time zone | sim |  |

Índices: `lifecycle_sends_dedupe_key_key`, `lifecycle_sends_pkey`, `lifecycle_sends_user_idx`

### `live_session_events` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| session_id | uuid | não |  |
| owner_id | uuid | não |  |
| type | text | não |  |
| payload | jsonb | não | `'{}'::jsonb` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `idx_live_events_session`, `live_session_events_pkey`

### `live_sessions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| owner_id | uuid | não |  |
| catalog_id | uuid | não |  |
| avatar_config | jsonb | não |  |
| ai_label_enabled | boolean | não | `true` |
| status | text | não | `'draft'::text` |
| started_at | timestamp with time zone | sim |  |
| ended_at | timestamp with time zone | sim |  |
| title | text | não |  |
| disclosure_text | text | não |  |
| merchant_opt_in_at | timestamp with time zone | não |  |
| label_impressions | bigint | não | `0` |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `idx_live_sessions_owner`, `live_sessions_pkey`

### `localized_versions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| locale | text | não |  |
| video_url | text | sim |  |
| subtitles_url | text | sim |  |
| audio_url | text | sim |  |
| voice | text | sim |  |
| status | text | não | `'pending'::text` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `localized_versions_pkey`, `localized_versions_project_id_locale_key`

### `ltv_predictions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| user_id | uuid | não |  |
| predicted_ltv_cents | bigint | não |  |
| horizon_days | integer | não | `365` |
| updated_at | timestamp with time zone | não | `now()` |
| model_version | text | não | `'fallback'::text` |

Índices: `ltv_predictions_pkey`

### `market_expansion` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| region | text | não |  |
| name | text | não |  |
| status | text | não | `'planned'::text` |
| priority | integer | não |  |
| launch_date | date | sim |  |
| locales | ARRAY | não | `'{}'::text[]` |
| kpis_json | jsonb | não | `'{}'::jsonb` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `market_expansion_pkey`

### `music_tracks` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| title | text | não |  |
| mood | text | não |  |
| genre | text | não |  |
| bpm | integer | não |  |
| duration | integer | não |  |
| license_region | ARRAY | não | `ARRAY['*'::text]` |
| file_url | text | não |  |
| owner_user_id | uuid | sim |  |
| source | text | não | `'library'::text` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `idx_music_tracks_filters`, `idx_music_tracks_owner`, `music_tracks_pkey`

### `notification_preferences` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| user_id | uuid | não |  |
| push | boolean | não | `true` |
| email | boolean | não | `true` |
| in_app | boolean | não | `true` |
| quiet_start | smallint | não | `22` |
| quiet_end | smallint | não | `8` |
| preferred_hour | smallint | sim |  |
| unsubscribed_all | boolean | não | `false` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `notification_preferences_pkey`

### `notifications` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| channel | text | não |  |
| title | text | não |  |
| body | text | não |  |
| deep_link | text | sim |  |
| campaign_key | text | sim |  |
| sent_at | timestamp with time zone | não | `now()` |
| read_at | timestamp with time zone | sim |  |
| action_taken | text | sim |  |

Índices: `notifications_pkey`, `notifications_user_idx`

### `oncall_pages` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('oncall_pages_id_seq'::regclass)` |
| person | text | não |  |
| team | text | não | `'backend'::text` |
| severity | text | não |  |
| incident_id | uuid | sim |  |
| paged_at | timestamp with time zone | não | `now()` |
| off_hours | boolean | não | `false` |
| ack_seconds | integer | sim |  |

Índices: `oncall_pages_person_idx`, `oncall_pages_pkey`

### `partner_accounts` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| partner_type | text | não |  |
| name | text | não |  |
| status | text | não | `'prospect'::text` |
| revenue_share_pct | numeric | não | `0` |
| contact | text | sim |  |
| contract_ref | text | sim |  |
| code | text | não |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `partner_accounts_code_key`, `partner_accounts_pkey`

### `partner_sales` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| partner_id | uuid | não |  |
| user_id | uuid | não |  |
| transaction_id | uuid | não |  |
| amount_cents | bigint | não |  |
| share_cents | bigint | não |  |
| status | text | não | `'accrued'::text` |
| created_at | timestamp with time zone | não | `now()` |
| paid_at | timestamp with time zone | sim |  |

Índices: `partner_sales_partner_idx`, `partner_sales_pkey`, `partner_sales_transaction_id_key`

### `payout_requests` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| source | text | não | `'affiliate'::text` |
| amount_cents | bigint | não |  |
| status | text | não | `'pending'::text` |
| requested_at | timestamp with time zone | não | `now()` |
| processed_at | timestamp with time zone | sim |  |
| processed_by | uuid | sim |  |
| gateway_ref | text | sim |  |
| reason | text | sim |  |
| first_approver | uuid | sim |  |
| first_approved_at | timestamp with time zone | sim |  |
| hold_reason | text | sim |  |

Índices: `payout_requests_pkey`

### `postmortems` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| incident_id | uuid | não |  |
| root_cause | text | sim |  |
| timeline | jsonb | não | `'[]'::jsonb` |
| actions_json | jsonb | não | `'[]'::jsonb` |
| five_whys | jsonb | não | `'[]'::jsonb` |
| draft | boolean | não | `true` |
| published_at | timestamp with time zone | sim |  |
| reviewed_at | timestamp with time zone | sim |  |
| reviewed_by | uuid | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `postmortems_incident_id_key`, `postmortems_pkey`

### `predictions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| score_retention | smallint | não |  |
| score_ctr | smallint | não |  |
| score_conversion | smallint | não |  |
| suggestions_json | jsonb | não | `'[]'::jsonb` |
| created_at | timestamp with time zone | não | `now()` |
| user_id | uuid | não |  |
| features_json | jsonb | não | `'{}'::jsonb` |
| model_version | text | não |  |
| label | text | não | `'estimativa'::text` |

Índices: `idx_predictions_project`, `predictions_pkey`

### `pricing_regions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| region | text | não |  |
| country_codes | ARRAY | não |  |
| currency | character | não |  |
| locale | text | não |  |
| plan_pro_price_cents | integer | não |  |
| plan_business_price_cents | integer | não |  |
| credits_price_cents | integer | não |  |
| credit_packs_json | jsonb | não |  |
| tax_pct | numeric | não | `0` |
| tax_kind | text | não | `'none'::text` |
| tax_inclusive | boolean | não | `false` |
| payment_methods | ARRAY | não |  |
| ppp_index | numeric | não | `1` |
| annual_discount_pct | integer | não | `20` |
| active | boolean | não | `true` |

Índices: `pricing_regions_pkey`

### `project_collaborators` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| user_id | uuid | sim |  |
| role | text | não |  |
| status | text | não | `'pending'::text` |
| invited_by | uuid | não |  |
| invited_email_hash | text | não |  |
| token_hash | text | sim |  |
| expires_at | timestamp with time zone | não |  |
| accepted_at | timestamp with time zone | sim |  |
| removed_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `idx_collab_project`, `idx_collab_user`, `project_collaborators_pkey`, `uq_collab_member`

### `project_merges` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| project_a_id | uuid | não |  |
| project_b_id | uuid | não |  |
| result_project_id | uuid | sim |  |
| transition_type | text | sim |  |
| transition_requested | text | não | `'auto'::text` |
| analysis | jsonb | não | `'{}'::jsonb` |
| stage | text | não | `'queued'::text` |
| progress | integer | não | `0` |
| status | text | não | `'queued'::text` |
| error_code | text | sim |  |
| duration_sec | real | sim |  |
| loudness_lufs | real | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `idx_project_merges_result`, `idx_project_merges_user`, `project_merges_pkey`

### `projects` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| title | text | não |  |
| script | text | não | `''::text` |
| source_locale | text | não | `'pt-BR'::text` |
| storyboard_id | uuid | sim |  |
| status | text | não | `'draft'::text` |
| versions | ARRAY | não | `ARRAY[]::text[]` |
| final_video_url | text | sim |  |
| duration_sec | integer | sim |  |
| category | text | sim |  |
| template_id | uuid | sim |  |
| photo_refs | ARRAY | não | `ARRAY[]::text[]` |
| created_at | timestamp with time zone | não | `now()` |
| deleted_at | timestamp with time zone | sim |  |
| active_audio_version_id | uuid | sim |  |

Índices: `projects_pkey`, `projects_title_trgm`, `projects_user_created_idx`

### `propensity_scores` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| user_id | uuid | não |  |
| target | text | não |  |
| score | real | não |  |
| updated_at | timestamp with time zone | não | `now()` |
| model_version | text | não | `'fallback'::text` |

Índices: `propensity_scores_pkey`

### `publication_jobs` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| publication_id | uuid | não |  |
| status | text | não | `'queued'::text` |
| progress | real | não | `0` |
| stage | text | sim |  |
| provider_job_id | text | sim |  |
| queue_job_id | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `publication_jobs_pkey`

### `publications` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| user_id | uuid | não |  |
| platform | USER-DEFINED | não |  |
| locale | text | sim |  |
| status | text | não | `'pending'::text` |
| metadata | jsonb | não | `'{}'::jsonb` |
| external_id | text | sim |  |
| external_url | text | sim |  |
| error | text | sim |  |
| retry_count | integer | não | `0` |
| published_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `publications_pkey`, `publications_project_platform_idx`, `publications_user_idx`

### `recommendation_events` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('recommendation_events_id_seq'::regclass)` |
| user_id | uuid | não |  |
| surface | text | não |  |
| item_type | text | não |  |
| item_id | text | não |  |
| action | text | não |  |
| variant | text | sim |  |
| position | integer | sim |  |
| request_id | uuid | sim |  |
| context_json | jsonb | não | `'{}'::jsonb` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `recommendation_events_item_idx`, `recommendation_events_pkey`, `recommendation_events_surface_idx`, `recommendation_events_user_idx`

### `referrals` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| referrer_id | uuid | não |  |
| referred_id | uuid | sim |  |
| code | text | não |  |
| status | text | não | `'clicked'::text` |
| device_hash | text | sim |  |
| ip_hash | text | sim |  |
| fraud_reason | text | sim |  |
| utm | jsonb | não | `'{}'::jsonb` |
| reward_granted_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| signed_up_at | timestamp with time zone | sim |  |
| activated_at | timestamp with time zone | sim |  |

Índices: `referrals_pkey`, `referrals_referred_uq`, `referrals_referrer_idx`

### `refresh_tokens` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| family_id | uuid | não |  |
| token_hash | text | não |  |
| expires_at | timestamp with time zone | não |  |
| revoked_at | timestamp with time zone | sim |  |
| rotated_from | uuid | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `refresh_tokens_family_idx`, `refresh_tokens_pkey`, `refresh_tokens_token_hash_key`, `refresh_tokens_user_idx`

### `reports` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| publication_id | uuid | sim |  |
| reporter_id | uuid | sim |  |
| reason | text | não |  |
| status | text | não | `'open'::text` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `reports_pkey`

### `resilience_exercises` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| kind | text | não |  |
| name | text | não |  |
| owner | text | não |  |
| scheduled_for | date | não |  |
| executed_at | timestamp with time zone | sim |  |
| outcome | text | sim |  |
| measured_minutes | integer | sim |  |
| evidence_url | text | sim |  |
| postmortem_incident_id | uuid | sim |  |

Índices: `resilience_exercises_pkey`

### `retention_runs` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('retention_runs_id_seq'::regclass)` |
| ran_at | timestamp with time zone | não | `now()` |
| dry_run | boolean | não |  |
| results | jsonb | não |  |

Índices: `retention_runs_pkey`

### `sanctions_checks` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | sim |  |
| entity_name | text | não |  |
| list_source | text | não |  |
| match | boolean | não |  |
| score | numeric | sim |  |
| checked_at | timestamp with time zone | não | `now()` |

Índices: `sanctions_checks_pkey`

### `scenes` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| index | integer | não |  |
| text | text | não | `''::text` |
| duration_sec | integer | não | `8` |
| prompt | text | não | `''::text` |
| reference_mode | USER-DEFINED | não | `'product'::ref_mode_t` |
| reference_images | ARRAY | não | `ARRAY[]::text[]` |
| video_url | text | sim |  |
| last_frame_url | text | sim |  |
| chained_from_scene_id | uuid | sim |  |
| status | text | não | `'pending'::text` |
| error_message | text | sim |  |
| retried | boolean | não | `false` |
| consistency | real | sim |  |
| version | integer | não | `1` |
| derived_from_scene_id | uuid | sim |  |
| selected | boolean | não | `false` |
| inserted_elements | jsonb | não | `'[]'::jsonb` |

Índices: `idx_scenes_chained_from`, `idx_scenes_derived_from`, `scenes_pkey`, `scenes_project_idx`, `scenes_project_index_version_key`

### `series` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| title | text | não |  |
| description | text | não | `''::text` |
| template | text | não | `'mininovela'::text` |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `idx_series_user`, `series_pkey`

### `series_episodes` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| series_id | uuid | não |  |
| project_id | uuid | não |  |
| order | integer | não |  |
| cta_url | text | sim |  |
| user_id | uuid | não |  |
| cta_label | text | sim |  |
| recap_text | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `idx_series_episodes_project`, `series_episodes_order_key`, `series_episodes_pkey`, `series_episodes_project_key`

### `settings` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| key | text | não |  |
| value | jsonb | não |  |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `settings_pkey`

### `slo_burn_alerts` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| slo_id | text | não |  |
| alert_window | text | não |  |
| burn_rate | numeric | não |  |
| severity | text | não |  |
| fired_at | timestamp with time zone | não | `now()` |
| resolved_at | timestamp with time zone | sim |  |

Índices: `slo_burn_alerts_open_uq`, `slo_burn_alerts_pkey`

### `slo_definitions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | text | não |  |
| service | text | não |  |
| sli_type | text | não |  |
| target | numeric | não |  |
| window_days | integer | não | `30` |
| description | text | não |  |
| owner | text | não |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `slo_definitions_pkey`

### `slo_samples` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| slo_id | text | não |  |
| ts | timestamp with time zone | não |  |
| good | bigint | não |  |
| total | bigint | não |  |

Índices: `slo_samples_pkey`

### `status_components` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| key | text | não |  |
| name | text | não |  |
| position | integer | não | `0` |
| override_status | text | sim |  |

Índices: `status_components_pkey`

### `status_subscribers` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| channel | text | não |  |
| target | text | não |  |
| components | ARRAY | não | `ARRAY[]::text[]` |
| confirmed | boolean | não | `false` |
| token | text | não |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `status_subscribers_channel_target_key`, `status_subscribers_pkey`

### `storyboards` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| voice_id | text | sim |  |
| track_id | text | sim |  |
| caption_style | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `storyboards_pkey`

### `subprocessors` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| name | text | não |  |
| purpose | text | não |  |
| location | text | não |  |
| dpa_signed_at | timestamp with time zone | sim |  |
| contact | text | sim |  |
| status | text | não | `'active'::text` |

Índices: `subprocessors_name_key`, `subprocessors_pkey`

### `teleprompter_sessions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| script | text | não |  |
| settings_json | jsonb | não | `'{}'::jsonb` |
| recorded_video_url | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| project_id | uuid | sim |  |
| upload_opt_in_at | timestamp with time zone | sim |  |
| recorded_bytes | bigint | sim |  |
| recorded_mime | text | sim |  |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `idx_tp_user`, `teleprompter_sessions_pkey`

### `template_purchases` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| template_id | uuid | não |  |
| buyer_id | uuid | não |  |
| price_credits | integer | não |  |
| creator_share_credits | integer | não | `0` |
| fee_credits | integer | não | `0` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `template_purchases_pkey`, `template_purchases_template_id_buyer_id_key`

### `template_reviews` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| template_id | uuid | não |  |
| user_id | uuid | não |  |
| stars | smallint | não |  |
| comment | text | sim | `''::text` |
| created_at | timestamp with time zone | não | `now()` |

Índices: `template_reviews_pkey`, `template_reviews_template_id_user_id_key`

### `templates` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| creator_id | uuid | não |  |
| name | text | não |  |
| description | text | não | `''::text` |
| category | text | não | `'geral'::text` |
| tags | ARRAY | não | `ARRAY[]::text[]` |
| price_credits | integer | não | `0` |
| preview_url | text | sim |  |
| scene_structure | jsonb | não | `'[]'::jsonb` |
| prompt_hints | ARRAY | não | `ARRAY[]::text[]` |
| voice_id | text | sim |  |
| track_id | text | sim |  |
| caption_style | text | sim |  |
| locale | text | não | `'pt-BR'::text` |
| rating_avg | real | não | `0` |
| rating_count | integer | não | `0` |
| usage_count | integer | não | `0` |
| moderation_status | text | não | `'draft'::text` |
| rejection_reason | text | sim |  |
| moderated_by | uuid | sim |  |
| moderated_at | timestamp with time zone | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| deleted_at | timestamp with time zone | sim |  |

Índices: `templates_name_trgm`, `templates_pkey`, `templates_status_idx`

### `timeline_clips` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| track_id | uuid | não |  |
| project_id | uuid | não |  |
| position | integer | não | `0` |
| start_ms | integer | não |  |
| duration_ms | integer | não |  |
| source_ref | text | sim |  |
| props | jsonb | não | `'{}'::jsonb` |
| version | integer | não | `1` |
| updated_by | uuid | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `idx_clips_project`, `idx_clips_track`, `timeline_clips_pkey`

### `timeline_meta` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| project_id | uuid | não |  |
| rev | bigint | não | `0` |
| edits_since_snapshot | integer | não | `0` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `timeline_meta_pkey`

### `timeline_ops` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('timeline_ops_id_seq'::regclass)` |
| project_id | uuid | não |  |
| user_id | uuid | sim |  |
| rev | bigint | não |  |
| op | jsonb | não |  |
| conflict | text | sim |  |
| overwritten | jsonb | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `idx_ops_project`, `timeline_ops_pkey`

### `timeline_snapshots` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| kind | text | não |  |
| label | text | não | `''::text` |
| rev | bigint | não |  |
| data | jsonb | não |  |
| created_by | uuid | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `idx_snapshots_project`, `timeline_snapshots_pkey`

### `timeline_tracks` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| kind | text | não |  |
| name | text | não | `''::text` |
| position | integer | não | `0` |
| muted | boolean | não | `false` |
| locked | boolean | não | `false` |
| hidden | boolean | não | `false` |
| volume | real | não | `1` |
| opacity | real | não | `1` |
| version | integer | não | `1` |
| updated_by | uuid | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `idx_tracks_project`, `timeline_tracks_pkey`

### `transactions` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| type | text | não |  |
| amount_cents | bigint | não |  |
| credits_delta | integer | não | `0` |
| source | text | não |  |
| external_ref | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| currency | character | não | `'BRL'::bpchar` |
| amount_brl_cents | bigint | sim |  |
| tax_cents | bigint | não | `0` |
| region | text | sim |  |
| method | text | sim |  |

Índices: `transactions_ext_uq`, `transactions_pkey`, `transactions_user_idx`

### `transcript_edits` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| user_id | uuid | não |  |
| transcript_id | uuid | não |  |
| ops_json | jsonb | não |  |
| status | text | não | `'queued'::text` |
| error_code | text | sim |  |
| preview_video_key | text | sim |  |
| result_json | jsonb | sim |  |
| previous_video_key | text | sim |  |
| applied_at | timestamp with time zone | sim |  |
| applied_by | uuid | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `idx_transcript_edits_project`, `transcript_edits_pkey`

### `transcripts` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| project_id | uuid | não |  |
| language | text | não |  |
| segments_json | jsonb | não | `'{}'::jsonb` |
| created_at | timestamp with time zone | não | `now()` |
| user_id | uuid | não |  |
| source_video_key | text | não |  |
| source_sha256 | text | sim |  |
| provider | text | sim |  |
| status | text | não | `'queued'::text` |
| error_code | text | sim |  |
| word_count | integer | não | `0` |
| duration_ms | integer | sim |  |
| expires_at | timestamp with time zone | não |  |
| updated_at | timestamp with time zone | não | `now()` |

Índices: `idx_transcripts_expiry`, `idx_transcripts_project`, `transcripts_pkey`

### `unit_economics` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('unit_economics_id_seq'::regclass)` |
| date | date | não |  |
| metric | text | não |  |
| value | numeric | não |  |
| region | text | não | `'all'::text` |
| plan | text | não | `'all'::text` |
| cohort | text | não | `'all'::text` |

Índices: `unit_economics_date_metric_region_plan_cohort_key`, `unit_economics_pkey`

### `users` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| email | text | não |  |
| name | text | não | `''::text` |
| password_hash | text | sim |  |
| locale | text | não | `'pt-BR'::text` |
| region | text | não | `'LATAM'::text` |
| plan | USER-DEFINED | não | `'free'::plan_t` |
| credits | integer | não | `30` |
| affiliate_balance_cents | bigint | não | `0` |
| marketplace_balance_cents | bigint | não | `0` |
| is_admin | boolean | não | `false` |
| banned | boolean | não | `false` |
| birth_date | date | sim |  |
| totp_secret_enc | text | sim |  |
| totp_enabled | boolean | não | `false` |
| stripe_customer_id | text | sim |  |
| subscription_status | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |
| deleted_at | timestamp with time zone | sim |  |
| deletion_scheduled_for | timestamp with time zone | sim |  |
| churn_risk | real | sim |  |
| rfm_segment | text | sim |  |
| referral_code | text | sim |  |
| referred_by | uuid | sim |  |
| attribution_source | text | sim |  |
| ltv_predicted_cents | bigint | sim |  |
| country | character | sim |  |
| timezone | text | sim |  |
| onboarding_goal | text | sim |  |
| onboarding_completed_at | timestamp with time zone | sim |  |
| last_seen_at | timestamp with time zone | sim |  |
| partner_id | uuid | sim |  |
| creator_verified | boolean | não | `false` |
| data_residency_region | text | não | `'BR'::text` |
| kyc_status | text | não | `'none'::text` |
| sanctions_cleared | boolean | não | `false` |

Índices: `users_email_uq`, `users_last_seen_idx`, `users_pkey`, `users_referral_code_uq`

### `vendor_contracts` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| vendor | text | não |  |
| service | text | não |  |
| sla | text | sim |  |
| exit_plan_url | text | sim |  |
| renewal_date | date | sim |  |
| owner | text | não |  |
| criticality | text | não | `'medium'::text` |

Índices: `vendor_contracts_pkey`, `vendor_contracts_vendor_service_key`

### `voice_models` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| user_id | uuid | não |  |
| consent_id | uuid | não |  |
| provider | text | não |  |
| provider_voice_id | text | não |  |
| status | text | não | `'ready'::text` |
| created_at | timestamp with time zone | não | `now()` |
| deleted_at | timestamp with time zone | sim |  |

Índices: `idx_voice_models_user`, `voice_models_pkey`

### `waitlist_entries` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | bigint | não | `nextval('waitlist_entries_id_seq'::regclass)` |
| email | text | não |  |
| locale | text | não | `'pt-BR'::text` |
| country | character | sim |  |
| referral_code | text | não |  |
| referred_by_code | text | sim |  |
| utm | jsonb | não | `'{}'::jsonb` |
| bonus_positions | integer | não | `0` |
| consent_at | timestamp with time zone | não | `now()` |
| status | text | não | `'waiting'::text` |
| created_at | timestamp with time zone | não | `now()` |
| invited_at | timestamp with time zone | sim |  |

Índices: `waitlist_email_uq`, `waitlist_entries_pkey`, `waitlist_entries_referral_code_key`

### `webhook_events` 🔒 RLS

| coluna | tipo | null | default |
|---|---|---|---|
| id | uuid | não | `gen_random_uuid()` |
| provider | text | não |  |
| event_id | text | não |  |
| event_type | text | não |  |
| payload | jsonb | não |  |
| processed_at | timestamp with time zone | sim |  |
| error | text | sim |  |
| created_at | timestamp with time zone | não | `now()` |

Índices: `webhook_events_pkey`, `webhook_events_provider_event_id_key`

