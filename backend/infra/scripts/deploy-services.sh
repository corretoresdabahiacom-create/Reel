#!/usr/bin/env bash
# Registra nova revisão (imagem) para api, worker e worker-assemble e atualiza os serviços. O circuit breaker do ECS reverte sozinho se as tasks não ficarem saudáveis.
set -euo pipefail
CLUSTER=$1; IMAGE=$2
for SVC in api worker worker-assemble; do
  TD=$(aws ecs describe-services --cluster "$CLUSTER" --services "$SVC" --query 'services[0].taskDefinition' --output text)
  NEW=$(aws ecs describe-task-definition --task-definition "$TD" --query 'taskDefinition' | jq --arg img "$IMAGE" '.containerDefinitions[0].image=$img | del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy)')
  ARN=$(aws ecs register-task-definition --cli-input-json "$NEW" --query 'taskDefinition.taskDefinitionArn' --output text)
  aws ecs update-service --cluster "$CLUSTER" --service "$SVC" --task-definition "$ARN" >/dev/null
done
for SVC in api worker worker-assemble; do aws ecs wait services-stable --cluster "$CLUSTER" --services "$SVC"; done
echo "deploy ok: $IMAGE"
