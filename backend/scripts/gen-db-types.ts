/**
 * P0-1 etapa 2 — tipos das LINHAS do Postgres gerados do schema real (information_schema), para que consultas como
 * `pool.query<Row<'bcp_scenarios'>>(…)` tenham tipo honesto e o contrato da API (gerado do TypeScript) saia certo.
 * Conversões iguais às do driver em `src/db/pool.ts`: int8/numeric → number; timestamptz/date → Date; jsonb → unknown.
 *
 * Uso: `npx tsx scripts/gen-db-types.ts` (com DATABASE_URL de um banco migrado). `tests/36` confere que está em dia.
 */
import pg from 'pg';
import { writeFileSync } from 'node:fs';

const TS: Record<string, string> = { uuid: 'string', text: 'string', varchar: 'string', bpchar: 'string', citext: 'string', int2: 'number', int4: 'number', int8: 'number', numeric: 'number', float4: 'number', float8: 'number', bool: 'boolean', timestamptz: 'Date', timestamp: 'Date', date: 'Date', jsonb: 'unknown', json: 'unknown', bytea: 'Buffer', inet: 'string' };

export async function generateDbTypes(url: string): Promise<string> {
  const c = new pg.Client({ connectionString: url }); await c.connect();
  try {
    const enums = (await c.query<{ name: string; labels: string[] }>(`SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder)::text[] AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY 1`)).rows;
    const cols = (await c.query<{ table_name: string; column_name: string; udt_name: string; is_nullable: string }>(`SELECT c.table_name, c.column_name, c.udt_name, c.is_nullable FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.table_name <> 'schema_migrations' ORDER BY c.table_name, c.column_name`)).rows;
    const en = new Map(enums.map((e) => [e.name, e.labels.map((l) => `'${l}'`).join(' | ')]));
    const tsOf = (u: string): string => u.startsWith('_') ? `Array<${tsOf(u.slice(1))}>` : en.get(u) ? `(${en.get(u)})` : TS[u] ?? 'unknown';
    const byTable = new Map<string, string[]>();
    for (const r of cols) (byTable.get(r.table_name) ?? byTable.set(r.table_name, []).get(r.table_name)!).push(`    ${r.column_name}: ${tsOf(r.udt_name)}${r.is_nullable === 'YES' ? ' | null' : ''};`);
    return ['// GERADO por scripts/gen-db-types.ts a partir do schema do Postgres — NÃO EDITE À MÃO.', 'export interface DbRows {',
      ...[...byTable].map(([t, l]) => `  ${t}: {\n${l.join('\n')}\n  };`), '}', 'export type Row<T extends keyof DbRows> = DbRows[T];', ''].join('\n');
  } finally { await c.end(); }
}

if (process.argv[1]?.endsWith('gen-db-types.ts')) {
  const url = process.env.DATABASE_URL; if (!url) { console.error('defina DATABASE_URL (banco migrado)'); process.exit(2); }
  writeFileSync('src/db/rows.generated.ts', await generateDbTypes(url)); console.log('src/db/rows.generated.ts gerado');
}
