#!/usr/bin/env bash
# Roda `node dist/db/migrate.js up` como tarefa one-off no ECS (mesma imagem, mesma rede/segredos). Falha o deploy se a migration falhar.
set -euo pipefail
CLUSTER=$1; IMAGE=$2
TD=$(aws ecs describe-services --cluster "$CLUSTER" --services api --query 'services[0].taskDefinition' --output text)
NEW_TD=$(aws ecs describe-task-definition --task-definition "$TD" --query 'taskDefinition' | jq --arg img "$IMAGE" '.containerDefinitions[0].image=$img | .containerDefinitions[0].command=["node","dist/db/migrate.js","up"] | .containerDefinitions[0].healthCheck=null | del(.taskDefinitionArn,.revision,.status,.requiresAttributes,.compatibilities,.registeredAt,.registeredBy) | .family=(.family+"-migrate")')
ARN=$(aws ecs register-task-definition --cli-input-json "$NEW_TD" --query 'taskDefinition.taskDefinitionArn' --output text)
NET=$(aws ecs describe-services --cluster "$CLUSTER" --services api --query 'services[0].networkConfiguration' --output json)
TASK=$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$ARN" --network-configuration "$NET" --query 'tasks[0].taskArn' --output text)
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK"
CODE=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" --query 'tasks[0].containers[0].exitCode' --output text)
[ "$CODE" = "0" ] || { echo "migration falhou (exit $CODE)"; exit 1; }
echo "migrations ok"
