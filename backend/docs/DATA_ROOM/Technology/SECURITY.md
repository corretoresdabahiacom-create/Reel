# Segurança

## Autenticação e sessão
- **Senhas:** Argon2id (m=64 MiB, t=3, p=1); mínimo 10 caracteres; resposta de login idêntica para e-mail inexistente/senha errada; **lockout** de 15 min após 5 falhas por e-mail; rate limit de 10 req/min por IP nas rotas de auth.
- **JWT** HS256 (`JWT_SECRET` ≥ 32 chars, `iss` validado) com 15 min; **refresh opaco** de 30 dias, armazenado como SHA‑256, **rotativo** com `family_id`: reuso de um token já rotacionado revoga toda a família. `logout` revoga um; `logout-all` revoga todos. Banimento/exclusão invalidam o acesso em ≤ 30 s (cache `ustate:<id>`; invalidado explicitamente nas ações de admin).
- **Admin:** exige TOTP RFC 6238 (`ADMIN_REQUIRE_TOTP=true` em staging/produção); o refresh **não** preserva a prova de 2º fator (admin refaz o TOTP). Bull Board e `/__debug` exigem admin+TOTP.
- **API keys B2B** (`nxr_…`): só o hash SHA‑256 é guardado; escopos por rota; não acessam rotas de usuário; revogáveis.
- **OAuth social/plataformas:** `state` + PKCE no Redis (TTL curto, uso único); o `client_secret` só existe no servidor.

## Dados
- **Tokens de plataformas e contas de afiliado:** AES‑256‑GCM, formato `v1:<keyId>:<iv>:<tag>:<ct>` (IV aleatório por valor, autenticação do texto cifrado). Chave `DATA_ENCRYPTION_KEY` (32 bytes base64) vem do Secrets Manager. **Rotação:** gere nova chave com novo `keyId`, mantenha a antiga como leitura, rode o job de re‑encriptação e então aposente a antiga (procedimento em `RUNBOOKS/token-leak.md`).
- **Em repouso:** RDS, ElastiCache, S3 e Secrets Manager com KMS (rotação anual automática). **Em trânsito:** TLS 1.3 no ALB, `rds.force_ssl`, Redis com TLS.
- **IPs** de cliques/consentimentos só como HMAC (`IP_HASH_SALT`), nunca em claro.
- **RLS** no Postgres em **todas** as tabelas, valendo para todas as consultas da aplicação (papel `nexus_app`, fail-closed; requisição sem login é anônima por padrão). Inventário de escalonamentos e rotas públicas: [`SECURITY_RLS.md`](SECURITY_RLS.md) (gerado). Testes: `tests/20-idor-exposure.test.ts` e `tests/21-rls-hardening.test.ts`.

## Entrada e superfície HTTP
- zod valida todo corpo/query/params; campos extras são rejeitados (`.strict()` — mitiga *mass assignment*); IDs são UUID validados; cursores opacos validados.
- **Uploads:** só JPEG/PNG/WebP por *magic bytes* (o `Content-Type` do cliente é ignorado), ≤ 10 MB, varredura de antivírus (hoje um *stub* que detecta EICAR — **troque por ClamAV** em produção, ver abaixo), chave de armazenamento derivada do usuário; URLs assinadas por HMAC/S3 com expiração.
- **CSV:** células iniciadas por `= + - @ TAB CR` são neutralizadas (CSV/formula injection); limite de 500 linhas e 2 MB.
- **Helmet** (CSP `default-src 'none'`, `frame-ancestors 'none'`, HSTS em produção, `nosniff`), **CORS** restrito a `CORS_ORIGINS`, `x-powered-by` removido.
- **Webhooks:** assinatura HMAC sobre o **corpo cru** com comparação em tempo constante; Stripe com tolerância de 5 min contra *replay*; deduplicação por `event_id`.
- **SSRF:** a API nunca busca URLs fornecidas pelo usuário (fotos de catálogo só são aceitas como `ref` de upload próprio; URLs HTTP em CSV são ignoradas no lote).
- **Rate limiting** em Redis (janela fixa atômica via Lua) por IP e por usuário; falha aberta se o Redis cair (monitorado).
- **Erros:** 5xx devolvem envelope genérico com `traceId` (stack só nos logs/Sentry).

## Dinheiro
Débitos atômicos (`UPDATE … WHERE saldo >= x`), `UNIQUE(source, external_ref)` em `transactions`, `Idempotency-Key` obrigatório, saques ≥ R$500 com aprovação manual e trilha em `audit_logs`, estorno automático de saldo na rejeição.

## Verificações automatizadas
Testes (`tests/10-security.test.ts`): tokens cifrados no banco e ausentes da API, rate limit 429 + `Retry-After`, RLS (inclusive via SQL direto como `nexus_app`), uploads maliciosos, URLs assinadas adulteradas, JWT forjado/`alg:none`, injeção em busca/cursor, cabeçalhos, webhooks sem assinatura, revogação de sessões. CI: Trivy (imagem, dependências, IaC, segredos) e OWASP ZAP *baseline* contra o stack do compose.

## Pendências de hardening (não feitas aqui)
1. **ClamAV real** (sidecar `clamd` + `INSTREAM`) no lugar do stub em `uploads.routes.ts#scan`.
2. **KMS envelope encryption** para `DATA_ENCRYPTION_KEY` (hoje chave simétrica em Secrets Manager).
3. WAF (AWS WAF managed rules) na frente do ALB e *bot control* em `/r/:linkId`.
4. Pentest externo e revisão de dependências por SCA contínua (Dependabot).
5. Assinatura/verificação real das notificações do Mercado Livre e Shopee (mecanismos marcados `TODO` nos módulos).
