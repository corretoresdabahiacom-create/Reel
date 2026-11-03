# Adendo de Nível de Serviço (SLA) — MODELO

> MODELO INTERNO. Os compromissos abaixo devem ser SEMPRE iguais ou mais brandos que os SLOs internos de `docs/SRE/SLOs.md` (SLA ≤ SLO). Revisão jurídica obrigatória.

Cliente: **{{customer}}** · Plano: {{plan}} · Vigência: {{start_date}} a {{end_date}}

| Serviço | Compromisso (SLA) | Medição |
|---|---|---|
| API | {{sla_api}}% mensal | taxa de requisições sem 5xx |
| Publicação | {{sla_publication}}% de sucesso | publicações concluídas / tentadas |
| Suporte (1ª resposta) | {{support_first_response_hours}} h | tempo até primeira resposta humana |

**Créditos de serviço:** {{credit_pct_minor}}% da mensalidade se abaixo do SLA; {{credit_pct_major}}% se abaixo de {{major_threshold}}%. Limite: {{credit_cap_pct}}% da mensalidade. Solicitação em até 30 dias.
**Exclusões:** manutenção programada com 72 h de aviso, força maior, falhas de plataformas de terceiros (TikTok, YouTube, etc.), uso fora dos termos.
**Status e comunicação:** status.nexusreel.com; atualização a cada 30 min em incidentes Sev1/Sev2.
