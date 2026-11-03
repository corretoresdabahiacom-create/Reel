# Dívida técnica e de operação (20% da capacidade)

Regra: **20% da capacidade de cada ciclo** é reservada para itens abaixo, escolhidos por impacto em risco/SLO/custo. Item vira ticket com dono e prazo; "good first issue" para onboarding marcado com 🌱.

| # | Item | Tipo | Impacto | Prioridade |
|---|---|---|---|---|
| 1 | Integrar 2º provedor de vídeo (Luma/Runway) + DPA + DPIA | continuidade/custo | elimina SPOF de IA | P0 |
| 2 | Validar regras Prometheus com `promtool` no CI e rodar contra Prometheus real | SRE | confiança nos alertas | P0 |
| 3 | Integrações reais de Slack/PagerDuty testadas ponta a ponta | incidentes | page real | P0 |
| 4 | Assinar manifesto C2PA (certificado) e embutir no MP4 | compliance IA | conformidade forte | P1 |
| 5 | Provedores reais de KYC e de sanções (listas oficiais) | governança | PLD/AML | P0 antes de saques reais |
| 6 | Importar custos de infra (Cost Explorer/OpenCost) | FinOps | custo por publicação/1k MAU | P1 |
| 7 | Infra multi-região real (Terraform) + DNS geográfico | escala/residência | residência UE/BR | P1 |
| 8 | Medir SLA de exclusão (gravar registro anonimizado antes do hard delete) | compliance | DSAR completo | P1 🌱 |
| 9 | Reduzir baseline de strings hardcoded (i18n) | i18n | tradução completa | P2 🌱 |
| 10 | Expurgo de vídeo final por política com aviso ao usuário | retenção | cumprir 365/730 d | P2 (decisão de produto) |
| 11 | Exercício real de DR/caos em staging | resiliência | validar RTO/RPO | P0 (calendário) |
| 12 | Contratar TMS, suporte 24/7, canal de denúncias, seguro cibernético | operação | — | P1 |
