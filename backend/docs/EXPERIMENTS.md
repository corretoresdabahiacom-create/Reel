# Plataforma de experimentação (Fase 7)

## Como funciona
- **Atribuição determinística**: `bucket = FNV-1a(experimentKey + ":" + userId) mod 10000` mapeado nos pesos das variantes. Mesmo usuário => mesma variante em qualquer instância, sem estado. A primeira atribuição é gravada (Postgres + cache Redis): mudanças posteriores de peso **não** movem usuários já atribuídos (sticky).
- **Sem flicker**: o cliente chama `GET /experiments/active` no boot (pré-carga). Sem resposta/erro => **controle** (primeira variante). `POST /experiments/:key/assign` registra a *exposição* só quando a variante é realmente exibida (uma vez por sessão no kit `src/services/growth`).
- **Vencedor liberado**: `conclude` com `ship=<variante>` faz todos receberem a vencedora (sem novo deploy); experimento concluído nunca atribui novos usuários ao perdedor.
- **Holdout global** (`growth.holdoutPct`): fatia de usuários nunca entra em experimentos (mede o efeito agregado do programa).
- **Opt-out**: usuário que revoga *cookies/analytics* sai dos experimentos (recebe controle e não é medido).
- **Admin**: `POST/GET/PATCH /admin/experiments`, `.../start|pause|conclude`, `.../results?correction=none|bonferroni|holm|bh`, `POST /admin/experiments/plan` (tamanho de amostra), `GET /experiments/debug` (variante efetiva; no app, tela `/__experiments`).

## Estatística
- Frequentista por padrão (z de duas proporções p/ conversão; Welch p/ médias como receita/usuário; IC 95%), Bayesiano opcional (Beta-Binomial por Monte Carlo com semente).
- **SRM** (qui-quadrado nas contagens por variante): alerta se a divisão observada destoa da configurada (p < 0.001) — resultado com SRM não deve ser lido.
- **Múltiplas variantes/métricas**: correção Bonferroni, Holm ou Benjamini-Hochberg (parâmetro `correction`).
- **Planejamento**: `plan` recebe baseline, MDE relativo, alfa e poder e devolve n por variante. Não encerre antes do n planejado (peeking infla falso positivo).

## Guardrails (custo de IA incluso)
Cada experimento declara guardrails (ex.: custo de IA por usuário, taxa de erro de geração, reembolsos). Uma violação só dispara quando **as três** condições ocorrem: mudança relativa acima do limite **e** significância Welch unilateral **e** amostra mínima. Violação contínua por `minHours` => experimento é **pausado automaticamente** e um alerta é gravado em `growth_alerts` (`GET /admin/growth/alerts`). Job `guardrails-check` roda periodicamente; também `POST /admin/experiments/guardrails/check`.
O custo de IA é guardrail padrão de **todo** experimento que altera geração, limites ou paywall.

## Boas práticas
1. Uma hipótese, uma métrica primária, guardrails definidos antes de iniciar.
2. Toda variante tem `payload` versionado; o cliente nunca decide variante localmente.
3. Dados de resultado: `mart_experiments` no dbt (exposição, conversão 14 d, receita e custo de IA por usuário exposto).

## Catálogo inicial (10 experimentos semeados em `migrations/0005_growth_seed`)

> Tabela alinhada às chaves **realmente semeadas** (corrigida na Fase 8: a versão anterior listava chaves que não existiam no banco). Fonte: tabela `experiments`.

| # | Chave | Hipótese | Variantes | Métrica primária | Guardrails |
|---|---|---|---|---|---|
| 1 | `create_flow_order` | Começar pelo PhotoCoach melhora a qualidade das fotos e a taxa de vídeos montados. | control/script_first | conversion · `video_assembled` | ai_cost_cents |
| 2 | `marketplace_ranking` | Ranking personalizado aumenta o uso de templates versus popularidade. | control/personalized/recent | conversion · `template_used` | — |
| 3 | `onboarding_flow` | Reduzir o atrito inicial aumenta a ativação (1º vídeo montado em 7 dias). | control/one_slide/short_video | conversion · `video_assembled` | ai_cost_cents |
| 4 | `paywall_price` | Preço menor eleva a conversão o suficiente para aumentar a receita por usuário exposto. | control/low/high | conversion · `subscription_started` | event:refund_requested |
| 5 | `paywall_trial_structure` | Trial de 7 dias aumenta conversão; o anual com desconto aumenta o LTV. | control/trial_7d/annual | mean · `revenue_recorded` | event:refund_requested |
| 6 | `paywall_trigger_timing` | Mostrar a oferta logo após a 1ª geração bem-sucedida converte mais que após a 3ª ou no download. | control/after_first/on_download | conversion · `subscription_started` | event:project_created |
| 7 | `push_timing` | Enviar no horário preferido do usuário aumenta o clique frente a horário fixo. | control/preferred_hour/morning | conversion · `project_created` | event:notifications_disabled |
| 8 | `rec_personalized` | Recomendações personalizadas elevam o CTR → uso de templates. | control/personalized | conversion · `template_used` | — |
| 9 | `referral_reward` | Recompensa maior aumenta indicações ativadas sem destruir a margem. | control/low/high | conversion · `referral_converted` | ai_cost_cents |
| 10 | `watermark_free` | Marca d'água com QR gera mais indicações sem reduzir a ativação. | control/none/qr | conversion · `referral_clicked` | event:video_published |
