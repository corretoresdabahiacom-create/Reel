import { env } from './config/env.js';
import { logger } from './observability/logger.js';
import { initSentry } from './observability/sentry.js';
import { buildApp } from './app.js';
import { closePools, pool } from './db/pool.js';
import { closeRedis } from './db/redis.js';
import { closeQueues, stopQueueMetrics } from './queues/index.js';
import { startAllWorkers, scheduleRecurring } from './workers.js';
import { migrate } from './db/migrate.js';

initSentry();
if (process.env.RUN_MIGRATIONS === 'true') await migrate(env.DATABASE_URL, 'up', (m) => logger.info(m));
const embed = process.env.EMBED_WORKERS === 'true'; // dev: API + workers no mesmo processo
const app = await buildApp({ bullBoard: env.BULL_BOARD_ENABLED });
if (embed) { startAllWorkers(); await scheduleRecurring(); }
await app.listen({ port: env.PORT, host: '0.0.0.0' });
logger.info({ port: env.PORT, env: env.NODE_ENV, embedWorkers: embed }, 'API no ar');
let closing = false;
async function shutdown(sig: string) {
  if (closing) return; closing = true; logger.info({ sig }, 'graceful shutdown');
  const t = setTimeout(() => { logger.error('shutdown forçado'); process.exit(1); }, 25_000); t.unref();
  try { await app.close(); stopQueueMetrics(); await closeQueues(); await closePools(); await closeRedis(); void pool; } finally { process.exit(0); }
}
for (const s of ['SIGTERM', 'SIGINT'] as const) process.on(s, () => void shutdown(s));
process.on('unhandledRejection', (e) => logger.error({ err: String(e) }, 'unhandledRejection'));
