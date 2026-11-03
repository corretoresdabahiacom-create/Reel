# Runbook — rollback

**Código:** `Actions → CD → Run workflow` com `rollback_to=<SHA anterior>` (pula o build e reimplanta a imagem existente em staging → produção com canary), ou, emergência: `infra/scripts/deploy-previous.sh nexusreel-production` (revisão anterior do task definition). O `canary.sh` já reverte sozinho (peso 100% no blue) se 5xx > 2% ou `/readyz` falhar durante o canary.

**Schema:** migrations seguem *expand/contract*, então a versão anterior do código funciona com o schema novo. **Não** rode `migrate down` em produção salvo instrução explícita do DBA — o `down` existe para dev/CI e para reverter a última migration quando ela ainda não foi usada por escrita de produção.

**Feature:** prefira kill switch (`PATCH /admin/flags/<flag>`): `generation_enabled`, `publish_<plataforma>`, `affiliates_enabled`, `dubbing_enabled`, `new_player_hls`.

Após o rollback: confirmar `/readyz`, taxa de 5xx normalizada, filas drenando; abrir post‑mortem.
