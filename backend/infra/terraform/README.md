# Terraform — NexusReel (AWS)

Módulos: `network` (VPC 3 AZs, NAT), `data` (RDS Postgres 16 Multi-AZ + réplica de leitura, ElastiCache Redis), `storage` (S3 uploads/videos/exports com lifecycle + CloudFront), `secrets` (Secrets Manager + KMS), `app` (ECS Fargate api/worker, ALB, autoscaling, IAM).

```
cd infra/terraform/envs/staging
terraform init -backend-config=backend.hcl   # estado remoto em S3 + lock em DynamoDB (crie antes: ver docs/DEPLOY.md)
terraform plan -var-file=staging.tfvars
terraform apply -var-file=staging.tfvars
```

**Status de verificação:** escrito e revisado, mas `terraform validate/plan` NÃO foi executado neste ambiente (sem binário/credenciais AWS). Rode `terraform fmt -check && terraform validate` no CI (job `infra` em `ci.yml`) antes do primeiro apply.

Multi-região: `var.secondary_region` ativa réplica cross-region do RDS e replicação do bucket de vídeos; o failover de tráfego é Route 53 (health check no `/readyz`) — ver `docs/DEPLOY.md#multi-região`.
