import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** Migrator versionado e reversível: `migrations/NNNN_nome.up.sql` / `.down.sql`. Usa advisory lock (um migrador por vez). */
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');
const LOCK = 727_001;
/**
 * Migration sem transação (primeira linha `-- migrate:no-transaction`): necessária para `CREATE INDEX CONCURRENTLY`,
 * que não bloqueia escritas. Os comandos são separados por linhas `-- step` e rodam em ordem; o arquivo precisa ser
 * idempotente, porque uma falha no meio deixa os passos anteriores aplicados e a migration é refeita por inteiro.
 */
const NO_TX = /^--\s*migrate:no-transaction/;
export const splitSteps = (sql: string): string[] => sql.split(/^--\s*step\b.*$/m).map((x) => x.trim())
  .filter((x) => x.split('\n').some((l) => l.trim() && !l.trim().startsWith('--')));
async function runFile(c: pg.Client, sql: string, after: () => Promise<unknown>, dry = false): Promise<'tx' | 'notx' | 'skipped'> {
  if (NO_TX.test(sql)) {
    if (dry) return 'skipped';
    try { for (const st of splitSteps(sql)) await c.query(st); } finally { await c.query('RESET lock_timeout').catch(() => undefined); }
    await after(); return 'notx';
  }
  await c.query('BEGIN');
  try { await c.query(sql); if (!dry) await after(); await c.query(dry ? 'ROLLBACK' : 'COMMIT'); } catch (e) { await c.query('ROLLBACK'); throw e; }
  return 'tx';
}
export async function migrate(url: string, mode: 'up' | 'down' | 'dry' | 'status' = 'up', log: (m: string) => void = () => undefined): Promise<string[]> {
  const c = new pg.Client({ connectionString: url }); await c.connect(); const done: string[] = [];
  try {
    await c.query('SELECT pg_advisory_lock($1)', [LOCK]);
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Set((await c.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    const names = [...new Set(readdirSync(dir).filter((f) => f.endsWith('.up.sql')).map((f) => f.replace('.up.sql', '')))].sort();
    if (mode === 'status') return names.map((n) => `${applied.has(n) ? '✓' : '·'} ${n}`);
    if (mode === 'up' || mode === 'dry') {
      for (const n of names.filter((x) => !applied.has(x))) {
        const sql = readFileSync(join(dir, n + '.up.sql'), 'utf8');
        let how: string;
        try { how = await runFile(c, sql, () => c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [n]), mode === 'dry'); }
        catch (e) { throw new Error(`migration ${n} falhou: ${(e as Error).message}`); }
        if (how === 'skipped') { log(`[dry-run] pulada ${n} (sem transação: não dá para simular e desfazer)`); continue; }
        done.push(n); log(`${mode === 'dry' ? '[dry-run] ' : ''}aplicada ${n}${how === 'notx' ? ' (sem transação)' : ''}`);
      }
    } else {
      const last = names.filter((x) => applied.has(x)).pop();
      if (last) { await runFile(c, readFileSync(join(dir, last + '.down.sql'), 'utf8'), () => c.query('DELETE FROM schema_migrations WHERE name=$1', [last])); done.push(last); log(`revertida ${last}`); }
    }
    return done;
  } finally { await c.query('SELECT pg_advisory_unlock($1)', [LOCK]).catch(() => undefined); await c.end(); }
}
if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  const mode = (process.argv[2] ?? 'up') as 'up' | 'down' | 'dry' | 'status';
  migrate(process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL ?? '', mode, (m) => process.stdout.write(m + '\n'))
    .then((r) => { if (mode === 'status') process.stdout.write(r.join('\n') + '\n'); process.exit(0); })
    .catch((e) => { process.stderr.write(String(e) + '\n'); process.exit(1); });
}
