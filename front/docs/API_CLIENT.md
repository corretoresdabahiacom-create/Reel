# Cliente da API (P0-1)

`src/api/http.ts` é o **único** caminho do front para o backend. Os tipos vêm do contrato do backend (`src/api/schema.d.ts`, gerado de `src/api/openapi.snapshot.yaml` por `npm run api:sync && npm run api:types`).

```ts
import { createHttp } from './src/api/http';
const api = createHttp({ baseUrl: 'https://api.nexusreel.com', locale: () => currentLocale, onUnauthenticated: () => goToLogin() });
await api.restore();                       // ao abrir o app (F5): renova a sessão pelo cookie
await api.login(email, password);
const me = await api.request('get', '/users/me');                                   // tipado pelo contrato
await api.request('post', '/projects/{projectId}/comments', { params: { projectId }, body: { timeMs: 1000, body: 'oi' } });
```

| Comportamento | Como |
|---|---|
| Sessão | Navegador: `mode: 'cookie'` (padrão) — refresh em cookie httpOnly; access token só em memória; só o `csrfToken` fica no `localStorage`. App nativo: `mode: 'body'` com `tokenStore` em armazenamento seguro. |
| 401 | um único refresh para todas as requisições em voo; repete cada uma uma vez; se falhar, `onUnauthenticated()` |
| Idempotência | `Idempotency-Key` automática em escritas, a mesma nas novas tentativas (ou passe `idempotencyKey` para amarrar a uma ação do usuário) |
| Novas tentativas | só falha de rede, 502, 503, 504 — espera 300 ms, 600 ms (±25%) ou o `Retry-After`; nunca em 4xx/500 |
| Tempo limite | 15 s (configurável) → `ApiError('timeout')` |
| Erros | `ApiError { status, code, message, details, traceId, retryAfterSec }`; mensagens genéricas em pt-BR/en/es; mensagens de negócio do servidor mantidas |

Testes: `tests/http.test.ts` (unidade, fetch falso) e `tests/live/http-live.test.ts` (contra o backend real: `NEXUS_API_URL=http://localhost:8787 npm run test:live`).
Ainda **não** está ligado às telas do protótipo — isso é a etapa 4 (migração tela a tela atrás de `ff_live_backend`).
