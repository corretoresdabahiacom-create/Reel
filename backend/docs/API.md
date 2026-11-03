# API — guia

Especificação completa: [`openapi.yaml`](./openapi.yaml) (OpenAPI 3.1, gerada de `scripts/openapi-meta.ts` + rotas reais; `npm run openapi:check` falha se divergirem). Base: `/api/v1`.

## Convenções
- **Auth:** `Authorization: Bearer <jwt>` (15 min). `POST /auth/refresh` com o refresh opaco (30 dias, **rotativo**; reuso revoga toda a família). B2B: `Bearer nxr_…` com escopos `catalogs:read|generate|publish`.
- **Erros:** `{ "code": "…", "message": "…", "details"?: …, "traceId": "…" }`. Códigos úteis: `insufficient_credits` (402), `plan_limit_reached` (403), `account_pending_deletion` (423), `generation_disabled`/`platform_disabled`/`affiliates_disabled` (503), `account_not_connected` (409), `ai_budget_exceeded` (402), `rate_limited` (429, header `Retry-After`).
- **Idempotência:** header `Idempotency-Key` (8–128 chars). *Obrigatório* em `/templates/:id/purchase`, `/payouts`, `/billing/checkout/*`, `/billing/pix`; *opcional* nas demais escritas. Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com corpo diferente → 422; requisição idêntica em andamento → 409.
- **Paginação:** `?limit=&cursor=` (cursor opaco) → `{ items, nextCursor }`.
- **Trace:** envie/receba `x-trace-id`; o mesmo id aparece nos logs, no envelope de erro e nos jobs.
- **Rate limit:** por IP (auth 10/min, global 600/min) e por usuário (escritas 120/min, geração 30/min, publicação 20/min). Headers `x-ratelimit-*`.

## Fluxo mínimo (curl)
```bash
API=http://localhost:8787/api/v1
T=$(curl -s $API/auth/register -H 'content-type: application/json' -d '{"email":"a@b.co","password":"Sup3rSecret!pass","name":"Ana","birthDate":"1995-01-01"}' | jq -r .accessToken)
REF=$(curl -s -X PUT $API/uploads/photo -H "authorization: Bearer $T" -H 'content-type: image/png' --data-binary @foto.png | jq -r .ref)
P=$(curl -s $API/projects -H "authorization: Bearer $T" -H 'content-type: application/json' -d "{\"title\":\"Tênis\",\"script\":\"Leve. Confortável. Frete grátis.\",\"photos\":[\"$REF\"]}" | jq -r .id)
curl -s -X POST $API/projects/$P/storyboard -H "authorization: Bearer $T" -H 'content-type: application/json' -d '{"pipeline":true}'
curl -s $API/projects/$P -H "authorization: Bearer $T" | jq '{status, finalVideoUrl}'
```

## Webhooks recebidos
| Rota | Assinatura | Idempotência |
|---|---|---|
| `POST /webhooks/stripe` | `Stripe-Signature` (HMAC‑SHA256 de `t.corpo`, tolerância 5 min) | `webhook_events(provider,event_id)` + `transactions(source,external_ref)` |
| `POST /webhooks/pix` | `x-signature` = HMAC‑SHA256(corpo, `PIX_WEBHOOK_SECRET`) | idem |
| `POST /webhooks/affiliates/conversion` | `x-nexus-signature` = HMAC‑SHA256(corpo, `AFFILIATE_WEBHOOK_SECRET`) | `UNIQUE(link_id, order_id)` |
| `POST /integrations/:platform/webhook` | específica da plataforma (corpo cru) | `webhook_events` |

## Sessão no navegador: cookie httpOnly (P0-1 etapa 3)
RFC: `docs/RFC/2026-10-session-cookie.md`. Com o cabeçalho `X-Session-Mode: cookie` em `register`, `login`, `refresh`, `oauth`, `magic-link/verify` e `totp/verify`:
- o refresh vai para o cookie `nx_rt` (`HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`) e **sai do corpo**; o corpo traz `accessToken` e `csrfToken`;
- `POST /auth/refresh` e `POST /auth/logout` **sem corpo** usam o cookie e exigem `X-CSRF-Token` igual ao cookie `nx_csrf` (senão 403 `csrf_failed`); o refresh gira os dois cookies; o logout os apaga;
- CORS com `credentials: true` só quando `CORS_ORIGINS` é uma lista explícita. Produção recusa `SESSION_COOKIE_SECURE=false`.
Sem o cabeçalho, nada muda (app nativo, B2B). Teste: `tests/37-session-cookie.test.ts`. Cliente do front: `src/api/http.ts` (repositório do front).

## Contrato garantido (P0-1 etapas 1b e 2)
**Fontes da resposta, em ordem de confiança** (`x-schema-source` em cada schema):
1. `$ref` escrito à mão em `scripts/openapi-meta.ts`;
2. `typescript` — tipo que o handler devolve, extraído pelo compilador (`scripts/gen-response-types.ts` → `docs/openapi-static.json`). Campo declarado aparece no contrato **mesmo que nenhum teste o tenha visto preenchido**; anulável/opcional vem do tipo;
3. `typescript+observed` — trechos que o código não tipa (`any`, jsonb) completados com o formato visto na suíte;
4. `observed` — só o formato visto na suíte (handlers ainda sem tipo).

**Entrada:** schema zod que a rota usa para validar (`x-schema-source: zod`, exato).

**Garantia em execução:** com `CONTRACT_ENFORCE=1` (ligado em toda a suíte, nunca em produção) cada resposta JSON 2xx é validada contra `docs/openapi.yaml` (`src/observability/contractEnforcer.ts`). Divergência — tipo errado, `null` onde o contrato diz string, campo a mais em tipo fechado, status não documentado — reprova o arquivo de teste. A 1ª execução achou 20 rotas divergentes (tipos que mentiam; lista na entrega da auditoria, `audit/evidence/p0-1/contract-violations-1.jsonl`); todas foram corrigidas no código.

**Linhas do banco tipadas:** `src/db/rows.generated.ts` é gerado do schema real (`npx tsx scripts/gen-db-types.ts`); consultas de uma tabela usam `pool.query<Row<'tabela'>>`.
**Consultas tipadas pelo próprio Postgres (etapa 2b):** `scripts/type-queries.ts` descreve cada `SELECT` sem interpolação (resultado vazio numa transação desfeita) e cada `RETURNING` de colunas simples, e grava o tipo na chamada (`pool.query<{ … }>`). Coluna de tabela herda o NOT NULL (exceto via LEFT JOIN); calculada é anulável salvo `count`/`exists`/`coalesce`. Os serviços analíticos (agregados em janelas) ficam fora do automático e continuam a ser preenchidos pelo formato observado.

**camelCase em toda a API:** rotas que devolviam linhas cruas (timeline, ops/admin, status, KYC, afiliados, live) passam por `camel()` (`src/utils/case.ts`) na fronteira HTTP/WebSocket; conteúdo jsonb (props, metrics…) não é tocado. Exceção documentada: catálogos `messages` (código de erro → texto) e `suppressed` (motivo → contagem), cujas chaves são dados. **Mudança de contrato (antes de existir cliente):** `duration_ms → durationMs`, `start_ms → startMs`, `created_at → createdAt` etc. nessas rotas; o `restore` do fork aceita as duas formas.

**Atualizar tudo:** `npm run openapi` (rápido, sem banco) ou `npm run openapi:record` (suíte completa + formato observado + data room).
**Catraca e frescor** (`tests/36`): cobertura de schemas não cai (`docs/openapi-coverage.json`); `openapi.yaml`, `openapi-static.json` e `rows.generated.ts` têm de estar em dia; nenhum campo snake_case.
**Front:** `npm run api:sync && npm run api:types` gera `src/api/schema.d.ts`.

## Trocar o front para a API real
**Ainda não está pronto** (auditoria X7, P0-1). Hoje só `src/services/integrations` do front lê `USE_REAL_APIS`/`API_URL`; o protótipo usa estado local. A integração entra por etapas atrás de `ff_live_backend` (ver `audit/REMEDIATION_PROMPT.md`). Diferenças conhecidas entre front e back: `audit/evidence/reaudit/model-diff.json`.

### Excluir projeto (`DELETE /projects/:id`) — P0-1 etapa 4
- 204 para o dono; 404 para qualquer outra pessoa (inclusive colaborador). O projeto some da lista e do detalhe na hora.
- Os arquivos saem do storage em segundo plano (job `project-purge`): tudo em `projects/<id>/` (vídeo final, cenas, quadros, dublagens, áudio, legendas), os assets derivados do projeto, as fotos que nenhum outro projeto vivo do mesmo usuário usa e as entradas do cache de cenas apontando para ele. Auditado como `project.files_purged`.
- Não há desfazer. URLs assinadas já emitidas param de funcionar quando o arquivo é apagado (no máximo `SIGNED_URL_TTL_SEC`).

### URLs de mídia
- Toda resposta de projeto traz `finalVideoUrl`, `thumbnailUrl` e (no detalhe) `photoUrls` **assinadas**; nunca a referência interna.
- Formatos por ambiente: storage local (`?exp=&sig=`), S3 (`X-Amz-Date`/`X-Amz-Expires`/`X-Amz-Signature`) ou CDN CloudFront (`Expires`/`Key-Pair-Id`/`Signature`, quando `CDN_BASE_URL` + par de chaves estão configurados). O front reconhece os três para renovar uma URL vencida.
