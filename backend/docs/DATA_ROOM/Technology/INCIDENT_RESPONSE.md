# Resposta a incidentes

## Plantão (on-call)
- Rotação semanal, primário + secundário; handoff com checklist (alertas abertos, mudanças em andamento).
- **Saúde do plantão:** limites em `settings.ops.oncall` — 8 pages/mês e 3 fora do horário por pessoa; `GET /admin/ops/oncall/load` e job semanal `burnout-report` sinalizam risco (ok/atenção/excedido). Pessoa em "excedido" sai da rotação no ciclo seguinte e a causa raiz do ruído é priorizada (20% de capacidade para dívida técnica, `docs/DEBT.md`).
- Compensação/folga pós-incidente noturno: política de RH (fora do código).

## Fluxo
1. **Detectar** (alerta SLO, usuário, equipe) → `npm run incident -- open ...` ou API `POST /admin/ops/incidents` (alertas de burn abrem Sev2 sozinhos).
2. **War room:** canal `#inc-<id>` criado pelo bot, papéis atribuídos (IC, líder técnico, comunicações, escriba). Videochamada fixa para Sev1.
3. **Comunicar:** status page pública `GET /status` (+ `/status.rss`, assinatura e-mail/SMS com confirmação) a cada 30 min (Sev1/2) / 2 h (Sev3).
4. **Mitigar → resolver:** `update` com status; ao resolver, rascunho de postmortem é gerado automaticamente.
5. **Postmortem:** revisão humana (causa raiz + ≥ 3 porquês), ações com dono e prazo; Sev1 público em ≤ 5 dias úteis (`GET /admin/ops/incidents/overdue`).
6. **Aprender:** incidente → runbook atualizado, teste de regressão e/ou novo SLO.

## Status page
`status.nexusreel.com` aponta para `GET /api/v1/status` (componentes: api, generation, publishing, dubbing, marketplace, cdn, auth). Estado = pior entre override manual e incidentes abertos. Uptime 90 dias calculado dos incidentes.

## Integrações
Slack (webhook/bot) e PagerDuty (Events v2) implementados em `src/modules/incidents/adapters.ts`; **não testados contra os serviços reais** (apenas contra um servidor HTTP local nos testes). Sem credenciais, o `LogNotifier` registra as mensagens no log.

## Game days
Trimestral, com cenário surpresa para o IC; calendário em `docs/SRE/CALENDAR.md`. Saída: lacunas viram itens de DEBT com prazo.
