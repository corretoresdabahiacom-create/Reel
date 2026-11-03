# ADR 0006 — Docs-as-code e data room sincronizado
**Status:** aceito · **Data:** 2026-10-20
## Decisão
Documentação vive no repositório, revisada por PR; documentos derivados do código (matriz de compliance, ROPA, matriz de i18n, regras de SLO) são **gerados** e verificados no CI (`--check`). O data room (`docs/DATA_ROOM`) é cópia sincronizada por manifesto (`tools/data-room-sync`), com itens externos (demonstrações auditadas, cap table) marcados "EXTERNO PENDENTE".
## Consequências
Fonte única e auditável; exige disciplina de rodar os geradores (CI falha se defasado).
