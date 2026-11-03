#!/usr/bin/env tsx
/**
 * postmortem-generator — gera o rascunho de postmortem (linha do tempo + métricas MTTD/MTTA/MTTR + ações) de um incidente e grava em docs/POSTMORTEMS/.
 *   tsx tools/postmortem-generator/index.ts --id <uuid> [--out docs/POSTMORTEMS] [--external timeline.json]
 * `--external` aceita [{at, source, text}] (deploys, alertas) para compor a linha do tempo. Causa raiz e 5 porquês continuam com revisão humana (prazo: 5 dias úteis, Sev1).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { incidentsService } from '../../src/modules/incidents/incidents.service.js';
import { arg, isMain, run } from '../lib/cli.js';

async function main(): Promise<void> {
  const a = process.argv.slice(2); const id = arg(a, 'id'); if (!id) throw new Error('informe --id <incidente>');
  const ext = arg(a, 'external'); const external = ext ? JSON.parse(readFileSync(ext, 'utf8')) : [];
  const p = await incidentsService.createPostmortemDraft(id, external); const dir = arg(a, 'out') ?? 'docs/POSTMORTEMS'; mkdirSync(dir, { recursive: true }); const f = join(dir, `${id}.md`);
  writeFileSync(f, p.markdown); console.log(`postmortem (rascunho) em ${f}${p.reviewDueAt ? ` — revisão devida até ${new Date(p.reviewDueAt).toISOString().slice(0, 10)}` : ''}`);
}
if (isMain(import.meta.url)) await run(main);
