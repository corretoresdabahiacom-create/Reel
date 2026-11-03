# ADR 0005 — Cache de cenas e roteamento de IA atrás de flags
**Status:** aceito · **Data:** 2026-10-20
## Contexto
Custo de IA domina o COGS (≈ 88% na modelagem). Otimizar sem risco de regressão de qualidade.
## Decisão
Cache (`ai_scene_cache`), roteamento (`ai_cost_router`) e kill switch por custo (`ai_kill_switch`) entregues **desligados**; liberar por canário medindo qualidade, custo e taxa de acerto.
## Consequências
Economia só existe após ligar e medir; guardrail pode causar falso positivo (por isso o kill switch é opt-in). Cache copia objetos entre projetos para manter isolamento por usuário.
