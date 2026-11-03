/** Métricas: contadores, gauges e histogramas com labels. Interface pronta para Datadog/OTel (TODO: exporter real). */
export type Labels = Record<string, string>;
export interface MetricsBackend { increment(name: string, v: number, l: Labels): void; gauge(name: string, v: number, l: Labels): void; histogram(name: string, v: number, l: Labels): void }
export const METRICS = { generationDuration: 'generation_duration_ms', generationFailures: 'generation_failures_total', publicationSuccess: 'publication_success_total', publicationFailure: 'publication_failure_total', aiCost: 'ai_cost_per_project', queueDepth: 'queue_depth' } as const;
const key = (n: string, l: Labels) => n + JSON.stringify(Object.keys(l).sort().map((k) => [k, l[k]]));
export class MemoryMetrics implements MetricsBackend {
  counters = new Map<string, number>(); gauges = new Map<string, number>(); hist = new Map<string, number[]>();
  increment(n: string, v = 1, l: Labels = {}) { this.counters.set(key(n, l), (this.counters.get(key(n, l)) ?? 0) + v); }
  gauge(n: string, v: number, l: Labels = {}) { this.gauges.set(key(n, l), v); }
  histogram(n: string, v: number, l: Labels = {}) { const k = key(n, l); this.hist.set(k, [...(this.hist.get(k) ?? []), v]); }
  percentile(n: string, p: number, l: Labels = {}): number { const a = (this.hist.get(key(n, l)) ?? []).slice().sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))] : 0; }
}
export let metrics: MetricsBackend = new MemoryMetrics();
export const setMetricsBackend = (b: MetricsBackend) => { metrics = b; };
// TODO: DatadogBackend (dogstatsd) ou OtelBackend (@opentelemetry/api metrics). Alertas: ver docs/OBSERVABILITY.md.
