export type Level = 'debug' | 'info' | 'warn' | 'error';
export interface LogEvent { ts: string; level: Level; traceId?: string; userId?: string; action: string; latencyMs?: number; provider?: string; status?: string; [k: string]: unknown }
export interface LogSink { write(e: LogEvent): void }
const SENSITIVE_KEY = /(token|secret|password|senha|authorization|cookie|api[-_]?key|code|sign|cpf|email|phone|telefone)/i;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g; const BEARER = /(bearer\s+)[\w.~+/-]+=*/gi; const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
/** Remove tokens e PII (chaves sensíveis + padrões de e-mail, CPF, Bearer). Nunca logue o corpo cru de requisições. */
export function redact(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v.replace(EMAIL, '[email]').replace(BEARER, '$1[redigido]').replace(CPF, '[cpf]');
  if (depth > 5 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, SENSITIVE_KEY.test(k) ? '[redigido]' : redact(x, depth + 1)]));
}
export const consoleSink: LogSink = { write: (e) => (e.level === 'error' ? console.error : e.level === 'warn' ? console.warn : console.info)(JSON.stringify(e)) };
// TODO: sinks reais — Sentry (erros: Sentry.captureException), Datadog Logs (HTTP intake), Loki. Mantenha a interface LogSink.
let sinks: LogSink[] = [consoleSink];
export const setSinks = (s: LogSink[]) => { sinks = s; };
export function log(level: Level, action: string, data: Omit<Partial<LogEvent>, 'ts' | 'level' | 'action'> & Record<string, unknown> = {}): LogEvent {
  const e = { ts: new Date().toISOString(), level, action, ...(redact(data) as object) } as LogEvent;
  sinks.forEach((s) => s.write(e)); return e;
}
