#!/usr/bin/env tsx
/**
 * onboarding-checklist — gera o checklist datado de um novo integrante a partir de docs/ONBOARDING/CHECKLIST.md e VALIDA a meta "produtivo em < 1 semana"
 * (todos os itens obrigatórios têm dia ≤ 5 úteis; 1º PR até o dia 3; acesso ao on-call só como shadow até o dia 5).
 *   tsx tools/onboarding-checklist/index.ts validate
 *   tsx tools/onboarding-checklist/index.ts generate --name "Ana" --start 2026-11-03 --role backend [--out docs/ONBOARDING/people]
 * Formato do item: `- [ ] D<dia> [<papel|all>] texto` (dia útil 1..N).
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { arg, isMain } from '../lib/args.js';

export interface Item { day: number; roles: string[]; text: string }
export function parse(md: string): Item[] { return md.split('\n').flatMap((l) => { const m = l.match(/^- \[ \] D(\d+) \[([a-z,-]+)\] (.+)$/); return m ? [{ day: Number(m[1]), roles: m[2]!.split(','), text: m[3]! }] : []; }); }
export function addWorkdays(start: Date, n: number): Date { const d = new Date(start); let left = n - 1; while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) left--; } return d; }
export function validate(items: Item[]): string[] {
  const p: string[] = []; if (!items.length) p.push('checklist vazio');
  const late = items.filter((i) => i.day > 5); if (late.length) p.push(`itens após o dia 5 (meta < 1 semana): ${late.map((i) => `D${i.day} ${i.text}`).join('; ')}`);
  if (!items.some((i) => /primeiro PR/i.test(i.text) && i.day <= 3)) p.push('falta "primeiro PR" até o dia 3');
  if (!items.some((i) => /ambiente local|npm run|docker compose/i.test(i.text) && i.day <= 1)) p.push('falta subir o ambiente local no dia 1');
  if (!items.some((i) => /on-call.*shadow|shadow.*on-call/i.test(i.text))) p.push('falta shadow de on-call');
  return p;
}
export function generate(items: Item[], o: { name: string; start: string; role: string }): string {
  const s = new Date(`${o.start}T00:00:00Z`); const mine = items.filter((i) => i.roles.includes('all') || i.roles.includes(o.role)).sort((a, b) => a.day - b.day);
  return [`# Onboarding — ${o.name} (${o.role})`, '', `Início: ${o.start} · Meta: produtivo até ${addWorkdays(s, 5).toISOString().slice(0, 10)}`, '', ...mine.map((i) => `- [ ] ${addWorkdays(s, i.day).toISOString().slice(0, 10)} (D${i.day}) ${i.text}`), ''].join('\n');
}
function main(): void {
  const [cmd, ...a] = process.argv.slice(2); const items = parse(readFileSync('docs/ONBOARDING/CHECKLIST.md', 'utf8'));
  if (cmd === 'validate') { const p = validate(items); console.log(p.length ? p.join('\n') : `ok: ${items.length} itens, todos até o dia 5`); if (p.length) process.exitCode = 1; return; }
  if (cmd === 'generate') { const name = arg(a, 'name'), start = arg(a, 'start'); if (!name || !start) { console.error('informe --name e --start AAAA-MM-DD'); process.exitCode = 2; return; } const dir = arg(a, 'out') ?? 'docs/ONBOARDING/people'; mkdirSync(dir, { recursive: true }); const f = join(dir, `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`); writeFileSync(f, generate(items, { name, start, role: arg(a, 'role') ?? 'backend' })); console.log(f); return; }
  console.error('uso: validate | generate'); process.exitCode = 2;
}
if (isMain(import.meta.url)) main();
