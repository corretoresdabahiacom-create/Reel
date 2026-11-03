import { trace, context, SpanStatusCode, propagation, type Span } from '@opentelemetry/api';
import { randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * Tracing: usa a API do OpenTelemetry (no-op sem SDK). Para exportar para Jaeger/Tempo, inicialize o SDK Node
 * (`@opentelemetry/sdk-node` + OTLP exporter) em `instrumentation.ts` quando OTEL_EXPORTER_OTLP_ENDPOINT estiver definido.
 * Para correlacionar HTTP → fila → worker mesmo sem SDK, propagamos `traceparent` no payload dos jobs.
 */
const tracer = trace.getTracer('nexusreel');
export const newTraceId = () => randomBytes(16).toString('hex');
export const sampleRatio = () => (env.NODE_ENV === 'production' ? env.OTEL_SAMPLE_RATIO : 1);

export async function span<T>(name: string, attrs: Record<string, string | number | boolean>, fn: (s: Span) => Promise<T>): Promise<T> {
  return tracer.startActiveSpan(name, { attributes: attrs }, async (s) => {
    try { return await fn(s); } catch (e) { s.recordException(e as Error); s.setStatus({ code: SpanStatusCode.ERROR }); throw e; } finally { s.end(); }
  });
}
export function injectTrace(): Record<string, string> { const carrier: Record<string, string> = {}; propagation.inject(context.active(), carrier); return carrier; }
export function runWithTrace<T>(carrier: Record<string, string> | undefined, fn: () => T): T {
  return context.with(propagation.extract(context.active(), carrier ?? {}), fn);
}
export const currentTraceId = (): string | undefined => trace.getActiveSpan()?.spanContext().traceId;
