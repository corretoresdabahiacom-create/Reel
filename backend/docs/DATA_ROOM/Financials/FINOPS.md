# FinOps

Objetivo: saber quanto custa cada vídeo, publicação, dublagem e usuário; proteger a margem por segmento e reagir a picos de custo de IA em horas, não em semanas.

## Custos unitários (definição)
| Métrica | Fórmula | Fonte | Disponível hoje? |
|---|---|---|---|
| Custo por vídeo | Σ `ai_usage.cost_cents` dos projetos concluídos ÷ nº de vídeos (por plano e por faixa de duração) | `ai_usage` (medido) | **sim**, quando houver tráfego |
| Custo por dublagem (idioma) | custo médio de TTS por síntese | `ai_usage` | sim (por idioma só a contagem — `ai_usage` não guarda idioma) |
| Custo por publicação | infra rateada ÷ publicações | `cost_snapshots` (importado) | **não** até importar custos de infra |
| Custo por usuário/mês | IA do usuário + infra rateada | `ai_usage` + `cost_snapshots` | parcial (IA) |
| Infra por 1k MAU (por região) | infra ÷ MAU × 1000 | `cost_snapshots` + eventos | não até importar custos |
| Margem bruta por segmento | (receita líquida − COGS) ÷ receita líquida; Free = subsídio | `transactions` + custos | sim (receita) / parcial (COGS) |

Quando faltam dados medidos o sistema usa **premissas explícitas** (`source: "assumed"`) e as marca; nunca apresenta estimativa como medida.

## Tags obrigatórias (enforcement)
Todo recurso de nuvem precisa de `env`, `service`, `region`, `team`, `cost-center`. `POST /admin/ops/finops/cost-import` **rejeita** linhas sem as 5 tags e devolve a lista (contabilizada no relatório). Terraform deve aplicar `default_tags` (ver `infra/terraform/README.md`). Recursos sem tag = custo "não alocado", item fixo da revisão mensal.

## Módulo de otimização de custo de IA (`src/modules/cost-optimization`)
- **Cache de cenas** (flag `ai_scene_cache`, desligada por padrão): hash de prompt/texto/duração/modo/referências/frame anterior; copia os objetos para o novo projeto; contabiliza economia.
- **Roteamento custo×qualidade** (flag `ai_cost_router`): escolhe o provedor mais barato que cumpre qualidade e latência, respeitando circuit breaker; só provedores *integrados* entram (hoje: kling para vídeo, elevenlabs para TTS).
- **Classificador de complexidade** (distilação): cenas simples (transição/close-up curto) vão a um modelo menor quando houver um integrado.
- **Batching:** agrupamento por provedor quando o provedor oferecer API de lote.
- **Pré-aquecimento:** cache de storyboards/assets comuns de templates populares (estende o cache).
- **Guardrail:** custo de hoje > **3×** a média móvel de 7 dias (ou teto absoluto) → alerta em `growth_alerts`; com a flag `ai_kill_switch` ligada, desliga `generation_enabled` (kill switch) e audita; reativação manual `POST /admin/ops/finops/guard/release`. Job a cada 15 min.
- **Simulador de pricing** (`POST /admin/ops/finops/simulate`): preço × imposto × taxa de pagamento × perfil de uso × otimizações → margem antes/depois.

## Revisão e relatórios
Mensal (`docs/FINOPS/MONTHLY_REVIEW.md`); `npm run finops:report -- --month AAAA-MM` gera `docs/FINOPS/reports/AAAA-MM.md` (top-10 projetos mais caros e top-10 oportunidades). Matriz de provedores: `docs/FINOPS/PROVIDER_MATRIX.md`. Relatório inicial: `docs/FINOPS/INITIAL_REPORT.md`.

## Limites conhecidos
- Sem importação de custos de infraestrutura (Cost Explorer/OpenCost), custo por publicação e infra por 1k MAU ficam `null`.
- Valores da matriz de provedores são estimativas iniciais a calibrar com `ai_usage`.
- Kill switch é decisão de negócio: ligar a flag `ai_kill_switch` só após validar limiares em produção (risco de falso positivo derrubar a geração).
