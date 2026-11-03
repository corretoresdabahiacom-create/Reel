// Validação de esquema do Terraform sem baixar providers (o `tofu validate` não roda neste ambiente: rede bloqueada).
// Esquema: pacotes @cdktf/provider-* (gerados automaticamente do esquema oficial de cada provider: AWS 5.100.0, TLS 4.1.0,
// Random 3.7.2). Confere, em todos os .tf de cada diretório (módulo):
//  1. todo recurso/data source existe no provider; todo atributo e bloco aninhado existe; atributos obrigatórios presentes;
//  2. chamadas de módulo: só variáveis declaradas, todas as obrigatórias; `module.X.Y` aponta para output existente;
//  3. referências var.*, local.*, data.*.*, <recurso>.<nome> apontam para coisas declaradas no mesmo módulo.
// Uso: npm --prefix tools/tf-check ci && node tools/tf-check/schema.mjs infra/terraform
/* global process, console */
import { parse } from '@cdktf/hcl2json';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire(import.meta.url);
const PROVIDERS = { aws: '@cdktf/provider-aws', tls: '@cdktf/provider-tls', random: '@cdktf/provider-random' };
const META = new Set(['count', 'for_each', 'depends_on', 'provider', 'lifecycle', 'provisioner', 'connection']);
const errors = []; const err = (m) => errors.push(m);
const cache = new Map();
function interfacesOf(file) {
  if (cache.has(file)) return cache.get(file);
  const src = readFileSync(file, 'utf8'); const out = {};
  for (const m of src.matchAll(/export interface (\w+)(?: extends ([^{]+))? \{([\s\S]*?)\n\}/g)) {
    const props = {};
    for (const p of m[3].matchAll(/#(\w+) \w+#\w+\}(?:(?!\*\/)[\s\S])*\*\/\s*readonly (\w+)(\?)?: ([^;]+);/g)) props[p[1]] = { optional: !!p[3], type: p[4] };
    out[m[1]] = { props, meta: (m[2] || '').includes('TerraformMetaArguments') };
  }
  cache.set(file, out); return out;
}
function schemaFor(kind, type) {
  const prov = type.split('_')[0]; const pkg = PROVIDERS[prov]; if (!pkg) return null;
  const base = type.slice(prov.length + 1).replace(/_/g, '-');
  const dir = kind === 'data' ? `data-${prov}-${base}` : base;
  const root = dirname(req.resolve(`${pkg}/package.json`)); const f = join(root, 'lib', dir, 'index.d.ts');
  if (!existsSync(f)) return { missing: true };
  const ifs = interfacesOf(f); const cfg = Object.entries(ifs).find(([n, v]) => v.meta && n.endsWith('Config'));
  return { ifs, root: cfg && cfg[0] };
}
const nestedOf = (ifs, t) => { const n = (t.match(/[A-Z]\w+/g) || []).find((x) => ifs[x]); return n || null; };
function checkBlock(where, ifs, iname, body) {
  const spec = ifs[iname]; if (!spec) return;
  const present = new Set(Object.keys(body));
  for (const [k, v] of Object.entries(body)) {
    if (META.has(k)) continue;
    if (k === 'dynamic') { for (const [dn, arr] of Object.entries(v)) { const p = spec.props[dn]; if (!p) { err(`${where}: bloco dinâmico "${dn}" não existe`); continue; } present.add(dn);
      const ni = nestedOf(ifs, p.type); for (const d of arr) for (const c of d.content || []) if (ni) checkBlock(`${where}.${dn}`, ifs, ni, c); } continue; }
    const p = spec.props[k]; if (!p) { err(`${where}: "${k}" não existe no esquema`); continue; }
    const ni = nestedOf(ifs, p.type);
    if (ni && Array.isArray(v)) for (const [i, el] of v.entries()) if (el && typeof el === 'object' && !Array.isArray(el)) checkBlock(`${where}.${k}[${i}]`, ifs, ni, el);
  }
  for (const [k, p] of Object.entries(spec.props)) if (!p.optional && !present.has(k)) err(`${where}: falta "${k}" (obrigatório)`);
}
const tfFiles = (d) => readdirSync(d).filter((f) => f.endsWith('.tf')).map((f) => join(d, f));
const ROOT = resolve(process.argv[2] ?? 'infra/terraform'); const rel = (p) => relative(ROOT, p) || '.';
const dirs = []; (function walk(d) { if (tfFiles(d).length) dirs.push(d); for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory() && !e.startsWith('.')) walk(p); } })(ROOT);
const parsedDir = new Map();
async function load(d) { if (parsedDir.has(d)) return parsedDir.get(d); const all = []; for (const f of tfFiles(d)) all.push({ f, j: await parse(f, readFileSync(f, 'utf8')) }); parsedDir.set(d, all); return all; }
let checked = 0;
for (const d of dirs) {
  const files = await load(d); const decl = { var: new Set(), local: new Set(), res: new Set(), data: new Set(), module: new Map(), out: new Set() };
  for (const { j } of files) {
    for (const n of Object.keys(j.variable || {})) decl.var.add(n);
    for (const l of j.locals || []) for (const n of Object.keys(l)) decl.local.add(n);
    for (const [t, byName] of Object.entries(j.resource || {})) for (const n of Object.keys(byName)) decl.res.add(`${t}.${n}`);
    for (const [t, byName] of Object.entries(j.data || {})) for (const n of Object.keys(byName)) decl.data.add(`${t}.${n}`);
    for (const [n, arr] of Object.entries(j.module || {})) decl.module.set(n, arr[0]);
    for (const n of Object.keys(j.output || {})) decl.out.add(n);
  }
  for (const { f, j } of files) {
    for (const kind of ['resource', 'data']) for (const [t, byName] of Object.entries(j[kind] || {})) for (const [n, arr] of Object.entries(byName)) {
      const sc = schemaFor(kind, t); const where = `${rel(f)}: ${kind === 'data' ? 'data.' : ''}${t}.${n}`;
      if (!sc) continue; if (sc.missing) { err(`${where}: tipo não existe no provider`); continue; }
      for (const b of arr) checkBlock(where, sc.ifs, sc.root, b); checked++;
    }
    // referências dentro de ${...}
    const exprs = JSON.stringify(j).match(/\$\{[^}]*\}/g) || [];
    for (const e of exprs) {
      for (const m of e.matchAll(/\bvar\.(\w+)/g)) if (!decl.var.has(m[1])) err(`${rel(f)}: var.${m[1]} não declarada`);
      for (const m of e.matchAll(/\blocal\.(\w+)/g)) if (!decl.local.has(m[1])) err(`${rel(f)}: local.${m[1]} não declarado`);
      for (const m of e.matchAll(/\bdata\.(\w+)\.(\w+)/g)) if (!decl.data.has(`${m[1]}.${m[2]}`)) err(`${rel(f)}: data.${m[1]}.${m[2]} não declarado`);
      for (const m of e.matchAll(/(?<![.\w])((?:aws|tls|random)_\w+)\.(\w+)/g)) if (!decl.res.has(`${m[1]}.${m[2]}`)) err(`${rel(f)}: recurso ${m[1]}.${m[2]} não declarado`);
      for (const m of e.matchAll(/\bmodule\.(\w+)\.(\w+)/g)) { const mod = decl.module.get(m[1]); if (!mod) { err(`${rel(f)}: module.${m[1]} não declarado`); continue; }
        const md = resolve(d, mod.source); const outs = new Set(); for (const { j: mj } of await load(md)) for (const o of Object.keys(mj.output || {})) outs.add(o);
        if (!outs.has(m[2])) err(`${rel(f)}: module.${m[1]}.${m[2]} — output não existe em ${mod.source}`); }
    }
  }
  // chamadas de módulo
  for (const [n, call] of decl.module) {
    const md = resolve(d, call.source); const vars = new Map();
    for (const { j: mj } of await load(md)) for (const [vn, va] of Object.entries(mj.variable || {})) vars.set(vn, va[0] && 'default' in va[0]);
    for (const k of Object.keys(call)) if (!['source', 'version', 'count', 'for_each', 'depends_on', 'providers'].includes(k) && !vars.has(k)) err(`${rel(d)}: module.${n} passa "${k}", que não é variável de ${call.source}`);
    for (const [vn, hasDefault] of vars) if (!hasDefault && !(vn in call)) err(`${rel(d)}: module.${n} não passa a variável obrigatória "${vn}"`);
  }
}
console.log(`${dirs.length} diretórios, ${checked} blocos de recurso/data conferidos no esquema (AWS ${req('@cdktf/provider-aws/package.json').cdktf.provider.version}, TLS ${req('@cdktf/provider-tls/package.json').cdktf.provider.version}, Random ${req('@cdktf/provider-random/package.json').cdktf.provider.version})`);
for (const e of errors) console.log('ERRO', e);
console.log(errors.length ? `${errors.length} erro(s)` : 'esquema OK');
process.exit(errors.length ? 1 : 0);
