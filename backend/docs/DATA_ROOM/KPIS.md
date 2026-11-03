# KPIs de SaaS — definições e fonte

Fonte dos valores: `POST /api/v1/admin/ops/board/compute` (cálculo ao vivo a partir de `transactions`/assinaturas/`users`) e `GET /admin/ops/board` (relatórios trimestrais salvos em `board_reports`). **Valores em tempo real não estão neste arquivo** (seria desatualizado); o data room recebe o relatório publicado. Regra: indicador sem base suficiente vale `null` — nunca zero fabricado.

| KPI | Fórmula (implementação: `src/modules/board/kpis.ts`) | Entradas | Observação |
|---|---|---|---|
| MRR / ARR | Σ mensalidades ativas normalizadas por mês / ×12 | assinaturas | não inclui compra de créditos avulsa |
| NDR | (MRR inicial + expansão − contração − churn) ÷ MRR inicial | coorte mês anterior × atual | por usuário |
| GRR | (MRR inicial − contração − churn) ÷ MRR inicial | idem | ≤ 100% |
| Churn (logos / receita) | 1 − logos retidos ÷ logos iniciais; (churn + contração) ÷ MRR inicial | idem | |
| CAC | gasto de marketing e vendas ÷ novos clientes | **gasto informado** (`marketingSpendCents`) | `null` sem gasto — não está no banco |
| LTV | ARPA × margem bruta ÷ churn mensal | ARPA, margem (FinOps), churn | `null` sem churn > 0 |
| LTV/CAC | LTV ÷ CAC | | meta ≥ 3 |
| Payback (meses) | CAC ÷ (ARPA × margem bruta) | | meta ≤ 12 |
| Magic number | ΔARR líquido do trimestre ÷ gasto S&M do trimestre anterior | gasto informado | |
| Rule of 40 | crescimento % + margem operacional % | margem informada | |
| Margem bruta | (receita líquida − COGS) ÷ receita líquida | `docs/FINOPS.md` | COGS de IA medido; infra só com import |
| Burn multiple | queima líquida ÷ ΔARR líquido | queima informada | menor é melhor (< 2) |
| Runway | caixa ÷ queima mensal | caixa e queima informados | |

## Ressalvas (para due diligence)
- **Números não auditados.** Entradas financeiras externas (gasto de marketing, caixa, queima, margem operacional) são **informadas manualmente** e marcadas como tal no relatório.
- Sem tráfego histórico suficiente, vários KPIs ficarão `null` por design.
- Série mensal começa quando houver cobrança real; nenhuma métrica de tração deve ser citada antes disso.
