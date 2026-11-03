/**
 * P0-1 etapa 3 — cliente HTTP ÚNICO do front para o backend (contrato em `./schema.d.ts`, gerado do OpenAPI).
 *
 * - Access token (15 min) só em MEMÓRIA, enviado como `Authorization: Bearer`.
 * - Sessão do navegador em cookie httpOnly (RFC backend `docs/RFC/2026-10-session-cookie.md`): `X-Session-Mode: cookie`
 *   e `credentials: 'include'`; o refresh nunca passa pelo JS. Só o `csrfToken` (inútil sem o cookie) fica guardado,
 *   para sobreviver ao F5. No app nativo (Capacitor) use `mode: 'body'` com um `tokenStore` seguro.
 * - 401 → um único refresh compartilhado por todas as requisições em voo → repete uma vez.
 * - `Idempotency-Key` automática em POST/PUT/PATCH/DELETE, REUTILIZADA nas novas tentativas (o servidor responde igual).
 * - Nova tentativa com espera exponencial só em falha de rede, 502, 503 e 504; nunca em 4xx nem 500.
 * - Erros sempre como `ApiError { status, code, message (no idioma do usuário), details, traceId }`.
 */
import type { paths } from './schema';

export type Locale = 'pt-BR' | 'en' | 'es';
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Op<P extends keyof paths, M extends Method> = paths[P] extends Record<M, infer O> ? O : never;
type JsonOf<T> = T extends { content: { 'application/json': infer B } } ? B : never;
export type ResponseOf<P extends keyof paths, M extends Method> = Op<P, M> extends { responses: infer R } ? { [K in keyof R]: K extends 200 | 201 | 202 | 203 ? JsonOf<R[K]> : never }[keyof R] : never;
export type BodyOf<P extends keyof paths, M extends Method> = Op<P, M> extends { requestBody?: infer B } ? JsonOf<NonNullable<B>> : never;
type PathParams<P extends keyof paths, M extends Method> = Op<P, M> extends { parameters: { path?: infer X } } ? X : never;
type QueryOf<P extends keyof paths, M extends Method> = Op<P, M> extends { parameters: { query?: infer X } } ? X : never;
/** Rotas que aceitam o método M (para autocompletar só o que existe). */
export type PathsWith<M extends Method> = { [P in keyof paths]: paths[P] extends Record<M, { responses: unknown }> ? P : never }[keyof paths];

export interface RequestOptions<P extends keyof paths, M extends Method> {
  params?: PathParams<P, M> extends never ? never : PathParams<P, M>;
  query?: QueryOf<P, M> extends never ? Record<string, string | number | boolean | undefined> : QueryOf<P, M>;
  body?: BodyOf<P, M> extends never ? unknown : BodyOf<P, M>;
  idempotencyKey?: string; signal?: AbortSignal; timeoutMs?: number; auth?: boolean;
}

const MESSAGES: Record<string, Record<Locale, string>> = {
  network_error: { 'pt-BR': 'Sem conexão. Verifique sua internet e tente de novo.', en: 'No connection. Check your internet and try again.', es: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.' },
  timeout: { 'pt-BR': 'O servidor demorou para responder. Tente de novo.', en: 'The server took too long to respond. Try again.', es: 'El servidor tardó en responder. Inténtalo de nuevo.' },
  unauthorized: { 'pt-BR': 'Sua sessão expirou. Entre de novo.', en: 'Your session expired. Please sign in again.', es: 'Tu sesión expiró. Inicia sesión de nuevo.' },
  forbidden: { 'pt-BR': 'Você não tem permissão para isso.', en: "You don't have permission to do that.", es: 'No tienes permiso para hacer eso.' },
  csrf_failed: { 'pt-BR': 'Sua sessão precisa ser renovada. Entre de novo.', en: 'Your session needs to be renewed. Please sign in again.', es: 'Tu sesión necesita renovarse. Inicia sesión de nuevo.' },
  not_found: { 'pt-BR': 'Não encontramos o que você procurou.', en: "We couldn't find that.", es: 'No encontramos lo que buscabas.' },
  rate_limited: { 'pt-BR': 'Muitas tentativas. Aguarde um pouco.', en: 'Too many attempts. Please wait a moment.', es: 'Demasiados intentos. Espera un momento.' },
  service_unavailable: { 'pt-BR': 'Serviço indisponível no momento. Tente em instantes.', en: 'Service unavailable right now. Try again shortly.', es: 'Servicio no disponible por ahora. Inténtalo en un momento.' },
  server_error: { 'pt-BR': 'Algo deu errado do nosso lado. Tente de novo.', en: 'Something went wrong on our side. Try again.', es: 'Algo salió mal de nuestro lado. Inténtalo de nuevo.' },
};

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown, readonly traceId?: string, readonly retryAfterSec?: number) { super(message); this.name = 'ApiError'; }
}

/** Onde guardar o que precisa sobreviver ao F5. Navegador: só o csrfToken. Nativo (`mode: 'body'`): o refresh, em armazenamento seguro. */
export interface TokenStore { get(key: 'csrf' | 'refresh'): string | null; set(key: 'csrf' | 'refresh', v: string | null): void }
export const memoryStore = (): TokenStore => { const m = new Map<string, string>(); return { get: (k) => m.get(k) ?? null, set: (k, v) => { if (v === null) m.delete(k); else m.set(k, v); } }; };
/** csrfToken no localStorage (protege contra CSRF, não contra XSS — e o refresh continua inacessível ao JS). */
export const browserStore = (prefix = 'nx.'): TokenStore => {
  const mem = memoryStore();
  return {
    get: (k) => { if (k !== 'csrf') return mem.get(k); try { return globalThis.localStorage?.getItem(prefix + k) ?? mem.get(k); } catch { return mem.get(k); } },
    set: (k, v) => { mem.set(k, v); if (k !== 'csrf') return; try { if (v === null) globalThis.localStorage?.removeItem(prefix + k); else globalThis.localStorage?.setItem(prefix + k, v); } catch { /* sem storage: fica só em memória */ } },
  };
};

export interface HttpConfig {
  baseUrl: string; mode?: 'cookie' | 'body'; locale?: () => Locale; tokenStore?: TokenStore;
  fetch?: typeof fetch; sleep?: (ms: number) => Promise<void>; random?: () => number; uuid?: () => string;
  timeoutMs?: number; maxRetries?: number; onUnauthenticated?: () => void;
}
type AuthTokens = { accessToken?: string; refreshToken?: string; csrfToken?: string; expiresIn?: number };

export function createHttp(cfg: HttpConfig) {
  const mode = cfg.mode ?? 'cookie'; const store = cfg.tokenStore ?? (mode === 'cookie' ? browserStore() : memoryStore());
  const doFetch = cfg.fetch ?? globalThis.fetch.bind(globalThis); const sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const rnd = cfg.random ?? Math.random; const uuid = cfg.uuid ?? (() => globalThis.crypto.randomUUID());
  const loc = () => cfg.locale?.() ?? 'pt-BR'; const maxRetries = cfg.maxRetries ?? 2;
  let access: string | null = null; let refreshing: Promise<boolean> | null = null;
  const base = cfg.baseUrl.replace(/\/+$/, '');

  const msg = (code: string, fallback?: string) => MESSAGES[code]?.[loc()] ?? fallback ?? MESSAGES.server_error![loc()];
  const sessionHeaders = (): Record<string, string> => (mode === 'cookie' ? { 'x-session-mode': 'cookie' } : {});
  function keep(t: AuthTokens) {
    if (t.accessToken) access = t.accessToken;
    if (mode === 'cookie') { if (t.csrfToken) store.set('csrf', t.csrfToken); } else if (t.refreshToken) store.set('refresh', t.refreshToken);
  }
  function forget() { access = null; store.set('csrf', null); store.set('refresh', null); }

  function url(path: string, params?: Record<string, unknown>, query?: Record<string, unknown>) {
    const p = path.replace(/\{(\w+)\}/g, (_, k: string) => { const v = params?.[k]; if (v === undefined || v === null || v === '') throw new ApiError(0, 'bad_request', `parâmetro ausente: ${k}`); return encodeURIComponent(String(v)); });
    const qs = new URLSearchParams(); for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) qs.append(k, String(v));
    const s = qs.toString(); return `${base}/api/v1${p}${s ? `?${s}` : ''}`;
  }

  async function raw(method: string, href: string, init: { headers: Record<string, string>; body?: BodyInit; signal?: AbortSignal; timeoutMs?: number }): Promise<Response> {
    const ctl = new AbortController(); const ms = init.timeoutMs ?? cfg.timeoutMs ?? 15_000;
    const timer = setTimeout(() => ctl.abort(new DOMException('timeout', 'TimeoutError')), ms);
    const onAbort = () => ctl.abort(init.signal?.reason); init.signal?.addEventListener('abort', onAbort, { once: true });
    try { return await doFetch(href, { method: method.toUpperCase(), headers: init.headers, body: init.body, signal: ctl.signal, credentials: mode === 'cookie' ? 'include' : 'omit' }); }
    catch (e) {
      if (init.signal?.aborted) throw e; // cancelado por quem chamou: propaga como está
      if (ctl.signal.aborted) throw new ApiError(0, 'timeout', msg('timeout'));
      throw new ApiError(0, 'network_error', msg('network_error'));
    } finally { clearTimeout(timer); init.signal?.removeEventListener('abort', onAbort); }
  }

  /** `credentialCall`: login/cadastro — um 401 ali é "senha errada", não "sessão expirou": vale a mensagem do servidor. */
  async function toError(r: Response, credentialCall = false): Promise<ApiError> {
    let b: { code?: string; message?: string; details?: unknown; traceId?: string } = {};
    try { b = await r.json(); } catch { /* corpo não-JSON */ }
    const code = b.code ?? (r.status === 401 ? 'unauthorized' : r.status === 403 ? 'forbidden' : r.status === 404 ? 'not_found' : r.status === 429 ? 'rate_limited' : r.status >= 500 ? 'server_error' : 'bad_request');
    const ra = Number(r.headers.get('retry-after')); const generic = new Set([...(credentialCall ? [] : ['unauthorized', 'forbidden']), 'csrf_failed', 'not_found', 'rate_limited', 'service_unavailable', 'server_error']);
    // mensagem do servidor (já localizada por Accept-Language) para códigos de negócio; texto do cliente para os genéricos
    return new ApiError(r.status, code, generic.has(code) ? msg(code, b.message) : b.message ?? msg(code), b.details, b.traceId ?? r.headers.get('x-trace-id') ?? undefined, Number.isFinite(ra) && ra > 0 ? ra : undefined);
  }

  /** Um único refresh para todas as requisições que receberam 401 ao mesmo tempo. */
  function refresh(): Promise<boolean> {
    if (refreshing) return refreshing;
    const p = (async () => {
      try {
        const headers: Record<string, string> = { 'content-type': 'application/json', 'accept-language': loc(), ...sessionHeaders() };
        let body: string | undefined;
        if (mode === 'cookie') { const c = store.get('csrf'); if (!c) return false; headers['x-csrf-token'] = c; }
        else { const rt = store.get('refresh'); if (!rt) return false; body = JSON.stringify({ refreshToken: rt }); }
        const r = await raw('post', `${base}/api/v1/auth/refresh`, { headers, body: body ?? '{}' });
        if (!r.ok) { forget(); return false; }
        keep(await r.json() as AuthTokens); return true;
      } catch { return false; }
    })();
    // limpa só depois de atribuir (o corpo pode terminar de forma síncrona, ex.: sem csrf guardado)
    refreshing = p; void p.finally(() => { if (refreshing === p) refreshing = null; });
    return p;
  }

  async function send<T>(method: Method, path: string, o: { params?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown; raw?: Blob | ArrayBuffer | Uint8Array; contentType?: string; idempotencyKey?: string; signal?: AbortSignal; timeoutMs?: number; auth?: boolean } = {}): Promise<T> {
    const write = method !== 'get'; const key = write ? o.idempotencyKey ?? uuid() : undefined; const href = url(path, o.params, o.query);
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      const headers: Record<string, string> = { accept: 'application/json', 'accept-language': loc(), ...sessionHeaders() };
      if (o.raw !== undefined) headers['content-type'] = o.contentType ?? 'application/octet-stream'; else if (o.body !== undefined) headers['content-type'] = 'application/json';
      if (key) headers['idempotency-key'] = key;
      if (o.auth !== false && access) headers.authorization = `Bearer ${access}`;
      let r: Response;
      try { r = await raw(method, href, { headers, body: o.raw !== undefined ? (o.raw as BodyInit) : o.body === undefined ? undefined : JSON.stringify(o.body), signal: o.signal, timeoutMs: o.timeoutMs }); }
      catch (e) { if (e instanceof ApiError && e.code === 'network_error' && attempt < maxRetries) { await sleep(backoff(attempt)); continue; } throw e; }
      if (r.status === 401 && o.auth !== false && !refreshed) { refreshed = true; if (await refresh()) { attempt--; continue; } cfg.onUnauthenticated?.(); throw await toError(r); }
      if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < maxRetries) { await sleep(backoff(attempt, Number(r.headers.get('retry-after')))); continue; }
      if (!r.ok) throw await toError(r, o.auth === false);
      if (r.status === 204) return undefined as T;
      const ct = r.headers.get('content-type') ?? ''; return (ct.includes('json') ? await r.json() : await r.text()) as T;
    }
  }
  /** 300 ms, 600 ms… com ±25% de variação; respeita Retry-After (s) até 10 s. */
  const backoff = (attempt: number, retryAfterSec?: number) => (Number.isFinite(retryAfterSec) && retryAfterSec! > 0 ? Math.min(retryAfterSec!, 10) * 1000 : 300 * 2 ** attempt * (0.75 + rnd() * 0.5));

  return {
    /** Chamada tipada pelo contrato: rota, parâmetros, corpo e resposta vêm de `schema.d.ts`. */
    request<M extends Method, P extends PathsWith<M>>(method: M, path: P, o: RequestOptions<P, M> = {}): Promise<ResponseOf<P, M>> {
      return send<ResponseOf<P, M>>(method, path as string, o as Record<string, never>);
    },
    async login(email: string, password: string, totp?: string) { const t = await send<AuthTokens & Record<string, unknown>>('post', '/auth/login', { body: { email, password, ...(totp ? { totp } : {}) }, auth: false }); keep(t); return t; },
    /** Login com Firebase: troca o ID token (e-mail verificado) pela sessão do app (cookie httpOnly no navegador). */
    async firebaseLogin(idToken: string, locale?: string) { const t = await send<AuthTokens & Record<string, unknown>>('post', '/auth/firebase', { body: { idToken, ...(locale ? { locale } : {}) }, auth: false }); keep(t); return t; },
    async register(body: Record<string, unknown>) { const t = await send<AuthTokens & Record<string, unknown>>('post', '/auth/register', { body, auth: false }); keep(t); return t; },
    /** Restaura a sessão ao abrir o app (F5): tenta um refresh com o que estiver guardado. */
    restore: () => refresh(),
    async logout() {
      try {
        if (mode === 'cookie') { const c = store.get('csrf'); if (c) await raw('post', `${base}/api/v1/auth/logout`, { headers: { 'content-type': 'application/json', 'x-csrf-token': c, ...sessionHeaders() }, body: '{}' }); }
        else { const rt = store.get('refresh'); if (rt) await raw('post', `${base}/api/v1/auth/logout`, { headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: rt }) }); }
      } finally { forget(); }
    },
    /** Envio binário (ex.: `PUT /uploads/photo` com a foto): mesma auth, refresh e idempotência das demais chamadas. */
    upload<T = unknown>(method: 'put' | 'post', path: string, data: Blob | ArrayBuffer | Uint8Array, contentType: string, o: { params?: Record<string, unknown>; query?: Record<string, unknown>; idempotencyKey?: string; timeoutMs?: number } = {}): Promise<T> { return send<T>(method, path, { ...o, raw: data, contentType, timeoutMs: o.timeoutMs ?? 60_000 }); },
    isAuthenticated: () => access !== null,
  };
}
export type Http = ReturnType<typeof createHttp>;
