# Modelos de dados (churn, LTV, propensão)

Serviço: `services/ml` (Python 3.11, FastAPI). Código: `ml/{features,train,evaluate,serve}.py`. Backend chama `POST /predict/batch` (cliente em `src/modules/retention/churn.client.ts`).

## Contrato
14 features ordenadas (`services/ml/features.json` == `src/modules/retention/features.ts`; teste de paridade): `days_since_last_login, tenure_days, projects_7d, projects_30d, gen_success_rate_30d, publications_7d, publications_30d, platforms_connected, credits_remaining, plan_ordinal, marketplace_purchases_90d, affiliate_links_active, onboarding_completed, revenue_90d_brl`.
Resposta: `{ version:{churn,ltv,propensity}, predictions:[{id,churn,ltv_brl,p_upgrade,p_credits,top}] }` (`top` = principais fatores).

## Serving seguro
Timeout de **50 ms** (`churn.modelTimeoutMs`); erro/timeout/serviço fora => **fallback heurístico** `heuristic-v1` (regras sobre inatividade e uso). Nunca bloqueia login ou fluxo do usuário; o cálculo roda em lote (job `churn-refresh`) e grava `users.churn_risk`.

## Treino e avaliação
- Divisão **temporal** (treino/validação/teste por data), nunca aleatória. Calibração **isotônica**.
- Churn (XGBoost ou LightGBM): AUC, PR-AUC, Brier, log-loss, ECE, lift top-10%. LTV 365 d (regressão): MAE vs baseline da mediana, R², Spearman, captura do top decil. Propensão: upgrade e compra de créditos.
- **Gate de promoção** (`evaluate.gate`): AUC >= 0,65, ECE <= 0,08 e LTV melhor que o baseline; reprovou => mantém o modelo anterior.
- Model card em `models/model_card.json` (versão, janela, fonte, métricas, `production_ready`).

## Métricas atuais — **dados SINTÉTICOS**
Rodada `python -m ml.train --source synthetic` (20.000 linhas): churn AUC 0,82 / ECE 0,023 / lift top-10 3,4x; upgrade AUC 0,76; créditos AUC 0,75; LTV MAE R$ 19,7 vs R$ 55,2 do baseline (R² 0,76). **Isso valida o pipeline, não o negócio**: o model card marca `production_ready: false`. Antes de usar em decisões reais, treinar com `--source db` quando houver histórico (recomendado: >= 3 meses e >= alguns milhares de usuários, com >= algumas centenas de eventos de churn).

## Operação
Reavaliar semanalmente com `evaluate.py` em janela recente; alarmar queda de AUC > 0,05 ou deriva de distribuição das features. Explicabilidade: `top` por predição; não usar churn/propensão para negar serviço ou preço individualizado (somente para comunicação/priorização).
