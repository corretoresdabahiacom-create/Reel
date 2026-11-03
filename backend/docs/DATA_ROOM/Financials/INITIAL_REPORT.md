# Relatório FinOps inicial (modelagem) — out/2026

> **Natureza:** não há tráfego de produção medido. Este relatório usa as **premissas** do simulador (`pricing-sim.ts`: Pro = 20 vídeos/mês, 30 s, 1 idioma de dublagem, 2 publicações/vídeo, 15% regeneração; custo de IA 2,8 ¢/s; TTS 9 ¢/idioma; infra 2 ¢/publicação + 15 ¢/usuário). Todos os números são **estimativas** até haver `ai_usage` real. O relatório gerado do banco está em `docs/FINOPS/reports/2026-10.md` (vazio por construção).

## Achado principal — margem do plano Pro (imposto 8%, taxa de pagamento padrão, sem otimizações)

> **Preço vigente (reauditoria 2026-10-21):** Pro = **R$ 49,00** e Business = **R$ 199,00** (`src/modules/payments/payments.service.ts` `PLANS` e seed `pricing_regions` BR). As linhas abaixo são **cenários de preço**; o preço atual fica junto da linha R$ 49,90 (margem bruta ≈ 49% sem otimizações). R$ 19,90 e R$ 29,90 **não** são preços praticados.

| Preço Pro/mês | Receita líquida | COGS | Margem bruta |
|---|---|---|---|
| R$ 19,90 | R$ 17,24 | R$ 22,07 | **−28%** |
| R$ 29,90 | R$ 26,10 | R$ 22,07 | 15,4% |
| R$ 49,90 | R$ 43,82 | R$ 22,07 | 49,6% |

Com as otimizações simuladas (cache 10% de acerto, roteamento −12%, 30% das cenas em modelo menor com −50%): COGS cai de R$ 22,07 para R$ 15,76 → margens de **8,6% / 39,6% / 64,0%** respectivamente. **Conclusão:** nas premissas atuais, R$ 19,90 só fecha com otimizações *e* ainda fica abaixo da meta (≥ 40%); o preço (ou o limite de vídeos incluídos) deve ser decidido com custos **medidos** nos primeiros 60 dias. O custo de IA responde por ≈ 88% do COGS (R$ 19,32 de R$ 22,07).

## Top-10 oportunidades (ordem de impacto esperado)
Economia numérica só existe quando houver custo de IA medido; abaixo, esforço e dependência.

| # | Oportunidade | Esforço | Estado | Depende de |
|---|---|---|---|---|
| 1 | Roteamento por custo/qualidade | médio | implementado (flag desligada) | 2º provedor integrado |
| 2 | Modelo menor para cenas simples | médio | classificador pronto | modelo menor contratado |
| 3 | Cache de cenas | baixo | implementado (flag desligada) | ligar em produção + medir acerto |
| 4 | Reduzir subsídio do plano Free | baixo | proposto | decisão de produto/crescimento |
| 5 | Preço/limite por duração (31–60 s) | baixo | proposto | experimento de preço |
| 6 | 2º TTS mais barato | médio | candidato (azure-tts) | contrato + DPIA |
| 7 | Workers batch em spot | médio | requer dados de infra | cost-import |
| 8 | Savings plan/RI | baixo | requer 3 meses de histórico | histórico estável |
| 9 | TTL/formatos de CDN (WebP/AVIF) | baixo | requer dados de CDN | métricas de egress |
| 10 | Rightsizing mensal | baixo | processo | OpenCost |

## Próximos passos
Ligar `ai_scene_cache` em canário (5% → 100%); importar custos de infra; integrar 2º provedor de vídeo (também requisito de BCP); recalibrar a matriz após 30 dias de `ai_usage`.
