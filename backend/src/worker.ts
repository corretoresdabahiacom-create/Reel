import { env } from './config/env.js';
import { logger } from './observability/logger.js';
import { initSentry } from './observability/sentry.js';
import { startAllWorkers, scheduleRecurring } from './workers.js';
import { closeQueues, stopQueueMetrics } from './queues/index.js';
import { closePools } from './db/pool.js';
import { closeRedis } from './db/redis.js';
import { registry } from './observability/metrics.js';
import { createServer } from 'node:http';

initSentry();
const only = process.env.WORKER_QUEUES?.split(',').map((s) => s.trim()).filter(Boolean); // permite dedicar pods a filas específicas (ex.: assemble)
startAllWorkers(only?.length ? only : undefined); await scheduleRecurring();
const port = Number(process.env.WORKER_METRICS_PORT ?? 9464);
createServer(async (req, res) => { if (req.url === '/healthz') { res.end('ok'); return; } if (req.url === '/metrics') { res.setHeader('content-type', registry.contentType); res.end(await registry.metrics()); return; } res.statusCode = 404; res.end(); }).listen(port);
logger.info({ queues: only ?? 'all', metricsPort: port, env: env.NODE_ENV }, 'workers no ar');
let closing = false;
async function shutdown(sig: string) { if (closing) return; closing = true; logger.info({ sig }, 'workers: graceful shutdown (aguardando jobs em andamento)'); const t = setTimeout(() => process.exit(1), 60_000); t.unref(); try { stopQueueMetrics(); await closeQueues(); await closePools(); await closeRedis(); } finally { process.exit(0); } }
for (const s of ['SIGTERM', 'SIGINT'] as const) process.on(s, () => void shutdown(s));
