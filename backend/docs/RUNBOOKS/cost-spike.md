# Runbook — pico de custo de IA

**Sintomas:** `AICostSpike`, log `custo diário de IA acima do limite`, `ai_budget_exceeded` para usuários.

1. **Quem está gastando?** `SELECT user_id, provider, operation, sum(cost_cents) FROM ai_usage WHERE created_at > now()-interval '1 hour' GROUP BY 1,2,3 ORDER BY 4 DESC LIMIT 20;`
2. **Abuso?** muitos projetos/cenas em poucos minutos, contas novas. Suspenda: `PATCH /admin/users/:id {"banned":true}` (efeito imediato).
3. **Bug (loop de retry/lote)?** verifique `batch_jobs` em `running` e jobs repetidos; cancele com `POST /batch-jobs/:id/cancel`.
4. **Conter:** reduzir `AI_COST_LIMIT_*_CENTS` (orçamento diário por plano) e redeploy; ou `generation_enabled=false`.
5. **Fornecedor:** conferir tarifa/plano e eventual cobrança indevida.
