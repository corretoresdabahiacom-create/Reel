/**
 * P0-1 etapa 2b — tipa consultas SELECT do código perguntando ao PRÓPRIO Postgres o formato do resultado.
 *
 * Para cada `pool|db|readPool.query(\`SELECT …\`)` sem tipo e sem interpolação (`${}`), roda
 * `SELECT * FROM (<sql>) _q LIMIT 0` numa transação desfeita, com `NULL` em cada `$n`, e lê `fields`
 * (nome, tipo, tabela/coluna de origem). Coluna que vem direto de uma tabela herda o NOT NULL dela; coluna calculada
 * é anulável, exceto `count(…)`, `exists(…)` e `coalesce(…)` (nunca nulos). O resultado vira o genérico da chamada,
 * com o mesmo mapeamento de tipos do driver (`src/db/pool.ts`: int8/numeric → number).
 *
 * Uso: `DATABASE_URL=<banco migrado> npx tsx scripts/type-queries.ts [--write]`. Sem `--write` só relata.
 */
import pg from 'pg';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OID: Record<number, string> = { 16: 'boolean', 20: 'number', 21: 'number', 23: 'number', 700: 'number', 701: 'number', 1700: 'number', 25: 'string', 1043: 'string', 1042: 'string', 19: 'string', 2950: 'string', 869: 'string', 1184: 'Date', 1114: 'Date', 1082: 'Date', 114: 'unknown', 3802: 'unknown',
  1009: 'string[]', 1015: 'string[]', 2951: 'string[]', 1007: 'number[]', 1016: 'number[]', 1000: 'boolean[]', 1185: 'Date[]', 3807: 'unknown[]', 1022: 'number[]', 1231: 'number[]' };
const OID_NAME: Record<string, string> = { uuid: 'string', text: 'string', varchar: 'string', bpchar: 'string', int2: 'number', int4: 'number', int8: 'number', numeric: 'number', float4: 'number', float8: 'number', bool: 'boolean', timestamptz: 'Date', timestamp: 'Date', date: 'Date', jsonb: 'unknown', json: 'unknown', inet: 'string' };
const CALL = /\b(pool|db|readPool)\.query\((`|')/g;

/** Serviços analíticos (agregados sobre janelas): a nulidade calculada exige revisão humana linha a linha — fora do automático. */
const EXCLUDE = new Set(['src/modules/datascience/datascience.service.ts', 'src/modules/growth/growth.service.ts', 'src/modules/recommendations/recommendations.service.ts', 'src/modules/retention/retention.service.ts', 'src/modules/monetization/monetization.service.ts']);
function files(d: string): string[] { return readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('rows.generated.ts') ? [p] : []; }); }
/** Texto no nível 0 de parênteses (para achar a lista do SELECT e o FROM principal sem cair em subconsultas). */
function topLevel(sql: string): string { let d = 0, out = ''; for (const ch of sql) { if (ch === '(') d++; out += d === 0 ? ch : ch === '(' || ch === ')' ? ch : ' '; if (ch === ')') d--; } return out; }
/** Itens da lista do SELECT principal + tabelas do FROM (alias → tabela; LEFT JOIN marcado como anulável). */
function parseSelect(sql: string): { items: string[]; from: Map<string, { table: string; nullable: boolean }> } {
  const body = sql.replace(/^\s*WITH\s[\s\S]*?\)\s*(?=SELECT\b)/i, ''); const top = topLevel(body);
  const sel = top.search(/\bSELECT\b/i); const fromAt = top.slice(sel + 6).search(/\bFROM\b/i);
  const from = new Map<string, { table: string; nullable: boolean }>();
  if (sel < 0 || fromAt < 0) return { items: [], from };
  let list = body.slice(sel + 6, sel + 6 + fromAt).replace(/^\s*DISTINCT\s+(ON\s*\([^)]*\)\s*)?/i, '');
  const items: string[] = []; let depth = 0, cur = '';
  for (const ch of list) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { items.push(cur.trim()); cur = ''; } else cur += ch; }
  if (cur.trim()) items.push(cur.trim());
  const rest = top.slice(sel + 6 + fromAt);
  for (const m of rest.matchAll(/\b(LEFT\s+(?:OUTER\s+)?JOIN|JOIN|FROM)\s+([a-z_][a-z0-9_]*)(?:\s+(?:AS\s+)?(?!ON\b|WHERE\b|JOIN\b|LEFT\b|INNER\b|ORDER\b|GROUP\b|LIMIT\b)([a-z_][a-z0-9_]*))?/gi))
    from.set((m[3] ?? m[2])!.toLowerCase(), { table: m[2]!.toLowerCase(), nullable: /^LEFT/i.test(m[1]!) });
  void list; list = ''; return { items, from };
}
const stripCasts = (x: string) => x.replace(/::[a-z_0-9[\]]+(\s*\[\])?/gi, '').trim();
/** Separa `expr [AS] alias`. Sem alias, o Postgres nomeia pela coluna (`u.id::text` → `id`) ou `?column?`. */
function splitAlias(item: string): { expr: string; name: string } {
  const m = item.match(/^([\s\S]*?\S)\s+(?:AS\s+)?"?([A-Za-z_][A-Za-z0-9_]*)"?$/i);
  if (m && !/^(END|NULL|DESC|ASC|TRUE|FALSE)$/i.test(m[2]!) && !/\b(AS|AND|OR|NOT|IS|THEN|ELSE|WHEN|FROM)$/i.test(m[1]!.trim())) return { expr: m[1]!.trim(), name: m[2]! };
  return { expr: item.trim(), name: stripCasts(item).split('.').pop()!.replace(/"/g, '') };
}
/** Expressão que o Postgres nunca devolve nula. */
const neverNull = (e: string) => /^\(?\s*(count|exists|coalesce)\s*\(/i.test(e) || /^\(\s*select\s+(count|exists|coalesce)\s*\(/i.test(e) || /\bIS\s+(NOT\s+)?(NULL|TRUE|FALSE|DISTINCT\s+FROM)\b/i.test(e) && !/\b(AND|OR)\b/i.test(e) || /^(now\(\)|true|false|'[^']*'|-?\d+(\.\d+)?)$/i.test(stripCasts(e));
export async function typeQueries(url: string, write: boolean) {
  const c = new pg.Client({ connectionString: url }); await c.connect(); await c.query(`SET ROLE nexus_app`).catch(() => undefined); await c.query('RESET ROLE');
  const enums = new Map((await c.query<{ oid: number; labels: string[] }>(`SELECT t.oid::int AS oid, array_agg(e.enumlabel::text ORDER BY e.enumsortorder)::text[] AS labels FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid GROUP BY t.oid`)).rows.map((r) => [r.oid, r.labels.map((l) => `'${l}'`).join(' | ')]));
  const colNN = new Map((await c.query<{ k: string; nn: boolean }>(`SELECT table_name || '.' || column_name AS k, is_nullable = 'NO' AS nn FROM information_schema.columns WHERE table_schema='public'`)).rows.map((r) => [r.k, r.nn]));
  const colTypes = new Map<string, Map<string, string>>();
  for (const r of (await c.query<{ t: string; c: string; u: string; n: string }>(`SELECT table_name t, column_name c, udt_name u, is_nullable n FROM information_schema.columns WHERE table_schema='public'`)).rows) {
    const base = r.u.startsWith('_') ? `${OID_NAME[r.u.slice(1)] ?? 'unknown'}[]` : OID_NAME[r.u] ?? 'unknown';
    (colTypes.get(r.t) ?? colTypes.set(r.t, new Map()).get(r.t)!).set(r.c, base + (r.n === 'YES' && base !== 'unknown' ? ' | null' : ''));
  }
  const notNull = new Map((await c.query<{ k: string; nn: boolean }>(`SELECT attrelid::int || ':' || attnum AS k, attnotnull AS nn FROM pg_attribute WHERE attnum > 0`)).rows.map((r) => [r.k, r.nn]));
  const report = { typed: 0, skipped: 0, failed: [] as string[] };
  for (const f of files('src').filter((x) => !EXCLUDE.has(x))) {
    let s = readFileSync(f, 'utf8'); const edits: Array<{ at: number; text: string }> = [];
    for (const m of s.matchAll(CALL)) {
      const q = m[2]!; const start = m.index! + m[0].length; const end = s.indexOf(q, start); if (end < 0) continue;
      const sql = s.slice(start, end);
      // escrita com RETURNING de colunas simples: tipo vem do catálogo (sem executar nada)
      const w = sql.includes('${') ? null : sql.match(/^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+([a-z_][a-z0-9_]*)\b[\s\S]*\bRETURNING\s+([\s\S]+?)\s*$/i);
      if (w && !/\bWITH\b|\bFROM\b[\s\S]*\bRETURNING/i.test(sql.replace(/^\s*DELETE\s+FROM/i, ''))) {
        const t = w[1]!.toLowerCase(); const cols = colTypes.get(t); const items = w[2]!.split(',').map((x) => x.trim());
        if (cols && items.every((x) => x === '*' || /^[a-z_][a-z0-9_]*(\s+AS\s+"?[A-Za-z_][A-Za-z0-9_]*"?)?$/i.test(x))) {
          const parts = items.flatMap((x) => x === '*' ? [...cols].map(([c, ty]) => `${c}: ${ty}`) : (() => { const m2 = x.match(/^([a-z_][a-z0-9_]*)(?:\s+AS\s+"?([A-Za-z_][A-Za-z0-9_]*)"?)?$/i)!; const ty = cols.get(m2[1]!.toLowerCase()); return ty ? [`${m2[2] ?? m2[1]}: ${ty}`] : ['__x']; })());
          if (!parts.includes('__x')) { edits.push({ at: m.index! + m[0].length - 2, text: items.includes('*') && items.length === 1 ? `<Row<'${t}'>>` : `<{ ${parts.join('; ')} }>` }); report.typed++; continue; }
        }
      }
      if (sql.includes('${') || !/^\s*(SELECT|WITH)\b/i.test(sql) || /\bFOR\s+(UPDATE|SHARE|NO KEY)/i.test(sql) || /\$\d+/.test(sql) && false) { report.skipped++; continue; }
      const n = Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((x) => Number(x[1])));
      try {
        await c.query('BEGIN'); const r = await c.query(`SELECT * FROM (${sql}) _q LIMIT 0`, Array(n).fill(null)); await c.query('ROLLBACK');
        const { items, from } = parseSelect(sql); const byName = new Map(items.map((i) => { const x = splitAlias(i); return [x.name, x.expr] as const; }));
        const fields = r.fields.map((fl) => {
          let t = OID[fl.dataTypeID] ?? enums.get(fl.dataTypeID) ?? 'unknown'; if (enums.has(fl.dataTypeID)) t = `(${t})`;
          const e = byName.get(fl.name);
          // origem direta numa tabela (o driver informa) — exceto se a tabela entrou por LEFT JOIN
          let nn: boolean | undefined = fl.tableID ? notNull.get(`${fl.tableID}:${fl.columnID}`) : undefined;
          if (nn !== undefined && e) { const ref = stripCasts(e).match(/^(?:([a-z_][a-z0-9_]*)\.)?"?[a-z_][a-z0-9_]*"?$/i); const src = ref?.[1] ? from.get(ref[1].toLowerCase()) : from.size === 1 ? [...from.values()][0] : undefined; if (src?.nullable) nn = false; }
          // coluna com cast (perde a origem): procura a coluna na tabela do FROM
          if (nn === undefined && e) { const ref = stripCasts(e).match(/^(?:([a-z_][a-z0-9_]*)\.)?"?([a-z_][a-z0-9_]*)"?$/i); if (ref) { const src = ref[1] ? from.get(ref[1].toLowerCase()) : from.size === 1 ? [...from.values()][0] : undefined; if (src && !src.nullable) nn = colNN.get(`${src.table}.${ref[2]!.toLowerCase()}`); } }
          if (nn === undefined) nn = e ? neverNull(e) : false;
          return `${/^[A-Za-z_$][\w$]*$/.test(fl.name) ? fl.name : JSON.stringify(fl.name)}: ${t}${nn || t === 'unknown' ? '' : ' | null'}`;
        });
        if (new Set(r.fields.map((x) => x.name)).size !== r.fields.length) { report.failed.push(`${f}: colunas repetidas`); continue; }
        const paren = m.index! + m[0].length - 2; // posição do '('
        edits.push({ at: paren, text: `<{ ${fields.join('; ')} }>` }); report.typed++;
      } catch (e) { await c.query('ROLLBACK').catch(() => undefined); report.failed.push(`${f}: ${(e as Error).message.slice(0, 90)}`); }
    }
    if (write && edits.length) { for (const e of edits.sort((a, b) => b.at - a.at)) s = s.slice(0, e.at) + e.text + s.slice(e.at); writeFileSync(f, s); }
  }
  await c.end(); return report;
}

if (process.argv[1]?.endsWith('type-queries.ts')) {
  const r = await typeQueries(process.env.DATABASE_URL!, process.argv.includes('--write'));
  console.log(`tipadas: ${r.typed} · puladas (interpolação/escrita/FOR UPDATE): ${r.skipped} · falharam: ${r.failed.length}`); for (const x of r.failed.slice(0, 40)) console.log('  ' + x);
}
