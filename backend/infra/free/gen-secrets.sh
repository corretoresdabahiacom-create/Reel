#!/usr/bin/env bash
# Gera os segredos da instalação gratuita (nada sai da sua máquina). Uso: bash infra/free/gen-secrets.sh >> .env.free
set -euo pipefail
r() { openssl rand -base64 "$1" | tr -d '\n'; }
h() { openssl rand -hex "$1"; }
echo "POSTGRES_PASSWORD=$(h 24)"
echo "JWT_SECRET=$(h 32)"
echo "DATA_ENCRYPTION_KEY=$(r 32)"
echo "IP_HASH_SALT=$(h 16)"
echo "ANALYTICS_PSEUDO_SALT=$(h 16)"
echo "AFFILIATE_WEBHOOK_SECRET=$(h 24)"
echo "METRICS_TOKEN=$(h 24)"
