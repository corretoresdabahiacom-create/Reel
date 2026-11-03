#!/usr/bin/env tsx
/**
 * slo-generator — gera regras Prometheus (recording + alertas multi-janela) e dashboards Grafana a partir de slo/*.slo.yaml.
 *   tsx tools/slo-generator/index.ts generate [--dir slo] [--rules infra/observability/slo-rules.generated.yml] [--dashboards dashboards/sre]
 *   tsx tools/slo-generator/index.ts check                       # falha (exit 1) se os artefatos gerados estão desatualizados (use no CI)
 *   tsx tools/slo-generator/index.ts new --service foo --name availability --objective 99.9 [--sli-type availability] [--owner backend]
 *   tsx tools/slo-generator/index.ts new --interactive           # perguntas no terminal
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseSpec, generateRules, type SloSpec } from '../../src/modules/sre/spec.js';
import { buildDashboards } from '../lib/grafana.js';

export function loadSpecs(dir: string): SloSpec[] { return readdirSync(dir).filter((f) => f.endsWith('.slo.yaml')).sort().map((f) => parseSpec(readFileSync(join(dir, f), 'utf8'))); }
export function render(specs: SloSpec[]): { rules: string; dashboards: Record<string, string> } {
  return { rules: `# GERADO por tools/slo-generator a partir de slo/*.slo.yaml — NÃO editar à mão (npm run slo:generate).\ngroups:\n` + specs.map(generateRules).join(''), dashboards: Object.fromEntries(Object.entries(buildDashboards(specs)).map(([k, v]) => [k, JSON.stringify(v, null, 2) + '\n'])) };
}
export function template(o: { service: string; name: string; objective: number; sliType?: string; owner?: string; description?: string }): string {
  return `version: "prometheus/v1"\nservice: ${o.service}\nlabels: { owner: ${o.owner ?? 'backend'}, team: ${o.owner ?? 'backend'} }\nslos:\n  - name: ${o.name}\n    objective: ${o.objective}\n    sliType: ${o.sliType ?? 'availability'}\n    description: "${o.description ?? `${o.service}/${o.name} — descreva o SLI e a janela`}"\n    sli:\n      events:\n        error_query: 'sum(rate(<METRICA_DE_ERRO>[{{.window}}]))'\n        total_query: 'sum(rate(<METRICA_TOTAL>[{{.window}}]))'\n`;
}
const arg = (a: string[], k: string) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : undefined; };
async function main(): Promise<void> {
  const [cmd, ...a] = process.argv.slice(2); const dir = arg(a, 'dir') ?? 'slo'; const rulesOut = arg(a, 'rules') ?? 'infra/observability/slo-rules.generated.yml'; const dashOut = arg(a, 'dashboards') ?? 'dashboards/sre';
  if (cmd === 'generate' || cmd === 'check') {
    const specs = loadSpecs(dir); const r = render(specs);
    if (cmd === 'generate') { mkdirSync(dashOut, { recursive: true }); writeFileSync(rulesOut, r.rules); for (const [f, c] of Object.entries(r.dashboards)) writeFileSync(join(dashOut, f), c); console.log(`${specs.reduce((n, s) => n + s.slos.length, 0)} SLOs → ${rulesOut} + ${Object.keys(r.dashboards).length} dashboards`); return; }
    const stale = [rulesOut, ...Object.keys(r.dashboards).map((f) => join(dashOut, f))].filter((f, i) => !existsSync(f) || readFileSync(f, 'utf8') !== (i === 0 ? r.rules : r.dashboards[f.split('/').pop()!])); if (stale.length) { console.error('desatualizado:', stale.join(', ')); process.exit(1); } console.log('artefatos SLO em dia'); return;
  }
  if (cmd === 'new') {
    let o = { service: arg(a, 'service') ?? '', name: arg(a, 'name') ?? '', objective: Number(arg(a, 'objective') ?? 99.9), sliType: arg(a, 'sli-type'), owner: arg(a, 'owner'), description: arg(a, 'description') };
    if (a.includes('--interactive')) { const rl = createInterface({ input: process.stdin, output: process.stdout }); o = { ...o, service: await rl.question('Serviço: '), name: await rl.question('Nome do SLO: '), objective: Number(await rl.question('Objetivo % (ex. 99.9): ')), owner: await rl.question('Time dono: ') }; rl.close(); }
    if (!o.service || !o.name || !(o.objective > 0 && o.objective < 100)) { console.error('informe --service, --name e --objective (0-100) ou --interactive'); process.exit(2); }
    const f = join(dir, `${o.service}.slo.yaml`); if (existsSync(f)) { console.error(`${f} já existe: edite o arquivo para adicionar o SLO`); process.exit(2); } writeFileSync(f, template(o)); console.log(`criado ${f} — preencha as queries e rode generate`); return;
  }
  console.error('uso: generate | check | new'); process.exit(2);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
