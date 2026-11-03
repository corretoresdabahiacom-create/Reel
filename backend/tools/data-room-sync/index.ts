#!/usr/bin/env tsx
/**
 * data-room-sync — mantém docs/DATA_ROOM/ (due diligence) sincronizado com a documentação viva do repositório (docs-as-code, fonte única).
 *   sync   → copia cada item do manifest (docs/DATA_ROOM/manifest.json) para sua pasta, grava sha256 e regenera INDEX.md
 *   check  → falha (exit 1) se faltar item OBRIGATÓRIO com fonte no repo, se a cópia estiver desatualizada ou se uma pasta obrigatória não existir.
 *            Itens `source: null` (ex.: demonstrações auditadas, cap table) são listados como "EXTERNO PENDENTE" — nunca fabricados.
 * Pastas obrigatórias: Corporate, Financials, Product, Technology, Legal, Compliance, People, Customers, Partners.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { isMain } from '../lib/args.js';

export const FOLDERS = ['Corporate', 'Financials', 'Product', 'Technology', 'Legal', 'Compliance', 'People', 'Customers', 'Partners'] as const;
export interface Item { folder: (typeof FOLDERS)[number]; title: string; source: string | null; owner: string; required: boolean; note?: string }
const ROOT = 'docs/DATA_ROOM'; const sha = (f: string): string => createHash('sha256').update(readFileSync(f)).digest('hex');
export const loadManifest = (root = ROOT): Item[] => JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')).items;
const dest = (i: Item, root: string): string => join(root, i.folder, i.source ? basename(i.source) : '');
export function check(items: Item[], root = ROOT): { missingFolders: string[]; missingSources: string[]; stale: string[]; externalPending: string[] } {
  const missingFolders = FOLDERS.filter((f) => !items.some((i) => i.folder === f)).map(String); const missingSources: string[] = []; const stale: string[] = []; const externalPending: string[] = [];
  for (const i of items) {
    if (!i.source) { if (i.required) externalPending.push(`${i.folder}/${i.title} (${i.owner})`); continue; }
    if (!existsSync(i.source)) { if (i.required) missingSources.push(`${i.folder}/${i.title} → ${i.source}`); continue; }
    const d = dest(i, root); if (!existsSync(d) || sha(d) !== sha(i.source)) stale.push(`${i.folder}/${basename(i.source)}`);
  }
  return { missingFolders, missingSources, stale, externalPending };
}
export function sync(items: Item[], root = ROOT): string {
  const rows: string[] = ['# Data room — índice', '', `Gerado por tools/data-room-sync em ${new Date().toISOString().slice(0, 10)}. Cada arquivo é cópia do documento vivo do repositório (fonte única); não editar aqui.`, '', '| Pasta | Documento | Responsável | Situação | sha256 (8) |', '|---|---|---|---|---|'];
  for (const f of FOLDERS) mkdirSync(join(root, f), { recursive: true });
  for (const i of items) {
    if (!i.source) { rows.push(`| ${i.folder} | ${i.title} | ${i.owner} | **EXTERNO PENDENTE**${i.note ? ` — ${i.note}` : ''} | – |`); continue; }
    if (!existsSync(i.source)) { rows.push(`| ${i.folder} | ${i.title} | ${i.owner} | **AUSENTE** (${i.source}) | – |`); continue; }
    copyFileSync(i.source, dest(i, root)); rows.push(`| ${i.folder} | [${i.title}](${i.folder}/${basename(i.source)}) | ${i.owner} | ok | ${sha(i.source).slice(0, 8)} |`);
  }
  writeFileSync(join(root, 'INDEX.md'), rows.join('\n') + '\n'); return join(root, 'INDEX.md');
}
function main(): void {
  const cmd = process.argv[2]; const items = loadManifest();
  if (cmd === 'sync') { console.log(`índice: ${sync(items)}`); const r = check(items); if (r.externalPending.length) console.log(`externo pendente (${r.externalPending.length}):\n- ${r.externalPending.join('\n- ')}`); return; }
  if (cmd === 'check') { const r = check(items); console.log(JSON.stringify(r, null, 2)); if (r.missingFolders.length || r.missingSources.length || r.stale.length) process.exitCode = 1; return; }
  console.error('uso: sync | check'); process.exitCode = 2;
}
if (isMain(import.meta.url)) main();
