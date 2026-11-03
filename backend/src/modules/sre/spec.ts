/** Formato .slo.yaml (compatível com o schema do Sloth "prometheus/v1") + gerador de regras de gravação e alertas multi-janela. */
import { parse } from 'yaml';
export interface SloSpec { version: string; service: string; labels?: Record<string, string>; slos: Array<{ name: string; objective: number; description?: string; sliType?: string; windowDays?: number; sli: { events: { error_query: string; total_query: string } }; alerting?: { page?: Record<string, unknown>; ticket?: Record<string, unknown> } }> }
export const SLI_WINDOWS = ['5m', '30m', '1h', '2h', '6h', '1d', '3d', '30d'] as const;
export function parseSpec(text: string): SloSpec {
  const s = parse(text) as SloSpec; if (!s || s.version !== 'prometheus/v1' || !s.service || !Array.isArray(s.slos) || !s.slos.length) throw new Error('spec .slo.yaml inválida');
  for (const x of s.slos) { if (!(x.objective > 0 && x.objective < 100)) throw new Error(`${s.service}/${x.name}: objective deve estar em (0,100)`); if (!x.sli?.events?.error_query || !x.sli.events.total_query) throw new Error(`${s.service}/${x.name}: sli.events.{error_query,total_query} obrigatórios`); }
  return s;
}
export const sloId = (spec: SloSpec, name: string) => `${spec.service}-${name}`;
const q = (tpl: string, w: string) => tpl.replaceAll('{{.window}}', w).trim();
const lbl = (spec: SloSpec, name: string) => `sloth_service="${spec.service}", sloth_slo="${name}"`; // seletor PromQL
const yl = (spec: SloSpec, name: string) => `sloth_service: "${spec.service}", sloth_slo: "${name}"`; // labels YAML
export function generateRules(spec: SloSpec): string {
  const out: string[] = [`  # origem: slo/${spec.service}.slo.yaml`];
  for (const s of spec.slos) {
    const L = lbl(spec, s.name); const Y = yl(spec, s.name); const err = 1 - s.objective / 100; const owner = spec.labels?.owner ?? 'sre';
    out.push(`  - name: slo-sli-${spec.service}-${s.name}`, '    rules:');
    for (const w of SLI_WINDOWS) out.push(`      - record: slo:sli_error:ratio_rate${w}`, `        expr: |`, `          (${q(s.sli.events.error_query, w)}) / (${q(s.sli.events.total_query, w)})`, `        labels: { ${Y} }`);
    out.push(`  - name: slo-meta-${spec.service}-${s.name}`, '    rules:',
      `      - record: slo:objective:ratio`, `        expr: vector(${s.objective / 100})`, `        labels: { ${Y} }`,
      `      - record: slo:error_budget:ratio`, `        expr: vector(${+err.toFixed(6)})`, `        labels: { ${Y} }`,
      `      - record: slo:period_burn_rate:ratio`, `        expr: slo:sli_error:ratio_rate30d{${L}} / slo:error_budget:ratio{${L}}`, `        labels: { ${Y} }`,
      `      - record: slo:period_error_budget_remaining:ratio`, `        expr: 1 - slo:period_burn_rate:ratio{${L}}`, `        labels: { ${Y} }`);
    out.push(`  - name: slo-alerts-${spec.service}-${s.name}`, '    rules:');
    const rules: Array<[string, string, string, number, string]> = [['1h', '5m', 'page', 14.4, 'Orçamento de erro consumido 14,4x mais rápido (1h/5m)'], ['6h', '30m', 'page', 6, 'Orçamento consumido 6x mais rápido (6h/30m)'], ['3d', '6h', 'ticket', 1, 'Orçamento consumido acima do ritmo (3d/6h)']];
    for (const [lw, sw, sev, thr, msg] of rules) out.push(`      - alert: SLOBurnRate_${spec.service}_${s.name.replace(/\W/g, '_')}_${lw}`,
      `        expr: |`, `          slo:sli_error:ratio_rate${lw}{${L}} > (${thr} * ${+err.toFixed(6)})`, `          and`, `          slo:sli_error:ratio_rate${sw}{${L}} > (${thr} * ${+err.toFixed(6)})`,
      `        labels: { severity: ${sev}, owner: "${owner}", ${Y} }`, `        annotations: { summary: "${spec.service}/${s.name}: ${msg}", runbook: "docs/SRE/SLOs.md#${spec.service}", dashboard: "dashboards/sre/slo-burn-rate.json" }`);
  }
  return out.join('\n') + '\n';
}
export function specToDefinitions(spec: SloSpec) { return spec.slos.map((s) => ({ id: sloId(spec, s.name), service: spec.service, sliType: s.sliType ?? 'availability', target: s.objective / 100, windowDays: s.windowDays ?? 30, description: s.description ?? s.name, owner: spec.labels?.owner ?? 'sre' })); }
