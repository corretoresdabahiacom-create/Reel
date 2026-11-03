/** Tracing distribuído (stub compatível com OpenTelemetry). traceId é propagado no header `traceparent` (W3C) entre app → backend → provedores. */
export interface Span { traceId: string; spanId: string; parentId?: string; name: string; startMs: number; endMs?: number; status?: 'ok' | 'error'; attrs: Record<string, string | number | boolean> }
const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
export const spans: Span[] = [];
export function startSpan(name: string, parent?: Pick<Span, 'traceId' | 'spanId'>, attrs: Span['attrs'] = {}): Span {
  const s: Span = { traceId: parent?.traceId ?? hex(32), spanId: hex(16), parentId: parent?.spanId, name, startMs: Date.now(), attrs }; spans.push(s); return s;
}
export function endSpan(s: Span, status: 'ok' | 'error' = 'ok', attrs: Span['attrs'] = {}): Span { s.endMs = Date.now(); s.status = status; Object.assign(s.attrs, attrs); return s; }
export const toTraceparent = (s: Span) => `00-${s.traceId}-${s.spanId}-01`;
export function fromTraceparent(h: string): { traceId: string; spanId: string } | null { const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-0[01]$/.exec(h); return m ? { traceId: m[1], spanId: m[2] } : null; }
export async function withSpan<T>(name: string, fn: (s: Span) => Promise<T>, parent?: Span, attrs: Span['attrs'] = {}): Promise<T> {
  const s = startSpan(name, parent, attrs); try { const r = await fn(s); endSpan(s, 'ok'); return r; } catch (e) { endSpan(s, 'error', { error: (e as Error).message }); throw e; }
}
// TODO: trocar por @opentelemetry/sdk-trace-node + exporter OTLP (Grafana Tempo / Datadog).
