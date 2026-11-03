# Runbook — plataforma de publicação instável (TikTok/YouTube/Instagram/marketplaces)
**Sintoma:** `publication-success-rate` caindo; erros 5xx/429 da plataforma; breaker `pcb:open:<plataforma>` aberto. Dono: Backend on-call.
1. Confirmar se é a plataforma (status oficial) ou nosso token (`integrations` expiradas → `refresh-tokens`).
2. Breaker já pausa novas tentativas por 2 min; se persistir > 15 min: **kill switch** `publish_<plataforma>` (flag) → usuários veem "temporariamente desativada" e podem baixar o vídeo.
3. Status page: componente `publishing` → `degraded`/`partial_outage` (override), comunicar (COMMS_TEMPLATES).
4. Ao normalizar: religar flag; reprocessar publicações `failed` com erro recuperável (fila `publication-<plataforma>`); ver DLQ.
5. Drill: `npm run bcp -- run publishing_platform_down`.
