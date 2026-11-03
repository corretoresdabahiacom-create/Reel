# Playbook de expansão de mercado

## Ordem sugerida (hipótese a validar)
1. **Brasil** (base): PT-BR, PIX/boleto, Mercado Livre e OLX como destinos de venda.
2. **México (ES-MX)**: mesma língua base LATAM, OXXO/SPEI, IVA 16%, Mercado Libre. Conteúdo ES-MX já em `locales/`.
3. **Argentina / Colômbia / Chile**: Mercado Pago; atenção a controle cambial e inflação (preço em moeda forte ou reajuste mensal).
4. **Índia, Indonésia, Filipinas**: alto volume, ticket baixo; UPI/QRIS/GCash; **só entrar com custo unitário de IA comprovado** (ver guardrail).
5. **EUA/UE**: maior ticket e concorrência; exige VAT/sales tax e conformidade GDPR.

## Checklist por país (go / no-go)
- [ ] Idioma: UI + templates + prompts de IA + locale de datas/moeda (`locales/`, `i18n`).
- [ ] Preço regional (`pricing_regions`) + câmbio (`fx_rates`) + imposto validado com contador local.
- [ ] Métodos de pagamento locais disponíveis (hoje **simulados**; PSP real pendente).
- [ ] Plataformas de destino relevantes (TikTok/Reels/Shorts disponíveis? marketplace local: Shopee, Temu, OLX, ML).
- [ ] Privacidade: LGPD (BR), GDPR (UE), CCPA (US-CA), leis locais; base legal, DPA com fornecedores, residência de dados.
- [ ] Suporte no idioma e fuso; conteúdo legal (termos, política) traduzido por revisor nativo.
- [ ] Moderação: regras de conteúdo por país.
- [ ] Parceiros locais (criadores, agências) — `docs/PARTNERSHIPS.md`.
- [ ] Meta de unidade: custo de IA por vídeo pronto < X% do ARPU regional (mart_ops_daily).

## Métricas de decisão (por mercado, 8 semanas)
Ativação D7, retenção D30, conversão p/ pago, ARPU (BRL normalizado), CAC por canal, custo IA/vídeo, reembolso. **Critério**: ARPU >= 3x custo de IA por usuário ativo e retenção D30 >= 60% da do Brasil; caso contrário, pausar o investimento de aquisição (mantendo o produto no ar).

## Riscos
Câmbio e controles (AR), fraude de pagamento local, saturação de plataformas, mudanças de política de APIs sociais, impostos digitais (cada país).
