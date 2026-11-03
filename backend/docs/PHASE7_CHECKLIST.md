# Fase 7 — Checklist final

> Retrato no fechamento da fase (números de testes/operações daquela data). Estado atual após os Módulos 0–11 e a reauditoria: `docs/FINAL_REPORT_MODULES.md` e `audit/AUDIT_REPORT.md` (422 testes backend, 316 caminhos OpenAPI em 2026-10-21).

## A. Funcional e verificado por teste (150 testes backend, 10 kit frontend, 10 ML Python (1 pulado), 44 testes dbt)
- [x] Experimentos: hash determinístico, sticky, sem flicker (controle no fallback), vencedor liberado, guardrails com pausa automática + alerta, SRM, Holm/BH/Bonferroni (`tests/11`)
- [x] A/B de paywall ponta a ponta (exposição -> conversão -> resultados) e experimento de preço A/B/C com `priceKey` validado no servidor (`tests/13`)
- [x] Recomendações: cold start -> personalizado após 5 interações, feedback e CTR/diversidade/novidade (`tests/12`)
- [x] Retenção: coorte D7 no dbt (golden D7=0,5), churn score em lote com timeout/fallback, campanha "D+7 sem publicar" para o segmento certo, tetos/quiet hours/opt-out (`tests/12`, dbt)
- [x] Paywall após a 3ª geração, créditos de indicação só após o 1º vídeo, dupla recompensa uma única vez (`tests/13`)
- [x] Antifraude de indicação: mesmo dispositivo, auto-indicação, e-mail descartável, velocidade por IP, teto mensal (`tests/13`)
- [x] Multi-moeda (8 moedas), MXN + OXXO **simulado** + conteúdo ES-MX, imposto, IOF (`tests/13`)
- [x] Waitlist, UTM e atribuição multi-touch **reconciliada com Stripe (delta 0)**; RFM; previsão de receita e de custo de IA com alerta (`tests/14`)
- [x] Parceiros: cadastro, revenue share sobre o líquido, rastreio de vendas, pagamento (`tests/14`); taxa reduzida p/ criador verificado
- [x] Analytics: taxonomia versionada, quarentena, PII bloqueada, pseudonimização, consentimento, tombstone LGPD (`tests/14`)
- [x] Export -> raw -> dbt run/test ponta a ponta sem uuid/e-mail (`tests/16`); 16 cards de BI executados contra o dbt (`dashboards/validate.mjs`)
- [x] Serviço ML: treino, avaliação, gate, serving, paridade de features (`tests/15`, pytest)
- [x] Fases 1-6 intactas (suíte anterior verde); OpenAPI confere com as rotas (180 operações); tsc e lint limpos; cobertura 94,5% linhas

## B. Funciona, mas depende de dados históricos reais
- [ ] Churn/LTV/propensão: treinados **só com dados sintéticos** (`production_ready:false`); retreinar com `--source db` (>= 3 meses de histórico)
- [ ] Previsões de receita/custo de IA: precisam de >= algumas semanas de série (intervalos largos até lá)
- [ ] Significância dos experimentos, ICE do backlog, preços regionais e metas de mercado: hipóteses até haver tráfego
- [ ] Retenção D30/D90 e LTV por coorte: só ficam não-nulos quando a coorte amadurece
- [ ] Recomendação personalizada: qualidade depende de volume de interações

## C. NÃO verificado neste ambiente (integrações reais)
- BigQuery (macros `bigquery__` e load jobs), Segment/Rudderstack, GrowthBook, OneSignal/Customer.io/FCM/APNs reais, PSPs locais reais (OXXO/SPEI/UPI/PIX/GCash/QRIS — só simulação), Stripe com preços regionais reais, validação fiscal por país, dashboards em Metabase/Looker (SQL validado em Postgres, não renderizado), deploy do serviço ML (Docker não executado).
- Frontend: kit testado em unidade (Node); telas, deep links e SDKs de push no app nativo não foram exercitados em dispositivo.

## D. Fase 8 — Operação contínua & escala (não iniciada)
SRE (SLOs/error budget, on-call), resposta a incidentes, custo unitário e FinOps, M&A/due diligence, i18n profundo (RTL, pluralização, conteúdo por país), conformidade contínua (auditorias, DPIA, SOC2/ISO).
