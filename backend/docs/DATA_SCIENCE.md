# Data Science aplicada — metodologia (Fase 7)

Código: `src/modules/attribution/`, `src/modules/datascience/`, `src/modules/retention/`, `services/ml/`, `dbt/`. Modelos de churn, LTV e propensão: `docs/ML.md`. Warehouse e BI: `docs/DATA_WAREHOUSE.md`. Taxonomia de eventos: `docs/ANALYTICS_TAXONOMY.md` (gerado).

## 1. Atribuição multi-touch
- **Toques:** `attribution_touches` (source/medium/campaign de UTM, referral ou afiliado), gravados no app, no backend e nos webhooks.
- **Modelos** (`attribution/models.ts`, funções puras): `first_touch`, `last_touch`, `last_non_direct` (padrão de negócio), `linear`, `u_shaped` (40/20/40) e `time_decay` (meia-vida de 7 dias).
- **Regras:**
  - "direct" só recebe crédito quando não há outro toque;
  - o crédito soma **exatamente** o valor da conversão, com os centavos distribuídos pelo método do maior resto.
- **Conciliação:** `GET /admin/attribution/report` parte das transações pagas (`subscription`, `credit_purchase`, em BRL) e distribui cada uma pelos toques dos últimos 30 dias (`lookbackDays`). Receita sem toque vai para o canal `unattributed`, de modo que o total atribuído concilia com a receita registrada (Stripe/Pix) e a diferença fica visível.

## 2. Segmentação RFM
- Recência, frequência e valor em **quintis**. Empates recebem o mesmo quintil e zeros ficam no nível 1.
- O segmento é derivado por regra (`rfmSegment`: campeões, leais, em risco, hibernando, novos etc.) e gravado em `users.rfm_segment`.
- Atualização semanal, ou manual via `POST /admin/retention/rfm/refresh`. Alimenta campanhas de ciclo de vida e recomendações.

## 3. Propensão
Upgrade e compra de créditos são modelos separados, servidos pelo serviço de ML (timeout de 50 ms, fallback heurístico). `GET /admin/datascience/propensity?target=upgrade|credits` lista os usuários de maior propensão, só para priorizar comunicação; nunca para preço individual.

## 4. Forecasting
- **Método** (`datascience/forecast.ts`): tendência linear (OLS) × sazonalidade semanal multiplicativa (com ≥14 dias de série). Intervalo de ~80% calculado pelo desvio dos resíduos. Com <7 pontos, usa a média ±30%.
- **Receita:** `GET /admin/datascience/forecast/revenue`, com histórico configurável e horizonte em dias.
- **Custo de IA:** `GET /admin/datascience/forecast/ai-cost` projeta o mês (realizado + previsto). Se a projeção passa de `growth.aiCostMonthlyBudgetCents`, abre **um** alerta por mês. É o guardrail de custo da Fase 7, e o FinOps da Fase 8 (`docs/FINOPS.md`) acrescenta o guardrail de 3× a média de 7 dias.
- **Capacidade de filas:** coberta pelos SLOs de fila (`slo/queues.slo.yaml`) e pelo teste de capacidade (`infra/load/capacity.js`).

## 5. Funil
`GET /admin/datascience/funnel?from&to` conta usuários distintos (ID pseudonimizado) por passo, a partir dos eventos de servidor (`FUNNEL_STEPS`):

cadastro → 1º projeto → vídeo montado → publicação → assinatura

A conversão é calculada passo a passo. As versões diária e por coorte ficam no dbt (`mart_funnel_daily`, `mart_funnel_cohort`).

## 6. LTV por coorte
`GET /admin/datascience/cohort-ltv?months=6` traz a receita acumulada (BRL) por usuário da coorte mensal de cadastro em D0/D30/D60/D90. Recortes por canal de aquisição, variante de onboarding e região ficam em `mart_ltv_cohorts`. Coortes imaturas saem como `NULL`, nunca como zero.

## 7. Guardrails de IA
Taxa de sucesso de geração, custo médio por projeto, tempo médio de geração e reclamações, vindos de `ai_usage`, `generation_logs` e `reports`. Ficam no dashboard de operações (`dashboards/operacoes.sql`) e nos SLOs de geração (`slo/generation.slo.yaml`).

## Princípios
- **Pseudonimização:** eventos sem PII e `pseudo_id = HMAC(ANALYTICS_PSEUDO_SALT, user_id)`.
- **Consentimento:** sem consentimento de métricas, o evento entra só no agregado.
- **Separação temporal:** treino e validação separados por data; nenhuma métrica de modelo é reportada com dados sintéticos sem esse aviso.
- **Sem dados históricos ainda:** todas as séries de produção estão vazias; os números dos testes são sintéticos.
