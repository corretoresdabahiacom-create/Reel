# Calendário de testes de resiliência (12 meses a partir de nov/2026)

Dono é uma função, não uma pessoa; trocar pelo nome ao instanciar. Registrar cada execução em `/admin/ops/exercises` (agendar → completar com outcome e evidência).

| Quando | Tipo | Exercício | Dono |
|---|---|---|---|
| Mensal, dia 10 | load | Teste de capacidade k6 (1×→10×) | SRE |
| Mensal, dia 12 | restore | Restauração de backup Postgres + verificação | SRE |
| Mensal, dia 15 | chaos | worker-kill em staging | SRE + Backend |
| Nov/2026 | gameday | Game day #1: falha do provedor de IA (breaker + fallback) | IC rotativo |
| Dez/2026 | chaos | ai-provider-latency + redis-partition | SRE |
| Jan/2027 | bcp | Tabletop: ransomware | Segurança + Direção |
| Fev/2027 | chaos | platform-5xx-simulation | Backend |
| Mar/2027 | gameday | Game day #2: perda de região (sa-east-1) em staging | SRE |
| Abr/2027 | bcp | Tabletop: perda de pessoa-chave | Direção |
| Mai/2027 | dr | DR de Postgres (promoção de réplica) em staging | SRE + DBA |
| Jun/2027 | bcp | Tabletop: mudança regulatória de IA (UE) | Jurídico |
| Jul/2027 | gameday | Game day #3: incidente de segurança + notificação 72 h | Segurança |
| Ago/2027 | chaos | postgres-failover | SRE |
| Set/2027 | bcp | DDoS (tabletop + teste de WAF) | SRE |
| Out/2027 | dr | Re-teste de DR com correções | SRE |

Trimestral (jan/abr/jul/out): revisão de acessos, auditoria de licenças, comitê de compliance/ISO, revisão de custos. Mensal: revisão FinOps. Anual: revisão de políticas, DPIAs e plano de continuidade.
