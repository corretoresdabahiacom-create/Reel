# Revisão mensal de FinOps (60 min, dia 5 útil)

**Participantes:** Eng. (SRE), Produto, Financeiro, Dono de IA/Provedores. **Entradas:** `npm run finops:report`, painel de custos, relatório do guardrail.

## Pauta
1. Custos unitários vs. mês anterior e vs. meta (por vídeo, dublagem, por 1k MAU, por região).
2. Margem por segmento (Free subsídio; Pro; Business; marketplace) — algum segmento < meta (Pro ≥ 40%, Business ≥ 55%)?
3. Top-10 projetos mais caros (causas: duração, retries, regenerações) e anomalias do guardrail (disparos, falsos positivos, kill switch).
4. Top-10 oportunidades: progresso, nova priorização, economia realizada (cache `cost_saved_cents`).
5. Tagging: % de custo sem as 5 tags (meta 0); recursos órfãos.
6. Provedores: renovações, descontos por volume, novo candidato, calibração da matriz.
7. Compromissos (savings plans/RI) — apenas com ≥ 3 meses de histórico estável.
8. Preço/pacotes: rodar o simulador com custos medidos; propor ajuste se margem < meta.

## Saídas (registrar em ata no repositório)
Decisões, donos e prazos; atualizar `PROVIDER_MATRIX`; abrir tarefas em `docs/DEBT.md` quando for dívida; atualizar o data room (`npm run dataroom:sync`).
