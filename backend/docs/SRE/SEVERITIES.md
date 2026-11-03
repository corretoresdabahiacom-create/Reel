# Severidades de incidente

| Sev | Critério | Resposta | Atualização pública | Postmortem |
|---|---|---|---|---|
| **Sev1** | Indisponibilidade total/parcial ampla (API, login, geração ou publicação para a maioria), perda ou exposição de dados, falha de segurança ativa | page imediato, comandante em ≤ 5 min, war room, status page | **a cada 30 min** | público em **≤ 5 dias úteis** |
| **Sev2** | Degradação relevante (uma plataforma de publicação, dublagem, latência acima do SLO com burn alto), subconjunto de usuários | page em horário estendido, comandante em ≤ 15 min | a cada 30 min | interno em ≤ 5 dias úteis |
| **Sev3** | Impacto pequeno/contornável, sem violação de SLO iminente | ticket, resolução em dias úteis | a cada 2 h (se público) | opcional (ação em backlog) |

## Papéis
- **Comandante (IC):** decide, delega, controla o relógio; não investiga. **Líder técnico**, **Comunicações** (status page, suporte), **Escriba** (linha do tempo). Preenchidos em `incidents.roles`.
- Troca de comandante é anunciada no canal; ninguém acumula comandante + líder técnico em Sev1.

## Regras
1. Mitigar antes de entender (rollback, kill switch, failover).
2. Toda decisão e ação no canal do incidente (`#inc-<id>`), em UTC.
3. Dúvida de severidade → escolha a maior; rebaixar depois.
4. Incidente de segurança com dado pessoal aciona `docs/COMPLIANCE/BREACH.md` em paralelo (relógio de 72 h).
5. Fecho: causa raiz, ações com dono e prazo, revisão humana do postmortem.
