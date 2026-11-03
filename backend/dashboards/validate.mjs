// Executa cada card de cada dashboard contra o DWH (dbt ja rodado) e falha se algum SQL quebrar. Uso: node dashboards/validate.mjs
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import pg from 'pg';
const dir = path.dirname(fileURLToPath(import.meta.url));
const url = process.env.DWH_URL ?? 'postgres://postgres@127.0.0.1:55432/nexus_dwh';
const yml = fs.readFileSync(path.join(dir, 'dashboards.yml'), 'utf8'); const files = [...yml.matchAll(/file:\s*([\w.]+)/g)].map((m) => m[1]);
const c = new pg.Client({ connectionString: url }); await c.connect(); let cards = 0, fail = 0;
for (const f of files) {
  const parts = fs.readFileSync(path.join(dir, f), 'utf8').split(/^-- card: /m).slice(1);
  for (const p of parts) { const [head, ...rest] = p.split('\n'); const id = head.split('|')[0].trim(); cards++;
    try { const r = await c.query(rest.join('\n').trim().replace(/;\s*$/, '')); console.log(`ok   ${f}:${id} (${r.rowCount} linhas)`); } catch (e) { fail++; console.error(`FAIL ${f}:${id} ${e.message}`); } }
}
await c.end(); console.log(`${cards} cards, ${fail} falhas`); process.exit(fail ? 1 : 0);
