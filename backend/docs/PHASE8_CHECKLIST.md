# Fase 8 — Checklist final

> Retrato no fechamento da fase (números de testes/operações daquela data). Estado atual após os Módulos 0–11 e a reauditoria: `docs/FINAL_REPORT_MODULES.md` e `audit/AUDIT_REPORT.md` (422 testes backend, 316 caminhos OpenAPI em 2026-10-21).

Legenda: ✅ entregue e testado · 🟡 entregue, não validado contra serviço/infra real · ⏳ depende de dados históricos · 🔁 atividade contínua

## A. Funcional (entregue e verificado em CI/testes)
- ✅ SLOs por serviço (`docs/SRE/SLOs.md`, `*.slo.yaml` → regras e dashboards gerados; `slo:check`)
- ✅ Burn-rate 14.4x/1h, 6x/6h, 1x/3d; error budget; congelamento <25%; alertas abrem incidente Sev2
- ✅ Incident bot, status page + RSS + inscrições com confirmação, postmortem automático (revisão exige causa raiz + ≥3 porquês)
- ✅ FinOps: custo unitário, tags obrigatórias, guardrail 3× média 7d, kill switch opt-in, cache de cenas, roteador de custo, simulador de preço
- ✅ Compliance: matriz por jurisdição, ROPA automático, DPIA assistido (rascunho → revisão humana), prova de consentimento, retenção por política, SLA de DSAR, divulgação de IA
- ✅ i18n profundo: ES-MX, perfis regionais, pseudolocalização, baseline de strings fixas
- ✅ Governança: KYC ≥R$5.000, sanções (Jaro-Winkler ≥0,92), dupla aprovação ≥R$10.000, SBOM/licenças, gerador de contratos
- ✅ Residência de dados (`DEPLOY_REGION` → 421), dashboard regional, KPIs SaaS (nulos quando faltam insumos)
- ✅ Data room (manifesto sincronizado), onboarding <1 semana (18 itens ≤ D5), ADRs 0001–0006, DEBT.md
- ✅ 9 ferramentas em `/tools`, 201 testes, 95% linhas, tsc/lint/OpenAPI (242 ops) limpos

## B. Depende de dados históricos
- ⏳ Burn-rate e orçamento de erro reais (precisa ≥30 dias de `slo_samples`)
- ⏳ Custos unitários medidos (hoje o relatório inicial é modelado/assumido)
- ⏳ Baseline do guardrail de custo (média 7d) e top-10 reais
- ⏳ KPIs (NRR, churn, LTV/CAC, margem) — exigem insumos financeiros externos
- ⏳ Capacidade: rodar `infra/load/capacity.js` em ambiente com dados representativos

## C. Não validado contra serviços/infra reais
- 🟡 Regras Prometheus não validadas com `promtool`
- 🟡 Adaptadores Slack/PagerDuty, provedores de KYC e sanções
- 🟡 C2PA: sidecar não assinado
- 🟡 Chaos, DR e BCP: lógica testada, não executados em infra; failover de IA reporta lacuna (um só provedor de vídeo real)
- 🟡 Multi-região: não provisionado
- 🟡 Políticas, NDA, DPA: modelos — exigem revisão jurídica; subprocessadores todos `pending_dpa`
- 🟡 DSAR mede apenas exportações; expiração de vídeos finais só em modo relatório
- 🟡 9 itens do data room marcados "EXTERNO PENDENTE"

## D. Atividades contínuas 🔁
| Atividade | Cadência | Dono |
|---|---|---|
| Revisão de SLOs / error budget | Mensal | SRE |
| Revisão FinOps + top-10 | Mensal | Eng + Finanças |
| Game day / teste de restore | Trimestral | SRE |
| Revisão de acessos | Trimestral | Segurança |
| Comitê de governança | Trimestral | Diretoria |
| Teste de continuidade (BCP) | Semestral | Operações |
| Auditoria de licenças/SBOM | A cada release | Eng |
| Revisão de DPIA/ROPA | Semestral ou a cada novo fornecedor | DPO |
| Dívida técnica (20% da capacidade) | Contínuo | Eng |
Calendário completo: `docs/SRE/CALENDAR.md`.
