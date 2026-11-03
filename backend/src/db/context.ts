import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';
import type { FastifyInstance } from 'fastify';

/**
 * Contexto de banco por requisição (auditoria pós-Fase 8 — RLS efetivo).
 *
 * Toda consulta feita por `pool` (src/db/pool.ts) aplica este contexto na conexão antes de executar:
 * `app.user_id`, `app.is_admin`, `app.system`, lidos pelas policies de RLS (migrations 0002 e 0007).
 *
 * - Requisição HTTP sem login: **anônima** (sem usuário e sem bypass) — só enxerga o que as policies tornam público
 *   (templates aprovados, perfis públicos). Rotas públicas que precisam operar entre usuários (login/cadastro,
 *   webhooks assinados, cliques de links, status page) estão em `PUBLIC_ROUTE_DB_SCOPE` com `system` e a justificativa.
 *   Toda rota pública precisa estar classificada nessa tabela (teste 21 confere contra o OpenAPI).
 * - Requisição autenticada: assim que `authenticate()`/`requireAdmin` identificam o usuário, o contexto vira
 *   `{ userId, isAdmin }` e o Postgres passa a filtrar TODAS as consultas daquela requisição pelas policies:
 *   um `WHERE user_id = $1` esquecido não vaza dados de outro usuário.
 * - Workers, jobs, CLIs e testes (fora de requisição): `system`.
 * - Operações legítimas entre usuários dentro de uma requisição (pagar o criador de um template, agregados
 *   anônimos de recomendação etc.) usam `asSystem()` explicitamente — cada uso está listado em docs/SECURITY_RLS.md.
 */
export interface DbCtx { userId?: string; isAdmin?: boolean; system?: boolean }
const als = new AsyncLocalStorage<DbCtx>();
const SYSTEM: DbCtx = Object.freeze({ system: true });

export const currentDbCtx = (): DbCtx => als.getStore() ?? SYSTEM;
export const runWithDbCtx = <T>(ctx: DbCtx, fn: () => T): T => als.run(ctx, fn);
/**
 * Escalonamento explícito para system em consultas avulsas (sem transação). Usar só para pipelines internos que
 * gravam dados já validados (telemetria, contabilidade de custo) ou operações entre usuários justificadas —
 * cada uso está em docs/SECURITY_RLS.md e é conferido por teste.
 */
export const systemScope = <T>(reason: string, fn: () => Promise<T>): Promise<T> => { void reason; return als.run({ system: true }, fn); };

/** Chamado pela autenticação: a partir daqui a requisição consulta o banco como o usuário. */
export function bindDbUser(userId: string, isAdmin: boolean): void {
  const s = als.getStore(); if (!s) return;
  s.userId = userId; s.isAdmin = isAdmin; s.system = false;
}

/**
 * Classificação de TODAS as rotas sem autenticação obrigatória (chave = `MÉTODO url-do-fastify`).
 * `anon`: roda sem bypass (deny-by-default). `system`: escalonamento necessário — a razão fica registrada aqui e em
 * docs/SECURITY_RLS.md (gerado por scripts/gen-rls-doc.ts). Rotas autenticadas começam anônimas e passam a usuário
 * em `authenticate()`/`requireAdmin`.
 */
export const PUBLIC_ROUTE_DB_SCOPE: Record<string, { scope: 'system' | 'anon'; reason: string }> = {
  'POST /api/v1/auth/register': { scope: 'system', reason: 'cria a conta, consentimentos e sessão antes de existir usuário; aplica código de indicação/parceiro' },
  'POST /api/v1/auth/login': { scope: 'system', reason: 'busca a conta pelo e-mail e cria a sessão (resposta não revela se o e-mail existe)' },
  'POST /api/v1/auth/refresh': { scope: 'system', reason: 'valida o refresh token pelo hash e rotaciona a sessão' },
  'POST /api/v1/auth/logout': { scope: 'system', reason: 'revoga o refresh token informado (pelo hash)' },
  'POST /api/v1/auth/oauth/:provider/callback': { scope: 'system', reason: 'vincula ou cria a conta pela identidade externa verificada' },
  'POST /api/v1/auth/magic-link': { scope: 'system', reason: 'gera link de acesso para o e-mail (sem revelar existência)' },
  'POST /api/v1/auth/magic-link/verify': { scope: 'system', reason: 'troca o token de uso único por sessão' },
  'POST /api/v1/auth/firebase': { scope: 'system', reason: 'vincula ou cria a conta pela identidade do Firebase (ID token conferido, e-mail verificado) e cria a sessão' },
  'GET /api/v1/integrations/:platform/callback': { scope: 'system', reason: 'OAuth de plataforma: o usuário é identificado pelo `state` secreto de uso único (Redis, 10 min), não por JWT' },
  'GET /api/v1/collab/ws': { scope: 'system', reason: 'Módulo 8 — WebSocket: login pelo ticket JWT de 60 s/uso único na 1ª mensagem; papel conferido no servidor a cada operação' },
  'GET /api/v1/live/:sessionId/watch': { scope: 'system', reason: 'Módulo 10 — feed público da live: só sessões no ar; devolve título, rótulo "IA", aviso, avatar sintético e produtos daquele catálogo (sem dado do lojista); soma a exibição do rótulo' },
  'POST /api/v1/seal/verify': { scope: 'anon', reason: 'Módulo 10 — verificação pública do selo C2PA lendo o manifest embutido no arquivo enviado; não lê nem grava tabela de usuário' },
  'GET /api/v1/s/:token': { scope: 'system', reason: 'Módulo 7 — link de e-mail: o token HMAC (id + validade) é a credencial; responde só nome do arquivo, remetente e validade daquele envio' },
  'GET /api/v1/s/:token/download': { scope: 'system', reason: 'Módulo 7 — download pelo link HMAC (sem senha): URL assinada de 5 min daquele arquivo; conta o acesso' },
  'POST /api/v1/s/:token/download': { scope: 'system', reason: 'Módulo 7 — download pelo link HMAC com senha (argon2id; 5 tentativas por link a cada 15 min + limite por IP)' },
  'GET /api/v1/cloud/:provider/callback': { scope: 'system', reason: 'Módulo 5 — OAuth de nuvem do usuário: identificado pelo `state` secreto de uso único (Redis, 10 min) + PKCE; grava só a conexão desse usuário' },
  'POST /api/v1/integrations/:platform/webhook': { scope: 'system', reason: 'webhook de plataforma com assinatura verificada' },
  'POST /api/v1/webhooks/stripe': { scope: 'system', reason: 'webhook Stripe com assinatura verificada; credita assinatura/créditos do dono' },
  'POST /api/v1/webhooks/pix': { scope: 'system', reason: 'webhook Pix com HMAC verificado' },
  'POST /api/v1/webhooks/local': { scope: 'system', reason: 'webhook de métodos locais (OXXO etc.) com HMAC verificado' },
  'POST /api/v1/webhooks/affiliates/conversion': { scope: 'system', reason: 'conversão de afiliado com HMAC verificado; credita o dono do link' },
  'GET /r/:linkId': { scope: 'system', reason: 'clique em link de afiliado: registra o clique do link de outra pessoa e redireciona' },
  'GET /api/v1/ref/:code': { scope: 'system', reason: 'clique em link de indicação: resolve o código de outra pessoa (sem revelar existência)' },
  'POST /api/v1/referrals/click': { scope: 'system', reason: 'idem /ref/:code, via app' },
  'POST /api/v1/attribution/touch': { scope: 'system', reason: 'toques de atribuição de visitantes anônimos (anon_id) — só grava/deduplica' },
  'POST /api/v1/waitlist': { scope: 'system', reason: 'tabela interna; resposta não devolve dados de outra inscrição' },
  'GET /api/v1/waitlist/:code': { scope: 'system', reason: 'posição na fila pelo código secreto da própria inscrição' },
  'POST /api/v1/status/subscribe': { scope: 'system', reason: 'inscrição na status page (tabela interna; confirmação por e-mail)' },
  'GET /api/v1/status/confirm/:token': { scope: 'system', reason: 'confirmação da inscrição pelo token secreto' },
  'GET /api/v1/status': { scope: 'system', reason: 'status page lê incidentes (tabela interna) e devolve só campos públicos' },
  'GET /api/v1/status.rss': { scope: 'system', reason: 'idem /status em RSS' },
  'GET /api/v1/notifications/unsubscribe': { scope: 'system', reason: 'descadastro por link com HMAC do usuário (sem login)' },
  'POST /api/v1/notifications/unsubscribe': { scope: 'system', reason: 'descadastro one-click (RFC 8058) com HMAC' },
  'GET /api/v1/templates': { scope: 'anon', reason: 'vitrine: só templates aprovados (policy templates_read); com JWT válido vira usuário' },
  'GET /api/v1/templates/:id': { scope: 'anon', reason: 'detalhe público de template aprovado' },
  'GET /api/v1/public/templates/:id': { scope: 'anon', reason: 'página SEO de template aprovado' },
  'GET /api/v1/public/sitemap.xml': { scope: 'anon', reason: 'sitemap de templates aprovados' },
  'GET /api/v1/billing/catalog': { scope: 'anon', reason: 'catálogo de planos/pacotes (configuração)' },
  'GET /api/v1/flags': { scope: 'anon', reason: 'flags públicas; com JWT válido vira usuário' },
  'GET /api/v1/i18n/profile': { scope: 'anon', reason: 'perfil regional (configuração)' },
  'GET /api/v1/pricing': { scope: 'anon', reason: 'preços regionais; com JWT válido vira usuário' },
  'GET /api/v1/pricing/regions': { scope: 'anon', reason: 'regiões de preço (configuração)' },
  'GET /api/v1/integrations/instagram/webhook': { scope: 'anon', reason: 'handshake de verificação (sem banco)' },
  'POST /api/v1/analytics/events': { scope: 'anon', reason: 'telemetria; a gravação usa systemScope próprio após validar e pseudonimizar' },
  'GET /healthz': { scope: 'anon', reason: 'liveness (sem dados)' },
  'GET /readyz': { scope: 'anon', reason: 'readiness: SELECT 1' },
  'GET /metrics': { scope: 'anon', reason: 'métricas Prometheus (token/CIDR), sem consultas a tabelas de usuário' },
};

const kRes = Symbol('dbCtxResource');
/**
 * Registra o contexto no ciclo de vida do Fastify. O parse do corpo acontece em callbacks de stream, que perdem o
 * AsyncLocalStorage; por isso o recurso assíncrono é guardado no onRequest e reativado no preValidation
 * (mesmo padrão do @fastify/request-context).
 */
export function registerDbContext(app: FastifyInstance): void {
  app.addHook('onRequest', (req, _reply, done) => {
    const cls = PUBLIC_ROUTE_DB_SCOPE[`${req.method} ${req.routeOptions?.url ?? ''}`];
    const start: DbCtx = cls?.scope === 'system' ? { system: true } : {}; // deny-by-default: anônimo até autenticar
    als.run(start, () => { const r = new AsyncResource('nexus-db-ctx'); (req as unknown as Record<symbol, AsyncResource>)[kRes] = r; r.runInAsyncScope(done, req.raw); });
  });
  app.addHook('preValidation', (req, _reply, done) => {
    const r = (req as unknown as Record<symbol, AsyncResource | undefined>)[kRes]; if (r) r.runInAsyncScope(done, req.raw); else done();
  });
}
