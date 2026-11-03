/** Stubs de integração — nenhum envia dados reais até as chaves/DSNs serem configuradas (TODO Fase 6). */
import { setSinks, consoleSink, type LogSink } from "./logger.js";

export interface IntegrationConfig { sentryDsn?: string; datadogApiKey?: string; otlpEndpoint?: string; posthogKey?: string }

export function initObservability(cfg: IntegrationConfig, hasAnalyticsConsent: () => boolean): string[] {
  const active: string[] = [];
  if (cfg.sentryDsn) { /* TODO: Sentry.init({ dsn, beforeSend: scrub }) / @sentry/capacitor no app nativo */ active.push("sentry"); }
  if (cfg.datadogApiKey) { { const dd: LogSink = { write: (e) => { /* TODO: POST https://http-intake.logs.datadoghq.com/api/v2/logs (evento já redigido) */ void e; } }; setSinks([consoleSink, dd]); } active.push("datadog"); }
  if (cfg.otlpEndpoint) { /* TODO: exporter OTLP/HTTP dos spans de tracing.ts */ active.push("otel"); }
  if (cfg.posthogKey && hasAnalyticsConsent()) { /* TODO: posthog.init(key) somente com consentimento "cookies" */ active.push("posthog"); }
  return active;
}
