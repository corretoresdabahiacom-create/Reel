# Plano de continuidade de negócio (BCP)

> Versão 1.0. RTO/RPO são **metas**; cada cenário só passa a ser "validado" com um exercício registrado (`bcp_scenarios.last_tested_at`, `resilience_exercises`). Drills automatizados: `npm run bcp -- run <cenário>`. Calendário: `docs/SRE/CALENDAR.md`.

| Cenário | RTO | RPO | Estratégia | Drill |
|---|---|---|---|---|
| <a id="ai-provider"></a>Falha do provedor de IA | 15 min | 0 | circuit breaker (3 falhas/5 min → 10 min aberto) + fallback; flag de geração; 2º provedor | **automatizado** — hoje reporta lacuna (sem 2º provedor real) |
| Perda de região da nuvem | 60 min | 5 min | `docs/SRE/DR.md` | **automatizado (lógica)** + DR real semestral |
| <a id="ddos"></a>DDoS | 30 min | 0 | WAF/CDN, rate limit, flags | tabletop + teste de WAF |
| <a id="ransomware"></a>Ransomware | 4 h | 15 min | backups imutáveis, contas segregadas, restauração em conta limpa | tabletop |
| <a id="key-person"></a>Perda de pessoa-chave | 24 h | 0 | docs-as-code, runbooks, ≥ 2 pessoas por sistema crítico, acesso break-glass | tabletop |
| <a id="publishing"></a>Plataforma de publicação fora | 30 min | 0 | breaker + kill switch `publish_<plataforma>`; usuário baixa o vídeo | **automatizado** |
| <a id="regulatory"></a>Mudança regulatória (ex.: IA na UE) | 7 dias | 0 | flags regionais, marcação já disponível, revisão jurídica | tabletop semestral |

## Lacuna reconhecida (não maquiar)
`npm run bcp -- run ai_provider_failure` retorna `gaps_found`: apenas **um** provedor real de vídeo e de voz está integrado; o fallback configurado é o mock. Fechar a lacuna = integrar Luma (ou outro) com contrato, DPA e DPIA — item #1 em `docs/DEBT.md`.

## Seguro cibernético (stub)
Contratação **não realizada**. Passos: levantar cobertura desejada (resposta a incidentes, extorsão, interrupção de negócio, responsabilidade por privacidade), questionário de segurança (usar `INFOSEC_ISO27001.md` e evidências), cotar 3 corretoras, decidir com Financeiro. Apólice e contato 24 h devem constar no runbook de crise quando existirem.

## Comunicação de crise
Porta-voz único (direção); mensagens de `docs/SRE/COMMS_TEMPLATES.md`; ordem: equipe → clientes B2B afetados → status page/usuários → imprensa/reguladores (quando aplicável, DPO/Jurídico decidem). Árvore de contatos 24 h mantida fora do repositório (dados pessoais) — local a definir.

## Testes
Restauração de backups mensal; continuidade (tabletop/drills) conforme calendário; resultados em `resilience_exercises` e no painel executivo; cenário sem teste > 180 dias aparece em `GET /admin/ops/bcp/scenarios` (`overdue`).
