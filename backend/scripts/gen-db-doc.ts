import pg from 'pg';
import { writeFileSync } from 'node:fs';
/** Gera a parte automática de docs/DB.md (tabelas, colunas, índices, RLS) a partir do banco migrado. */
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const tables = (await c.query(`SELECT c.relname t, c.relrowsecurity rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname <> 'schema_migrations' ORDER BY 1`)).rows;
let out = '';
for (const t of tables) {
  const cols = (await c.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_name=$1 AND table_schema='public' ORDER BY ordinal_position`, [t.t])).rows;
  const idx = (await c.query(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename=$1 AND schemaname='public' ORDER BY 1`, [t.t])).rows;
  out += `### \`${t.t}\`${t.rls ? ' 🔒 RLS' : ''}\n\n| coluna | tipo | null | default |\n|---|---|---|---|\n` + cols.map((x) => `| ${x.column_name} | ${x.data_type} | ${x.is_nullable === 'YES' ? 'sim' : 'não'} | ${x.column_default ? '`' + String(x.column_default).replace(/\|/g, '\\|').slice(0, 50) + '`' : ''} |`).join('\n') + `\n\nÍndices: ${idx.map((i) => '`' + i.indexname + '`').join(', ') || '—'}\n\n`;
}
writeFileSync('/tmp/db-tables.md', out); console.log(`${tables.length} tabelas`); await c.end();
