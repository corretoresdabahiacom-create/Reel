#!/usr/bin/env bash
# Volta api/worker/worker-assemble para a revisão anterior do task definition (rollback de código; migrations são expand/contract e retrocompatíveis).
set -euo pipefail
CLUSTER=$1
for SVC in api worker worker-assemble; do
  CUR=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" --query 'services[0].taskDefinition' --output text)
  FAMILY=$(echo "$CUR" | sed 's#.*/##; s#:.*##'); REV=$(echo "$CUR" | sed 's#.*:##')
  aws ecs update-service --cluster "$CLUSTER" --service "$SVC" --task-definition "$FAMILY:$((REV - 1))" >/dev/null
done
echo "rollback solicitado para a revisão anterior"
