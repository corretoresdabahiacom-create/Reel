# Architecture Decision Records

Decisões que mudam arquitetura, custo, segurança ou conformidade. Formato: `NNNN-titulo.md` com Contexto · Decisão · Alternativas · Consequências · Status (proposto/aceito/substituído). RFC (`docs/RFC/`) para mudanças grandes **antes** do ADR (prazo de comentários de 5 dias úteis). ADR é imutável: mudanças criam novo ADR que substitui.

| ADR | Título | Status |
|---|---|---|
| 0001 | Fila BullMQ/Redis com DLQ por fila | aceito |
| 0002 | Postgres com RLS e `pg` cru (sem ORM) | aceito |
| 0003 | SLOs como código (`slo/*.slo.yaml`) e geração de regras | aceito |
| 0004 | Residência de dados por usuário com 421 `wrong_region` | aceito |
| 0005 | Cache de cenas e roteamento de IA atrás de flags | aceito |
| 0006 | Docs-as-code e data room sincronizado | aceito |

Modelo: `docs/ADR/TEMPLATE.md`.
