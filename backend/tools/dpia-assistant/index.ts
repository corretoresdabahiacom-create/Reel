#!/usr/bin/env tsx
/**
 * dpia-assistant — rascunho de DPIA a partir de um fornecedor/jurisdição/tipo de dado (regras + redator LLM plugável). O rascunho NUNCA é aprovado automaticamente:
 * exige revisão humana (POST /admin/ops/compliance/dpia/:id/review).
 *   tsx tools/dpia-assistant/index.ts --kind ai_provider --name "Kling" --purpose "Geração de vídeo" --categories "foto,roteiro" [--countries CN] [--transfer] [--minors] [--save] [--out docs/COMPLIANCE/DPIA]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDraft, renderDpiaMarkdown, dpiaService, type DpiaSubject } from '../../src/modules/compliance/dpia.js';
import { arg, flag, isMain, run } from '../lib/cli.js';

async function main(): Promise<void> {
  const a = process.argv.slice(2); const kind = arg(a, 'kind') as DpiaSubject['kind'] | undefined; const name = arg(a, 'name'); const purpose = arg(a, 'purpose');
  if (!kind || !name || !purpose) throw new Error('uso: --kind ai_provider|subprocessor|jurisdiction|data_type --name X --purpose Y --categories a,b [--countries BR,US] [--transfer] [--minors] [--save]');
  const s: DpiaSubject = { kind, name, purpose, dataCategories: (arg(a, 'categories') ?? 'dados de uso').split(',').map((x) => x.trim()), countries: arg(a, 'countries')?.split(',').map((x) => x.trim().toUpperCase()), transferOutsideRegion: flag(a, 'transfer'), processesMinors: flag(a, 'minors'), dpaSigned: flag(a, 'dpa') };
  const draft = await buildDraft(s); const md = renderDpiaMarkdown(name, draft.content); const dir = arg(a, 'out') ?? 'docs/COMPLIANCE/DPIA'; mkdirSync(dir, { recursive: true });
  const f = join(dir, `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`); writeFileSync(f, `${md}\n\n> STATUS: RASCUNHO (${draft.generatedBy}) — aguarda revisão do DPO.\n`); console.log(`DPIA (rascunho) gravado em ${f}`);
  if (flag(a, 'save')) { const r = await dpiaService.create(null, s); console.log(`registrado no banco: ${r.id}`); }
}
if (isMain(import.meta.url)) await run(main);
