# Deploy

> **Sem custo agora:** instalação gratuita num servidor só (Docker, sem AWS, sem pagamentos) — ver [FREE.md](FREE.md).
> As seções de AWS abaixo valem para a migração futura; os jobs AWS do `cd.yml` só rodam com `AWS_ENABLED=true`.

## Local (Docker)
```bash
docker compose up --build          # postgres 16, redis 7, migrate (one-shot), api :8787, worker (arquivos no volume local)
docker compose --profile observability up   # + Prometheus :9090, Grafana :3000, Jaeger :16686
curl localhost:8787/readyz
```
Sem Docker: `scripts/infra-local.sh start` (Postgres/Redis locais), `npm run migrate && npm run dev` (use `EMBED_WORKERS=true` para API + workers num processo). O front aponta para `http://localhost:8787/api/v1` (`USE_REAL_APIS=true`).

## Variáveis de ambiente
Lista completa e comentada em `.env.example`. Em produção o app **recusa subir** com segredos fracos/padrão (`loadEnv`): `JWT_SECRET` ≥ 32, `DATA_ENCRYPTION_KEY` 32 bytes, `IP_HASH_SALT` ≠ padrão, `AFFILIATE_WEBHOOK_SECRET` ≠ padrão, `MOCK_OAUTH=false`, drivers reais (S3).

## Pipeline (GitHub Actions)
- **`ci.yml`** (PR/main): typecheck, lint, `openapi:check`, Vitest + cobertura (Postgres/Redis de serviço), migrations `up→down×3→up`, build da imagem + Trivy (imagem/dependências/IaC/segredos), stack do compose + smoke + **ZAP baseline**, `tofu fmt/validate`.
- **`cd.yml`** (main): build → ECR; **staging** (migrations como tarefa one‑off no ECS → deploy de api/worker/worker‑assemble → smoke); **produção** (aprovação manual no *Environment*; migrations; **canary 10% → 50% → 100%** com 10 min por etapa; rollback automático se 5xx do ALB > 2% ou `/readyz` falhar). Circuit breaker do ECS reverte deploys cujas tasks não ficam saudáveis.
- **Rollback manual:** ver `RUNBOOKS/rollback.md` (`workflow_dispatch` com `rollback_to=<sha>`).
- Segredos do GitHub: `AWS_DEPLOY_ROLE_ARN` (OIDC, sem chaves estáticas), `AWS_ACCOUNT_ID`.
- **`staging-storage-smoke`** (depois do deploy em staging; produção só sai com ele verde): `tests/staging/aws-storage-smoke.mjs` cria um projeto real (IA simulada em staging) e confere na AWS: CloudFront exige assinatura (sem/adulterada → 403), Range 206, H.264; S3 recusa acesso sem assinatura e SigV4 adulterado; objetos com SSE‑KMS; tag `retention=raw-90d` só nas cenas; ciclo de vida por tag; excluir projeto apaga do bucket. A role `AWS_DEPLOY_ROLE_ARN` precisa de `s3:GetObject`, `s3:GetObjectTagging` e `s3:GetLifecycleConfiguration` nos buckets `nexusreel-staging-*` (e `kms:Decrypt` na chave do ambiente para o `HeadObject`/download). Variável opcional do Environment `staging`: `STAGING_KMS_KEY_ARN`. Ensaio local: `SMOKE_TARGET=local` (ver o cabeçalho do script).
- **Sem acesso ao registry do Terraform** (ambiente isolado): `npm --prefix tools/tf-check ci && npm --prefix tools/tf-check run check` confere formatação (motor do `tofu fmt`) e esquema (gerado dos providers AWS 5.100/TLS/Random). Não substitui o `tofu validate` do CI.

## Infraestrutura (Terraform/OpenTofu)
Ver `infra/terraform/README.md`. Primeiro apply: criar bucket de estado + tabela de lock, `terraform init -backend-config=backend.hcl`, criar o certificado ACM, `plan/apply`, **preencher manualmente** os segredos de terceiros no Secrets Manager (Stripe, Kling, ElevenLabs, OpenAI, TikTok, Meta, Shopee, ML, Google) — o Terraform só gera os segredos internos.

Dimensionamento inicial: api 512 CPU/1 GB (2–10 tasks; alvo CPU 55% e 800 req/alvo), worker 1 vCPU/2 GB (2–12), pool de montagem 2 vCPU/4 GB (1–8; fila `generation-assemble` + `dubbing-video`), RDS `db.r6g.large` Multi‑AZ + réplica de leitura (`DATABASE_READ_URL` usada pelo painel admin), ElastiCache `cache.r6g.large` com failover.

## Multi‑região
1. `secondary_region` no env de produção ⇒ réplica cross‑region do RDS (`aws_db_instance` com `replicate_source_db` em outro provider) e replicação do bucket `videos` (CRR) — *esqueleto previsto, não implementado nos módulos atuais*; adicionar provider alias e recursos conforme a região escolhida.
2. DNS: Route 53 com *failover routing* e health check em `https://api.<domínio>/readyz`.
3. Failover: promover a réplica (`promote-read-replica`), atualizar `DATABASE_URL`, subir api/worker na região secundária (mesma imagem), recriar Redis (estado efêmero). RTO alvo 60 min / RPO 5 min.
4. O redirecionamento de afiliados (`/r/:id`) é o caminho mais sensível a latência: considere CloudFront na frente com `Cache-Control: no-store` + origem multi‑região (a contagem de cliques via Redis deve ser regional e consolidada).

## Migrations em produção
Expand/contract. O job `run-migrations.sh` roda `dist/db/migrate.js up` (advisory lock) antes de qualquer deploy e **bloqueia** o pipeline se falhar. `dry` lista pendentes sem aplicar.

## Teste de carga
`k6 run -e BASE=https://staging… -e LINK_ID=<uuid> load/redirect.js` — meta: **500 req/s no `/r/:id` com p95 < 150 ms**, erro < 1% (relaxe o rate limit por IP no staging ou distribua origens). `load/api-mixed.js`: 100 req/s de leitura, p95 < 300 ms. *Os resultados de k6 ainda não foram medidos* (sem k6/infra neste ambiente).
