# RFC 2026-10 — Sessão do navegador em cookie httpOnly (P0-1 etapa 3)

**Status:** aceito (decisão do produto em 2026-10-26: "cookie httpOnly"). **Módulos:** auth, CORS, front (`src/api/http.ts`).

## Problema
Hoje `login`, `register`, `refresh`, `oauth` e `magic-link/verify` devolvem o **refresh token no corpo** (válido 30 dias).
No navegador ele teria de ficar em JS (memória some no F5; `localStorage` é legível por qualquer XSS). Um refresh roubado
dá 30 dias de sessão.

## Proposta
1. **Modo cookie, por adesão do cliente:** a requisição manda `X-Session-Mode: cookie`. A resposta então:
   - grava `nx_rt` = refresh token — `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=REFRESH_TTL_SEC`;
   - grava `nx_csrf` = token aleatório — `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth`;
   - devolve no corpo `accessToken` (15 min, só em memória no front) e `csrfToken` (mesmo valor do `nx_csrf`), **sem** `refreshToken`.
2. **`POST /auth/refresh` e `POST /auth/logout` sem corpo** usam o cookie `nx_rt` e exigem o cabeçalho
   `X-CSRF-Token` igual ao cookie `nx_csrf` (double-submit; comparação em tempo constante). Sem cabeçalho, ou diferente → 403 `csrf_failed`.
   O refresh gira os dois cookies (rotação e detecção de reuso continuam as de hoje).
3. **Logout** revoga a família e apaga os cookies (`Max-Age=0`).
4. **Sem o cabeçalho de modo**, tudo continua exatamente como hoje (app nativo Capacitor, B2B, testes atuais).
5. **CORS:** `credentials: true` **só** quando `CORS_ORIGINS` é uma lista explícita; cabeçalhos `X-Session-Mode` e `X-CSRF-Token` liberados.
6. `Secure` é obrigatório em produção (`SESSION_COOKIE_SECURE=false` só é aceito fora de produção, para dev em http://localhost).

## Por que é seguro
- O refresh nunca é legível por JS (XSS não leva a sessão de 30 dias; leva no máximo um access de 15 min em memória).
- CSRF: `SameSite=Strict` + `Path` restrito + CORS com lista explícita + cabeçalho personalizado obrigatório + double-submit.
- O `csrfToken` não dá acesso sozinho (precisa do cookie `nx_rt`, que é httpOnly).

## Alternativas descartadas
- **Refresh em `localStorage`:** exposto a XSS. **Só memória:** perde a sessão a cada recarga. **Sessão de servidor (cookie com id opaco e estado no Redis):** maior mudança no backend; o refresh rotativo atual já faz o papel.
- **`@fastify/cookie`:** dependência nova para duas operações simples; leitura e escrita do cabeçalho `Cookie` ficam em `src/utils/cookies.ts` com testes.

## Impacto
SLO/custo: nenhum. Privacidade: menos exposição do token. Contrato: `AuthResponse.refreshToken` passa a ser opcional (já era no schema) e ganha `csrfToken`.

## Rollout e rollback
Ativado pelo cliente (cabeçalho), não por flag de servidor: o front liga o modo cookie atrás de `ff_live_backend`. Rollback = o front para de mandar `X-Session-Mode`; nada no banco muda.
