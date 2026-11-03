# NexusReel — Backend (Fases 6–8)

API REST + workers para o NexusReel: vídeos de até 60 s a partir de texto e fotos, publicação em TikTok, YouTube Shorts, Instagram Reels, Shopee, Temu, OLX e Mercado Livre, marketplace de templates, afiliados, pagamentos e B2B em lote.

```bash
npm i
scripts/infra-local.sh start            # Postgres 16 + Redis 7 locais (ou: docker compose up)
export DATABASE_URL=postgres://postgres@127.0.0.1:55432/nexus_test REDIS_URL=redis://127.0.0.1:56379 \
       JWT_SECRET=$(openssl rand -hex 32) DATA_ENCRYPTION_KEY=$(openssl rand -base64 32) MOCK_OAUTH=true
npm run migrate && EMBED_WORKERS=true npm run dev      # http://localhost:8787  (docs: docs/openapi.yaml)
npm test                                                 # suíte de integração/unitários (Postgres+Redis+FFmpeg reais) — contagem atual: `npx vitest list | wc -l`
npm run test:cov && npm run openapi:check && npm run lint && npm run typecheck
npm run rls:check && npm run taxonomy:check && npm run slo:check && npm run compliance:docs:check   # artefatos gerados em dia
```

Modo padrão = **mocks** (`PLATFORM_MODE=mock`, `PAYMENTS_MODE=mock`, `AI_*_PROVIDER=mock`): todo o fluxo roda sem credenciais. Troque para `real` por variável de ambiente quando tiver as chaves (`.env.example`).

Documentação: [ARCHITECTURE](docs/ARCHITECTURE.md) · [API](docs/API.md) · [DB](docs/DB.md) · [SECURITY](docs/SECURITY.md) · [RLS](docs/SECURITY_RLS.md) · [PRIVACY](docs/PRIVACY.md) · [RETENTION](docs/RETENTION.md) · [DEPLOY](docs/DEPLOY.md) · [ALERTS](docs/ALERTS.md) · [RUNBOOKS](docs/RUNBOOKS/) · [OpenAPI](docs/openapi.yaml)

Estrutura: `src/{config,db,middlewares,modules,integrations,providers,queues,observability,jobs,utils}` · `migrations/` · `tests/` · `scripts/` · `infra/{terraform,observability,scripts}` · `load/` · `.github/workflows/`.

Fases 7–8: [EXPERIMENTS](docs/EXPERIMENTS.md) · [RECOMMENDATIONS](docs/RECOMMENDATIONS.md) · [PRICING](docs/PRICING.md) · [MARKET_EXPANSION](docs/MARKET_EXPANSION.md) · [GTM](docs/GTM.md) · [ANALYTICS_TAXONOMY](docs/ANALYTICS_TAXONOMY.md) · [DATA_SCIENCE](docs/DATA_SCIENCE.md) · [ML](docs/ML.md) · [SRE](docs/SRE/) · [FINOPS](docs/FINOPS.md) · [COMPLIANCE](docs/COMPLIANCE/) · [GOVERNANCE](docs/GOVERNANCE/) · [DATA_ROOM](docs/DATA_ROOM/) · [BCP](docs/BCP/) · [ADR](docs/ADR/) · [checklist da Fase 8](docs/PHASE8_CHECKLIST.md).
