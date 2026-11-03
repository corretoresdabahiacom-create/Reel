# Procedimento de violação de dados pessoais

Relógio começa na **ciência** (não na ocorrência). Registrar cada decisão com horário.

| Hora | Ação | Dono |
|---|---|---|
| 0 | Declarar incidente Sev1 (`source=security`); conter (revogar credenciais, isolar), preservar evidências | SRE/Segurança |
| ≤ 4 h | Classificar: quais dados, quantos titulares, quais jurisdições (residência do usuário); risco para titulares (alto/baixo) | DPO |
| ≤ 24 h | Decisão de notificar (matriz: `docs/COMPLIANCE/MATRIX.md` — prazos por lei) | DPO + Jurídico |
| ≤ **72 h** | **GDPR:** notificar a autoridade de controle (art. 33) se houver risco; titulares "sem demora" se risco elevado (art. 34) | DPO |
| 3 dias úteis (orientação) | **LGPD:** comunicar ANPD e titulares (art. 48) | DPO |
| conforme lei | CA/US estados, CN, SEA, IN: ver matriz | Jurídico |
| ≤ 5 dias úteis | Postmortem público (Sev1) sem dados sensíveis | Eng. |

Conteúdo mínimo da notificação: natureza do incidente, categorias e número aproximado de titulares/registros, contato do DPO, consequências prováveis, medidas adotadas/propostas.
Modelos: `docs/SRE/COMMS_TEMPLATES.md` (status/público) e DPA (`docs/legal/DPA.md`: operador notifica em até {{breach_notice_hours}} h).
Registro de violações (inclusive as não notificadas) mantido por 5 anos (`incidents` + `audit_logs`).
