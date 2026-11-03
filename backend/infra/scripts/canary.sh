#!/usr/bin/env bash
# Canary em produção com dois target groups (blue = versão atual, green = nova). Etapas 10% → 50% → 100%, 10 min de observação em cada.
# Rollback automático se a taxa de 5xx do ALB passar de 2% na janela. Variáveis: CANARY_STEP_SECONDS (padrão 600) para testes.
set -euo pipefail
CLUSTER=$1; IMAGE=$2; STEP=${CANARY_STEP_SECONDS:-600}
LB_ARN=$(aws elbv2 describe-load-balancers --names "$CLUSTER" --query 'LoadBalancers[0].LoadBalancerArn' --output text)
LISTENER=$(aws elbv2 describe-listeners --load-balancer-arn "$LB_ARN" --query "Listeners[?Port==\`443\`].ListenerArn" --output text)
BLUE=$(aws elbv2 describe-target-groups --names "$CLUSTER-blue" --query 'TargetGroups[0].TargetGroupArn' --output text)
GREEN=$(aws elbv2 describe-target-groups --names "$CLUSTER-green" --query 'TargetGroups[0].TargetGroupArn' --output text)
LB_DIM=$(echo "$LB_ARN" | sed 's#.*:loadbalancer/##')

weights() { aws elbv2 modify-listener --listener-arn "$LISTENER" --default-actions "[{\"Type\":\"forward\",\"ForwardConfig\":{\"TargetGroups\":[{\"TargetGroupArn\":\"$BLUE\",\"Weight\":$1},{\"TargetGroupArn\":\"$GREEN\",\"Weight\":$2}]}}]" >/dev/null; }
error_rate() { # % de 5xx dos alvos nos últimos 10 min
  local end start; end=$(date -u +%FT%TZ); start=$(date -u -d '-10 minutes' +%FT%TZ)
  local e t; e=$(aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB --metric-name HTTPCode_Target_5XX_Count --dimensions Name=LoadBalancer,Value="$LB_DIM" --start-time "$start" --end-time "$end" --period 600 --statistics Sum --query 'Datapoints[0].Sum' --output text); t=$(aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB --metric-name RequestCount --dimensions Name=LoadBalancer,Value="$LB_DIM" --start-time "$start" --end-time "$end" --period 600 --statistics Sum --query 'Datapoints[0].Sum' --output text)
  [ "$e" = "None" ] && e=0; [ "$t" = "None" ] && t=0; awk -v e="$e" -v t="$t" 'BEGIN{ if (t < 50) print 0; else printf "%.2f", e*100/t }'
}
rollback() { echo "ROLLBACK: $1"; weights 100 0; ./infra/scripts/deploy-previous.sh "$CLUSTER" 2>/dev/null || true; exit 1; }

# 1) a nova versão sobe SOMENTE no target group green (serviço api registrado no green durante o canary)
aws ecs update-service --cluster "$CLUSTER" --service api --load-balancers "targetGroupArn=$GREEN,containerName=api,containerPort=8787" >/dev/null || true
./infra/scripts/deploy-services.sh "$CLUSTER" "$IMAGE"
for PCT in 10 50 100; do
  weights $((100 - PCT)) "$PCT"; echo "canary em ${PCT}% — observando ${STEP}s"; sleep "$STEP"
  RATE=$(error_rate); echo "5xx = ${RATE}%"
  awk -v r="$RATE" 'BEGIN{exit !(r > 2.0)}' && rollback "5xx ${RATE}% > 2% (etapa ${PCT}%)"
  curl -fsS "https://api.nexusreel.app/readyz" >/dev/null || rollback "readyz falhou (etapa ${PCT}%)"
done
echo "canary concluído: 100% na nova versão"
