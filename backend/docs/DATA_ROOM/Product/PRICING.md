# Precificação, monetização e paywall

## Preços regionais (tabela `pricing_regions`, editável sem deploy)
| Região | Moeda | Pro (unid. menor) | Imposto | Métodos locais |
|---|---|---|---|---|
| BR | BRL | 4.900 (R$ 49,00) | incluso | cartão, boleto (PIX simulado) |
| US | USD | 1.299 | sales tax (não incluso) | cartão |
| EU | EUR | 1.199 | VAT 21% | cartão |
| MX | MXN | 19.900 | IVA 16% | cartão, **OXXO**, SPEI |
| AR | ARS | 1.290.000 | IVA 21% | cartão |
| IN | INR | 39.900 | GST 18% | UPI, netbanking, cartão |
| ID | IDR | 59.000 (sem decimais) | PPN 11% | QRIS, transferência |
| PH | PHP | 29.900 | VAT 12% | GCash, cartão |
Valores iniciais para teste de mercado; **revisar com dados reais** e experimento (`pro_price_*`). `EXPONENT` trata moedas sem casas decimais (IDR). Câmbio em `fx_rates` (BRL por unidade maior); todo valor é normalizado para `amount_brl_cents` para relatórios, atribuição e LTV.

## Cotação e checkout
`POST /billing/quote` devolve preço base, imposto e total na moeda local (IOF 3,5% quando aplicável ao cartão internacional). Checkout Stripe para cartão. Métodos locais (`oxxo, spei, upi, gcash, bank_transfer, boleto, qris, netbanking`) valem **só para pacotes de créditos** e são **simulados**: geram referência/QR fictícios e confirmam por webhook HMAC em `/webhooks/local` (header `x-signature`, segredo `PIX_WEBHOOK_SECRET`). Fora do modo simulado a API responde **501** até um PSP local real ser integrado (nada disso foi testado com PSP real). `priceKey` de experimento é **validado no servidor** (cliente não escolhe preço).

## Paywall contextual
`POST /monetization/paywall/evaluate {trigger, peek}`. Gatilhos: `first_generation`, `third_generation`, `download_no_watermark`, `credits_exhausted`, `credits_80pct`, `third_platform_free`, `three_videos_day`. Regras: teto por gatilho/dia e por semana (`paywall.capPerDayPerTrigger`, `capPerWeek`), `peek` avalia sem contar exibição. Resposta traz oferta (plano ou pack) e `priceKey` quando há experimento de preço.

## Créditos e marketplace
Packs regionais `c10/c50/c200` (packs legados `p50…` continuam válidos). Marketplace: comissão padrão por `split(price, feePct)`; criadores **verificados** pagam `creatorVerifiedFeePct` (12%). Créditos de indicação não geram receita nem comissão.

## Gatilhos de upgrade
Créditos >= 80% usados, 3 vídeos no dia, 3ª plataforma conectada no plano free, download sem marca d'água, propensão alta (`p_upgrade`) do modelo — usados por campanhas de ciclo de vida, sempre respeitando tetos de frequência.

## Guardrails
Custo de IA por usuário, reembolsos em 30 d e churn 30 d são monitorados em todo experimento de preço. Orçamento mensal de IA (`aiCostMonthlyBudgetCents`) gera alerta de previsão (`ai_cost_forecast`).

> Impostos são estimativas operacionais para exibição; **validar com contador/jurídico** em cada país antes de operar (registro fiscal, nota, retenções).
