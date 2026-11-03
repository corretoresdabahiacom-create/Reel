#!/usr/bin/env bash
# Gera infra/free/front-config/nexus-config.js (servido pelo Caddy em /nexus-config.js): liga o modo real do front e,
# se configurado, o login com Firebase. A apiKey web do Firebase é PÚBLICA por desenho (identifica o projeto; a proteção
# está nas regras e nos domínios autorizados do projeto). Uso: bash infra/free/gen-front-config.sh .env.free
set -euo pipefail
ENV_FILE=${1:-.env.free}; set -a; . "$ENV_FILE"; set +a
OUT_DIR="$(dirname "$0")/front-config"; mkdir -p "$OUT_DIR"
FB="null"
if [ -n "${FIREBASE_PROJECT_ID:-}" ]; then
  : "${FIREBASE_WEB_API_KEY:?defina FIREBASE_WEB_API_KEY (Console do Firebase → Configurações do projeto → Seus apps → Web)}"
  FB=$(printf '{"options":{"apiKey":"%s","authDomain":"%s","projectId":"%s","appId":"%s"},"emailLink":false}' \
    "$FIREBASE_WEB_API_KEY" "${FIREBASE_AUTH_DOMAIN:-$FIREBASE_PROJECT_ID.firebaseapp.com}" "$FIREBASE_PROJECT_ID" "${FIREBASE_WEB_APP_ID:-}")
fi
printf 'window.NEXUS_FLAGS_ON = ["ff_live_backend","ff_voice_studio","ff_sections"];\nwindow.NEXUS_FIREBASE = %s;\n' "$FB" > "$OUT_DIR/nexus-config.js"
echo "gerado $OUT_DIR/nexus-config.js"
