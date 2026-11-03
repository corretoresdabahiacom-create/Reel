#!/usr/bin/env bash
# Release gate: consulta o orçamento de erro antes de um deploy. Exit 0 = liberado; 1 = bloqueado (freeze); 2 = erro de consulta.
# Uso: API_URL=https://api.nexusreel.com ADMIN_TOKEN=... infra/scripts/release-gate.sh [feature|fix]
# Correções de confiabilidade (type=fix) passam mesmo com freeze; features não. Orçamento esgotado exige override do SRE (POST /admin/ops/release-gate/unfreeze).
set -euo pipefail
TYPE="${1:-feature}"; : "${API_URL:?defina API_URL}"; : "${ADMIN_TOKEN:?defina ADMIN_TOKEN}"
RES=$(curl -fsS --max-time 15 -H "Authorization: Bearer ${ADMIN_TOKEN}" "${API_URL}/api/v1/admin/ops/release-gate?type=${TYPE}") || { echo "release-gate: falha ao consultar (${API_URL})" >&2; exit 2; }
echo "$RES"
ALLOWED=$(printf '%s' "$RES" | python3 -c 'import json,sys; print(str(json.load(sys.stdin).get("allowed")).lower())') || exit 2
[ "$ALLOWED" = "true" ] && exit 0 || { echo "release-gate: BLOQUEADO — orçamento de erro baixo (tipo=${TYPE})" >&2; exit 1; }
