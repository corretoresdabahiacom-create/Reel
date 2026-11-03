# Runbook — falha de provedor de IA

**Sintomas:** `AIProviderFailures`, cenas em `error`, `ai_provider_failures_total` subindo.

1. **Breaker:** após 3 falhas em 5 min o provedor abre por 10 min e o tráfego vai para o fallback (`AI_VIDEO_FALLBACK`). Verifique `redis-cli GET cb:open:<provider>`.
2. **Confirme o provedor:** status page do fornecedor; teste com uma cena manual. Erros 401/403 → credencial/quota (`KLING_*`, `ELEVENLABS_API_KEY`, `OPENAI_API_KEY` no Secrets Manager).
3. **Mitigações (em ordem):** (a) deixar o fallback atender; (b) trocar `AI_VIDEO_PROVIDER` para o alternativo e redeploy; (c) `generation_enabled=false` para mostrar manutenção (rascunhos preservados); (d) para a moderação, **não** desligar — fail‑closed é intencional.
4. **Reprocessar:** usuários podem usar *regenerar cena* (não cobra novamente: crédito só é debitado no sucesso). Em lote, `POST /catalogs/:id/batch-generate` repete os itens em `error`.
5. **Custos:** o fallback pode ter custo diferente — acompanhe `ai_cost_cents_total`.
