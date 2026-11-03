#!/usr/bin/env tsx
/**
 * finops-report — relatório mensal de FinOps em Markdown (custos unitários, margem, top-10 projetos mais caros, top-10 oportunidades).
 *   tsx tools/finops-report/index.ts [--month 2026-09] [--out docs/FINOPS/reports]
 * Números "assumed" (sem custo importado) são marcados como tal — nunca apresentados como medidos.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { finopsService, monthRange } from '../../src/modules/finops/finops.service.js';
import { arg, isMain, run } from '../lib/cli.js';

const fmt = (c: unknown): string => (c == null ? 'n/d' : `R$ ${(Number(c) / 100).toFixed(2)}`);
export async function buildReport(month?: string): Promise<string> {
  const r = monthRange(month); const label = r.from.toISOString().slice(0, 7);
  const [ue, gm, top, opp] = await Promise.all([finopsService.unitEconomics(r), finopsService.grossMargin(r), finopsService.topProjects(r, 10), finopsService.opportunities(r)]);
  const L: string[] = [`# Relatório FinOps — ${label}`, '', `> Gerado em ${new Date().toISOString()} por tools/finops-report. Valores sem custo importado são ESTIMATIVAS (campo \`source\`).`, '', '## Custos unitários', '', '```json', JSON.stringify(ue, null, 2), '```', '', '## Margem bruta por segmento', '', '```json', JSON.stringify(gm, null, 2), '```', '', '## Top-10 projetos mais caros (IA)', '', '| # | Projeto | Plano | Chamadas | Custo |', '|---|---|---|---|---|'];
  top.forEach((p, i) => L.push(`| ${i + 1} | ${String(p.title ?? p.projectId).replace(/\|/g, '/')} | ${p.plan} | ${p.aiCalls} | ${fmt(p.costCents)} |`));
  if (!top.length) L.push('| – | (sem uso de IA no período) | | | |');
  L.push('', '## Top-10 oportunidades de otimização', '', '```json', JSON.stringify(opp, null, 2), '```', '');
  return L.join('\n');
}
async function main(): Promise<void> {
  const a = process.argv.slice(2); const md = await buildReport(arg(a, 'month')); const dir = arg(a, 'out') ?? 'docs/FINOPS/reports'; mkdirSync(dir, { recursive: true });
  const f = join(dir, `${arg(a, 'month') ?? new Date().toISOString().slice(0, 7)}.md`); writeFileSync(f, md); console.log(`relatório gravado em ${f}`);
}
if (isMain(import.meta.url)) await run(main);
