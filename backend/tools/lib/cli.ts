export { arg, flag, isMain } from './args.js';
/** Executa `fn` e encerra Postgres/Redis (import dinâmico: ferramentas sem banco não exigem env). Erros → stderr + exit 1. */
export async function run(fn: () => Promise<void>): Promise<void> {
  try { await fn(); } catch (e) { console.error((e as Error).message); process.exitCode = 1; }
  finally { const { closePools } = await import('../../src/db/pool.js'); const { redis } = await import('../../src/db/redis.js'); await closePools().catch(() => undefined); redis.disconnect(); }
}
