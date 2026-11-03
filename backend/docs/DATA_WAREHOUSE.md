# Data Warehouse e BI

## Fluxo
`Postgres/analytics_events` --(job `warehouse-export`)--> JSONL em `WAREHOUSE_EXPORT_DIR` --(load)--> `raw.*` --> **dbt** `staging -> intermediate -> marts -> semantic` --> dashboards (`dashboards/*.sql`).

- **Eventos**: export incremental por cursor (`warehouse:cursor:events`), arquivos `events-AAAA-MM-DD*.jsonl`; eventos com `schema_version = 0` (fora da taxonomia) vão para `quarantine-*.jsonl` e **nunca** chegam às marts.
- **Snapshots** (users, transactions, projects, publications, ai_usage, experiment_assignments, referrals, template_purchases): completos, a cada hora (lock `warehouse:snapshot:lock`) ou `POST /admin/analytics/export`.
- **Privacidade**: nenhum `user_id`/e-mail sai do Postgres; só `pseudo_id` (HMAC com sal). Eliminação de conta grava **tombstone** (`erasure-*.jsonl`) para remover o pseudo_id do warehouse (rotina de aplicação das eliminações deve rodar na carga). Teste `16-warehouse-dbt` falha se aparecer uuid/e-mail nos arquivos ou colunas.
- **Frescor (SLA)**: `manifest.json` do export; `GET /admin/analytics/freshness` e `dbt source freshness` (warn 60 min / erro 180 min).

## Taxonomia de eventos (v1)
`GET /admin/analytics/taxonomy` lista eventos, origem permitida (client/server) e props obrigatórias. Regras: eventos de servidor (ex.: `subscription_started`) são rejeitados se vierem do cliente; desconhecidos entram em quarentena; props com PII (e-mail, CPF...) são rejeitadas. **Mudança = versão nova** (`TAXONOMY_VERSION`), nunca edição retroativa.

## dbt (`dbt/`)
- Fonte `raw` (contrato em `warehouse/raw_ddl.sql`), 9 modelos staging (dedupe por id, normalização), `int_user_activity_days`, `int_as_of`, 12 marts, `sem_metrics_daily` (formato longo) e seed `metric_catalog` (uma definição por métrica; teste exige que toda `metric_key` exista no catálogo).
- Macros `xdb_*` isolam diferenças Postgres/BigQuery (datas, diff de dias, trunc semana/mês, JSON).
- Maturidade de coortes: `as_of_date` (var; padrão = último evento). Retenção/LTV imaturos => NULL.
- Testes: genéricos (unique/not_null/relationships/accepted_values/unique_combination) + singulares (`assert_no_pii_in_marts`, `golden_retention` com `--vars '{golden_checks: true}'` sobre `scripts/seed_synthetic.sql`).

### Rodar local (validado)
```bash
psql -c "create database nexus_dwh" && psql -d nexus_dwh -f warehouse/raw_ddl.sql
DATABASE_URL=... WAREHOUSE_EXPORT_DIR=./.warehouse npx tsx scripts/warehouse-load-local.ts --target-url postgres://.../nexus_dwh
cd dbt && export LANG=C.UTF-8 DBT_TARGET=local && dbt seed --profiles-dir . && dbt run --profiles-dir . && dbt test --profiles-dir .
node dashboards/validate.mjs   # executa todos os cards
```
Dados sintéticos para teste: `psql -d nexus_dwh -f dbt/scripts/seed_synthetic.sql` (coorte golden D1 0,8 / D7 0,5 / D30 0,2).

## BigQuery (produção) — **NÃO validado neste ambiente**
1. Criar dataset `nexusreel_raw` com o DDL de `warehouse/raw_ddl.sql` (adaptar `jsonb -> JSON`, `timestamptz -> TIMESTAMP`).
2. Carga: `bq load --source_format=NEWLINE_DELIMITED_JSON` dos JSONL (eventos incrementais por arquivo, snapshots com `--replace`), orquestrada por Cloud Scheduler/Composer após o job de export (ou GCS + Transfer).
3. `DBT_TARGET=prod dbt run && dbt test` (perfil `prod` em `profiles.yml`). As implementações `bigquery__` das macros `xdb_*` existem mas precisam de um `dbt run` real antes do go-live.
4. Segment/Rudderstack podem substituir o export JSONL no futuro; o contrato `raw.*` é o ponto de troca.

## Dashboards (`dashboards/dashboards.yml`)
Executivo, Growth, Produto, Monetização, Marketplace, Operações — 16 cards, todos lendo só de `marts`/`semantic`. Importar o SQL no Metabase/Looker (ou consumir via `/admin/growth/overview`). `validate.mjs` é o gate de CI.

## Ciência de dados no backend
`/admin/datascience/*`: previsão de receita e de custo de IA (tendência OLS x sazonalidade semanal, intervalo de 80%; alerta `ai_cost_forecast` se a projeção do mês passa de `aiCostMonthlyBudgetCents`), funil, LTV por coorte, RFM, propensão, atribuição multi-touch (modelos em `src/modules/attribution/models.ts`) **reconciliada com Stripe** (receita atribuída = receita das transações).
