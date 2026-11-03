#!/usr/bin/env tsx
/**
 * contract-generator — preenche os modelos de docs/legal/*.md com variáveis e FALHA se sobrar `{{variável}}` sem valor (nunca emite contrato incompleto).
 *   tsx tools/contract-generator/index.ts list
 *   tsx tools/contract-generator/index.ts vars DPA
 *   tsx tools/contract-generator/index.ts generate DPA --vars vars.json [--out docs/legal/generated/acme-dpa.md]
 * Saída leva cabeçalho "MINUTA — não assinar sem revisão jurídica". Substituição por mapa estático: valores NÃO são interpretados como template (sem injeção).
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { arg, isMain } from '../lib/args.js';

const DIR = 'docs/legal'; const RE = /\{\{\s*([a-z0-9_]+)\s*\}\}/g;
export const templates = (dir = DIR): string[] => readdirSync(dir).filter((f) => f.endsWith('.md') && /^[A-Z_]+\.md$/.test(f)).map((f) => f.replace('.md', ''));
export const variables = (tpl: string): string[] => [...new Set([...tpl.matchAll(RE)].map((m) => m[1]!))];
export function fill(tpl: string, vars: Record<string, string | number>): string {
  const missing = variables(tpl).filter((k) => vars[k] === undefined || String(vars[k]).trim() === ''); if (missing.length) throw new Error(`variáveis ausentes: ${missing.join(', ')}`);
  return tpl.replace(RE, (_m, k: string) => String(vars[k]).replace(/[\r\n]+/g, ' '));
}
export const generate = (name: string, vars: Record<string, string | number>, dir = DIR): string => `> **MINUTA GERADA AUTOMATICAMENTE — não assinar sem revisão jurídica.** Gerada em ${new Date().toISOString().slice(0, 10)}.\n\n${fill(readFileSync(join(dir, `${name}.md`), 'utf8'), vars)}`;
function main(): void {
  const [cmd, name, ...a] = process.argv.slice(2);
  if (cmd === 'list') { console.log(templates().join('\n')); return; }
  if (!name || !templates().includes(name)) { console.error(`modelo inválido. Opções: ${templates().join(', ')}`); process.exitCode = 2; return; }
  if (cmd === 'vars') { console.log(variables(readFileSync(join(DIR, `${name}.md`), 'utf8')).join('\n')); return; }
  if (cmd === 'generate') { const vf = arg(a, 'vars'); if (!vf) { console.error('informe --vars arquivo.json'); process.exitCode = 2; return; } const out = arg(a, 'out') ?? join(DIR, 'generated', `${name.toLowerCase()}-${Date.now()}.md`); const md = generate(name, JSON.parse(readFileSync(vf, 'utf8'))); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, md); console.log(out); return; }
  console.error('uso: list | vars <modelo> | generate <modelo> --vars f.json'); process.exitCode = 2;
}
if (isMain(import.meta.url)) { try { main(); } catch (e) { console.error((e as Error).message); process.exitCode = 1; } }
