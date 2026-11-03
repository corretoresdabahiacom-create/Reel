# Backlog de experimentos (priorização ICE)

Score = (Impacto + Confiança + Facilidade) / 3, cada 1-10. Reavaliar mensalmente com dados reais; **os scores abaixo são estimativas iniciais**, não resultados.

| Prioridade | Ideia | I | C | F | ICE | Depende de |
|---|---|---|---|---|---|---|
| 1 | Preço Pro regional (`pro_price_*`) por região | 9 | 6 | 8 | 7.7 | tráfego por região |
| 2 | Paywall na 3ª geração vs 1ª | 8 | 7 | 9 | 8.0 | - |
| 3 | Onboarding adaptativo por objetivo | 8 | 6 | 7 | 7.0 | - |
| 4 | Push D+7 (copy/horário) | 6 | 7 | 9 | 7.3 | consentimento de push |
| 5 | Pack de créditos com âncora | 6 | 6 | 8 | 6.7 | volume de compradores |
| 6 | Recompensa de indicação (20/20 vs 10/30) | 7 | 5 | 8 | 6.7 | volume de convites |
| 7 | Watermark com CTA vs discreta | 7 | 5 | 7 | 6.3 | - |
| 8 | Trial de 7 dias do Pro | 8 | 5 | 5 | 6.0 | Stripe trial + custo IA |
| 9 | Cobrança anual com desconto | 7 | 6 | 6 | 6.3 | base de assinantes |
| 10 | Recomendação por categoria (CTR) | 5 | 6 | 7 | 6.0 | 5+ interações/usuário |
| 11 | Quiet hours default 22-8 vs 21-9 | 3 | 6 | 9 | 6.0 | - |
| 12 | Página de template SEO com CTA vs sem | 6 | 4 | 6 | 5.3 | tráfego orgânico |
| 13 | Comissão do marketplace 12% vs 15% p/ criadores não verificados | 5 | 4 | 6 | 5.0 | liquidez do marketplace |
| 14 | Oferta de win-back D+45 (créditos vs desconto) | 6 | 5 | 6 | 5.7 | base inativa |

## Regras de entrada
1. Hipótese falsificável + métrica primária + guardrail de custo de IA.
2. Tamanho de amostra viável em até 4 semanas (`POST /admin/experiments/plan`); senão, juntar com outro ou cortar.
3. No máximo 1 experimento por superfície simultaneamente (paywall, onboarding, push) para evitar interação.
