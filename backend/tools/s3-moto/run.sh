#!/usr/bin/env bash
# Roda tests/41 (driver S3 contra moto com autenticação IAM). Precisa de python3. Uso: bash tools/s3-moto/run.sh
set -euo pipefail
DIR=$(mktemp -d); PORT=${MOTO_PORT:-4566}
python3 -m venv "$DIR/venv" && "$DIR/venv/bin/pip" install -q "moto[server]==5.2.4" boto3
INITIAL_NO_AUTH_ACTION_COUNT=3 "$DIR/venv/bin/moto_server" -H 127.0.0.1 -p "$PORT" > "$DIR/moto.log" 2>&1 & MOTO=$!
trap 'kill $MOTO 2>/dev/null; rm -rf "$DIR"' EXIT
for i in $(seq 1 30); do curl -s "http://127.0.0.1:$PORT/moto-api/" >/dev/null && break; sleep 0.5; done
"$DIR/venv/bin/python" "$(dirname "$0")/setup.py" "http://127.0.0.1:$PORT" nx > "$DIR/moto.json"
MOTO_S3_CONFIG="$DIR/moto.json" npx vitest run tests/41-storage-moto.test.ts
