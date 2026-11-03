# ADR 0002 — Postgres com RLS e `pg` cru
**Status:** aceito · **Data:** retroativo (Fases 1–6)
## Contexto
Isolamento por usuário e auditoria são requisitos; ORM esconderia SQL e a política de RLS.
## Decisão
`pg` com helpers `tx/asUser/asSystem`; RLS por usuário; migrations SQL versionadas (`up/down`), testadas a cada execução da suíte.
## Alternativas
Prisma/Drizzle (produtividade, menos controle de RLS/transação).
## Consequências
Mais SQL manual e revisão cuidadosa; ganho em previsibilidade e segurança. Réplica de leitura via `readPool`.
