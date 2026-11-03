# Matriz de conformidade por jurisdição

> GERADO por `tools/compliance-audit/docs.ts` a partir de `src/modules/compliance/matrix.ts` — não editar à mão. **Não é parecer jurídico**: obrigações e prazos devem ser validados por advogado local antes de operar no país. Status: `ready` = implementado e evidenciado; `in_progress` = parcial; `not_started` = mercado fora de escopo atual.

| Código | Lei | Países | DSAR (dias) | Notificação de violação | Status | Responsável |
|---|---|---|---|---|---|---|
| BR | LGPD (Lei 13.709/2018) | BR | 15 | Comunicação à ANPD e titulares em prazo razoável (orientação: 3 dias úteis) | ready | dpo |
| EU | GDPR (UE 2016/679) + AI Act (UE 2024/1689) | DE, FR, ES, IT, PT, NL, BE, IE, AT, SE, DK, FI, PL, GR, CZ, RO, HU, BG, HR, SK, SI, LT, LV, EE, LU, MT, CY | 30 | Autoridade de controle em 72 h (art. 33); titulares sem demora indevida se risco elevado | ready | dpo |
| CA | PIPEDA (Canadá) + Lei 25 (Québec) | CA | 30 | Notificar o OPC e os indivíduos o quanto antes quando houver risco real de dano grave (RROSH); manter registro de todas as violações por 24 meses | in_progress | legal |
| US | Leis estaduais (CCPA/CPRA, VCDPA, CPA…) + COPPA (<13) | US | 45 | Leis estaduais de notificação de violação (prazos variam) | in_progress | legal |
| IN | DPDP Act 2023 | IN | 30 | Notificar o Data Protection Board e titulares (prazo nas Rules) | not_started | legal |
| SEA | PDPA (SG/TH/MY/PH) + UU PDP (ID) | SG, TH, MY, PH, ID, VN | 30 | Notificação à autoridade local (SG: 3 dias; ID: 3x24h) | not_started | legal |
| CN | PIPL | CN | 15 | Notificação imediata à autoridade e indivíduos | not_started | legal |

## BR — LGPD (Lei 13.709/2018)

- Base legal por finalidade (art. 7)
- Encarregado (DPO) nomeado
- ROPA (art. 37)
- RIPD/DPIA quando solicitado
- Direitos do titular em 15 dias
- Consentimento específico e revogável
- Transferência internacional com salvaguardas (art. 33)

Evidências: docs/PRIVACY.md, tests/07-lgpd-lifecycle.test.ts, compliance_ropa

## EU — GDPR (UE 2016/679) + AI Act (UE 2024/1689)

- Base legal (art. 6)
- DPIA (art. 35) para tratamento de alto risco
- ROPA (art. 30)
- DPO/representante na UE
- Direitos em 30 dias
- Transferência para fora da UE: SCC/DPF + TIA
- AI Act art. 50: rotular conteúdo sintético
- Residência de dados UE quando exigido

Evidências: docs/COMPLIANCE/AI_ACT.md, data_residency_routes, ai_act_registrations

## CA — PIPEDA (Canadá) + Lei 25 (Québec)

- Consentimento significativo
- Responsável pela privacidade designado
- Acesso/correção em 30 dias
- Avaliação de impacto à privacidade (Québec, Lei 25) para transferências fora da província
- Registro de incidentes (24 meses)

Evidências: docs/COMPLIANCE/MATRIX.md

## US — Leis estaduais (CCPA/CPRA, VCDPA, CPA…) + COPPA (<13)

- Verificar leis estaduais aplicáveis
- COPPA: bloquear <13 (já validado no cadastro por birthDate)

Evidências: nenhuma ainda.

## IN — DPDP Act 2023

- Consentimento claro e notificação
- Fiduciário de dados significativo: avaliar
- Transferência: lista de países restritos

Evidências: nenhuma ainda.

## SEA — PDPA (SG/TH/MY/PH) + UU PDP (ID)

- DPO (SG obrigatório)
- Consentimento e finalidade
- Residência/transferência por país

Evidências: nenhuma ainda.

## CN — PIPL

- Se aplicável: avaliação de segurança de transferência, localização de dados, representante local, regras de IA generativa (CAC)

Evidências: nenhuma ainda.
