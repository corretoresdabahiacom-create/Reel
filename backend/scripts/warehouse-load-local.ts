/**
 * Carrega o export do warehouse (JSONL em WAREHOUSE_EXPORT_DIR) no schema `raw` de um Postgres — SOMENTE para validar o dbt localmente.
 * Em produção o mesmo contrato (warehouse/raw_ddl.sql) é carregado no BigQuery por load jobs (ver docs/DATA_WAREHOUSE.md).
 * Uso: DATABASE_URL=... WAREHOUSE_EXPORT_DIR=./.warehouse npx tsx scripts/warehouse-load-local.ts [--target-url postgres://...]
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const url = process.argv.includes('--target-url') ? process.argv[process.argv.indexOf('--target-url') + 1]! : process.env.DATABASE_URL!;
const dir = process.env.WAREHOUSE_EXPORT_DIR ?? './.warehouse';
const SNAPSHOTS = ['users', 'transactions', 'projects', 'publications', 'ai_usage', 'experiment_assignments', 'referrals', 'template_purchases'];
export async function loadLocal(connectionString: string, exportDir: string): Promise<Record<string, number>> {
  const c = new pg.Client({ connectionString }); await c.connect(); const out: Record<string, number> = {};
  try {
    await c.query(readFileSync(new URL('../warehouse/raw_ddl.sql', import.meta.url), 'utf8'));
    const load = async (table: string, lines: string[], keepLoaded = false) => {
      if (!lines.length) return 0;
      await c.query('CREATE TEMP TABLE IF NOT EXISTS _stage (data jsonb)'); await c.query('TRUNCATE _stage');
      const now = new Date().toISOString(); lines = lines.map((l) => { const j = JSON.parse(l); j._loaded_at ??= now; if (table === 'users') j.snapshot_at ??= now; return JSON.stringify(j); });
      for (let i = 0; i < lines.length; i += 2000) await c.query('INSERT INTO _stage SELECT unnest($1::jsonb[])', [lines.slice(i, i + 2000)]);
      if (!keepLoaded) await c.query(`TRUNCATE raw.${table}`);
      const r = await c.query(`INSERT INTO raw.${table} SELECT (jsonb_populate_record(NULL::raw.${table}, data)).* FROM _stage`); return r.rowCount ?? 0;
    };
    // eventos: incremental e idempotente por event_id
    const evFiles = existsSync(exportDir) ? readdirSync(exportDir).filter((f) => f.startsWith('events-')).sort() : []; let n = 0;
    for (const f of evFiles) { const lines = readFileSync(join(exportDir, f), 'utf8').split('\n').filter(Boolean).map((l) => { const j = JSON.parse(l); j.occurred_at ??= j.created_at; j._loaded_at ??= new Date().toISOString(); j.schema_version ??= 1; j.source ??= 'client'; j.props ??= {}; return JSON.stringify(j); }); await c.query('CREATE TEMP TABLE IF NOT EXISTS _stage (data jsonb)'); await c.query('TRUNCATE _stage'); for (let i = 0; i < lines.length; i += 2000) await c.query('INSERT INTO _stage SELECT unnest($1::jsonb[])', [lines.slice(i, i + 2000)]);
      const r = await c.query(`INSERT INTO raw.events SELECT (jsonb_populate_record(NULL::raw.events, data)).* FROM _stage s WHERE NOT EXISTS (SELECT 1 FROM raw.events e WHERE e.event_id = s.data->>'event_id')`); n += r.rowCount ?? 0; }
    out.events = n;
    for (const t of SNAPSHOTS) { const f = join(exportDir, 'snapshots', `${t}.jsonl`); out[t] = existsSync(f) ? await load(t, readFileSync(f, 'utf8').split('\n').filter(Boolean)) : 0; }
  } finally { await c.end(); }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}`) loadLocal(url, dir).then((o) => { console.log(JSON.stringify(o)); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
