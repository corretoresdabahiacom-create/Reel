/** Inicializa o SDK do OpenTelemetry quando OTEL_EXPORTER_OTLP_ENDPOINT está definido (carregado com `node --import ./dist/instrumentation.js`). Sem endpoint: no-op. */
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  try {
    const sdkMod = '@opentelemetry/sdk-node'; const expMod = '@opentelemetry/exporter-trace-otlp-http';
    const { NodeSDK } = await import(/* @vite-ignore */ sdkMod); const { OTLPTraceExporter } = await import(/* @vite-ignore */ expMod);
    const sdk = new NodeSDK({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'nexusreel-api', traceExporter: new OTLPTraceExporter({ url: `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` }) }); sdk.start();
    process.on('SIGTERM', () => void sdk.shutdown());
  } catch (e) { console.warn('OTel SDK indisponível (instale @opentelemetry/sdk-node e exporter-trace-otlp-http):', (e as Error).message); }
}
export {};
