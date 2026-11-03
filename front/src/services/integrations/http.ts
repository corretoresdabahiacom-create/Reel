import { PlatformError, type Platform } from './types';

export interface HttpOptions {
  platform: Platform;
  label: string; // nome da etapa nos logs, ex.: "init_upload"
  retries?: number; // padrão 3
  timeoutMs?: number; // padrão 30 s
  baseDelayMs?: number; // padrão 500 ms
  /** Interpreta o corpo do erro e devolve um código mais específico da plataforma. */
  mapError?: (status: number, body: unknown) => { code: string; message: string; retryable?: boolean } | null;
}
export interface HttpResult<T> { status: number; headers: Headers; data: T }

const SENSITIVE = /(authorization|access_token|refresh_token|client_secret|code_verifier|api[-_]?key|sign)/i;
/** Remove tokens e segredos antes de logar. */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SENSITIVE.test(k) ? '[redigido]' : redact(v)]));
  }
  return value;
}
/** Log estruturado por plataforma (uma linha JSON). Troque por pino/winston no backend. */
export function log(level: 'info' | 'warn' | 'error', platform: Platform, event: string, data?: Record<string, unknown>): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, platform, event, ...(data ? (redact(data) as object) : {}) });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.info)(line);
}
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** fetch com timeout, retry exponencial com jitter (429/5xx/rede) e respeito ao Retry-After. */
export async function request<T = unknown>(url: string, init: RequestInit, opt: HttpOptions): Promise<HttpResult<T>> {
  const retries = opt.retries ?? 3;
  let lastError: PlatformError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opt.timeoutMs ?? 30_000);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      const text = await res.text();
      let body: unknown = text;
      try { body = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
      if (res.ok || res.status === 308) {
        log('info', opt.platform, opt.label, { status: res.status, attempt });
        return { status: res.status, headers: res.headers, data: body as T };
      }
      const mapped = opt.mapError?.(res.status, body);
      const retryAfter = Number(res.headers.get('retry-after')) || undefined;
      const retryable = mapped?.retryable ?? (res.status === 429 || res.status >= 500);
      lastError = new PlatformError(opt.platform, mapped?.code ?? `http_${res.status}`, mapped?.message ?? `Falha HTTP ${res.status} em ${opt.label}`, retryable, retryAfter);
      log('warn', opt.platform, opt.label, { status: res.status, attempt, code: lastError.code, retryable });
      if (!retryable) throw lastError;
      await sleep((retryAfter ? retryAfter * 1000 : (opt.baseDelayMs ?? 500) * 2 ** attempt) + Math.random() * 250);
    } catch (e) {
      clearTimeout(timer);
      if (e instanceof PlatformError) { if (!e.retryable || attempt === retries) throw e; lastError = e; continue; }
      lastError = new PlatformError(opt.platform, 'network_error', `Erro de rede em ${opt.label}`, true);
      log('warn', opt.platform, opt.label, { attempt, error: (e as Error).name });
      if (attempt === retries) throw lastError;
      await sleep((opt.baseDelayMs ?? 500) * 2 ** attempt + Math.random() * 250);
    }
  }
  throw lastError ?? new PlatformError(opt.platform, 'unknown', 'Falha desconhecida');
}
export async function http<T = unknown>(url: string, init: RequestInit, opt: HttpOptions): Promise<T> {
  return (await request<T>(url, init, opt)).data;
}
