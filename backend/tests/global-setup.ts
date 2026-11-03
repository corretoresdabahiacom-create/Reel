import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { migrate } from '../src/db/migrate.js';
import { refresh, type Shape } from '../src/observability/contractRecorder.js';
import pg from 'pg';
import { Redis } from 'ioredis';

/** Sobe Postgres/Redis locais (se não houver TEST_DATABASE_URL), recria o schema do zero via migrations e limpa o Redis. */
export default async function setup(): Promise<void | (() => void)> {
  if (process.env.OPENAPI_RECORD === '1') {
    // P0-1: a gravação guarda o contrato anterior como base; no fim, para cada rota exercitada, os NOMES de campo vêm desta
    // execução e os TIPOS se unem com a base (contractRecorder.refresh). Rota não exercitada mantém o que já tinha.
    // Entrada (zod) é recalculada do zero a cada execução: é exata, não amostrada.
    rmSync('.openapi-record', { recursive: true, force: true }); mkdirSync('.openapi-record', { recursive: true });
    if (existsSync('docs/openapi-observed.json')) {
      const base = JSON.parse(readFileSync('docs/openapi-observed.json', 'utf8')) as Record<string, unknown>;
      writeFileSync('.openapi-record/baseline.json', JSON.stringify(base));
    }
  }
  const dbUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/nexus_test'; const redisUrl = process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379';
  if (!process.env.TEST_DATABASE_URL) execSync('bash scripts/infra-local.sh start', { stdio: 'ignore' });
  const c = new pg.Client({ connectionString: dbUrl }); await c.connect(); await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nexus_app') THEN DROP OWNED BY nexus_app; DROP ROLE nexus_app; END IF; END $$;`).catch(() => undefined); await c.end();
  await migrate(dbUrl, 'up'); const r = new Redis(redisUrl); await r.flushall(); await r.quit();
  if (process.env.OPENAPI_RECORD === '1') return () => {
    // fim da suíte: grava o contrato observado, com chaves ordenadas (diff estável)
    const f = '.openapi-record/observed.json'; if (!existsSync(f)) return;
    const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
    const cur = JSON.parse(readFileSync(f, 'utf8')) as Record<string, { body?: unknown; query?: unknown; responses: Record<string, Shape> }>;
    const base = existsSync('.openapi-record/baseline.json') ? JSON.parse(readFileSync('.openapi-record/baseline.json', 'utf8')) as Record<string, { responses: Record<string, Shape> }> : {};
    const out: Record<string, unknown> = { ...base };
    for (const [k, v] of Object.entries(cur)) out[k] = { ...v, responses: Object.fromEntries(Object.entries(v.responses).map(([st, sh]) => [st, refresh(base[k]?.responses[st], sh)])) };
    writeFileSync('docs/openapi-observed.json', JSON.stringify(sort(out), null, 1) + '\n');
  };
}
