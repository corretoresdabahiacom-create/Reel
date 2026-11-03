# Recomendações (Fase 7)

Código: `src/modules/recommendations/` (`recommendations.service.ts`, `catalog.ts`, `recommendations.routes.ts`). Resumo de produto em `docs/GROWTH_RETENTION.md`; este documento é a referência técnica.

## Endpoints (`/api/v1`, autenticados)
| Rota | Função | Entrada principal | Saída |
|---|---|---|---|
| `GET /recommendations/templates` | `templates(userId, {limit, category, surface})` | categoria opcional, `limit` 1–30 | `mode` (`cold_start`/`personalized`), `items[]` com `score`, `reasons[]`, `position`, `requestId` |
| `GET /recommendations/prompts` | `prompts(userId, {category, objective, locale})` | objetivo `sell`/`audience`/`test_ai` | sugestões de prompt por categoria/objetivo |
| `GET /recommendations/photo-ideas` | `photoIdeas(userId, {category, locale})` | categoria | ideias de foto para o PhotoCoach (Fase 2) |
| `GET /recommendations/platforms` | `platforms(userId, {category, goal})` | categoria, objetivo | plataformas ordenadas, `connected`, `needsConnection`, `basis` |
| `GET /recommendations/publish-time` | `publishTime(userId, platform)` | plataforma | 3 melhores horários no fuso do usuário (`nextAt` em UTC), `basis` |
| `POST /recommendations/events` | `recordEvents` | `impression`/`click`/`use`/`purchase`/`dismiss` | contagem gravada |
| `GET /admin/recommendations/metrics` | `metrics(days)` | janela | CTR, uso, compra, diversidade e novidade por superfície e variante |

## Templates
- **Cold start** (menos de `growth.recommendations.minInteractionsForPersonalized` interações, padrão **5**): `0,5 × popularidade (log do uso) + 0,35 × nota bayesiana (prior 4,0 com peso 5) + 0,15 × recência (meia-vida ~60 dias)`. Diversificação MMR com λ = 0,9.
- **Personalizado** (flag `recs_personalized` ligada, interações suficientes e variante `personalized` do experimento `rec_personalized`):
  - filtragem colaborativa item-item (coocorrência de compra/uso, similaridade cosseno): peso **0,45**;
  - conteúdo (afinidade com as categorias do histórico): peso **0,35**;
  - baseline de popularidade: peso **0,2**.

  O resultado passa por MMR com λ = 0,75. Cada item traz `reasons` legíveis ("Quem usou X também usou este").
- **Exclusões:** templates não aprovados, apagados, do próprio usuário ou já comprados.
- **Privacidade:** a coocorrência é um agregado entre usuários. A consulta roda com escalonamento explícito (`asSystem`, ver `docs/SECURITY_RLS.md`) e só devolve IDs e nomes de templates aprovados, nunca quem comprou.

## Plataformas e horário
- **Plataformas:** prior por objetivo (`PLATFORM_PRIOR`) × taxa de sucesso. A taxa vem do histórico do usuário quando há ≥3 publicações, senão do histórico do nicho (≥10, agregado) ou do prior 0,8. Contas conectadas ganham bônus de 1,15×, e a conversão de afiliados pode somar até +20%.
- **Horário:** cliques do próprio usuário (≥30) → coorte da região (≥100 cliques e ≥5 usuários distintos, para não revelar o padrão de uma pessoa) → prior por plataforma (`PUBLISH_PRIOR`). O resultado sai sempre no fuso do usuário.

## Feedback loop e métricas
- **Eventos** em `recommendation_events`, com `request_id` e `position` para medir CTR por posição. Métricas Prometheus: `recommendation_events_total{surface,action}`.
- **Métricas** (`/admin/recommendations/metrics`): CTR = cliques/impressões; uso e compra por impressão; **diversidade** = categorias distintas / itens da lista; **novidade** = parcela fora do top 10% de popularidade.
- **A/B:** experimento `rec_personalized` (baseline × personalizado), métrica primária `use` por impressão. Ver `docs/EXPERIMENTS.md`.

## Limitações
- Sem histórico real, o modo personalizado só se diferencia do baseline depois que houver coocorrências. Os pesos são iniciais e devem ser recalibrados pelo experimento.
- Não há modelo treinado offline para recomendação; o serviço de ML (`docs/ML.md`) cobre churn, LTV e propensão.
