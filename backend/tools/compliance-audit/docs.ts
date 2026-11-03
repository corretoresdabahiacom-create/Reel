#!/usr/bin/env tsx
/**
 * Gera docs/COMPLIANCE/MATRIX.md e docs/COMPLIANCE/ROPA.md a partir do código (JURISDICTIONS e ACTIVITIES) — documentação e sistema não divergem.
 *   tsx tools/compliance-audit/docs.ts [--check]   (--check falha se os arquivos estiverem defasados)
 * O ROPA do banco (`compliance_ropa`) é populado por `ropaService.autoPopulate()` a partir das MESMAS fontes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isMain } from '../lib/args.js';
import { JURISDICTIONS } from '../../src/modules/compliance/matrix.js';
import { ACTIVITIES } from '../../src/modules/compliance/ropa.js';

const esc = (s: string): string => s.replace(/\|/g, '/');
export function matrixMd(): string {
  return ['# Matriz de conformidade por jurisdição', '', '> GERADO por `tools/compliance-audit/docs.ts` a partir de `src/modules/compliance/matrix.ts` — não editar à mão. **Não é parecer jurídico**: obrigações e prazos devem ser validados por advogado local antes de operar no país. Status: `ready` = implementado e evidenciado; `in_progress` = parcial; `not_started` = mercado fora de escopo atual.', '',
    '| Código | Lei | Países | DSAR (dias) | Notificação de violação | Status | Responsável |', '|---|---|---|---|---|---|---|',
    ...JURISDICTIONS.map((j) => `| ${j.code} | ${esc(j.law)} | ${j.countries.join(', ')} | ${j.dsarDays} | ${esc(j.breachNotice)} | ${j.status} | ${j.owner} |`), '',
    ...JURISDICTIONS.flatMap((j) => [`## ${j.code} — ${j.law}`, '', ...j.obligations.map((o) => `- ${o}`), ...(j.evidence.length ? ['', `Evidências: ${j.evidence.join(', ')}`] : ['', 'Evidências: nenhuma ainda.']), ''])].join('\n');
}
export function ropaMd(): string {
  return ['# ROPA — Registro das operações de tratamento (LGPD art. 37 / GDPR art. 30)', '', '> GERADO de `ACTIVITIES` em `src/modules/compliance/ropa.ts`. A tabela `compliance_ropa` é preenchida automaticamente (`POST /admin/ops/compliance/ropa/refresh`, job semanal) e cruzada com o `information_schema`: tabelas com dados pessoais fora de qualquer atividade aparecem como pendência. Revisão anual obrigatória.', '',
    '| Atividade | Tabelas | Finalidade / base legal | Destinatários | Retenção | Jurisdições | Responsável |', '|---|---|---|---|---|---|---|',
    ...ACTIVITIES.map((a) => `| ${esc(a.activity)} | ${a.tables.join(', ')} | ${esc(a.purposeBasis)} | ${a.recipients.join(', ') || '—'} | ${esc(a.retention)} | ${a.jurisdiction.join(', ')} | ${a.owner} |`), ''].join('\n');
}
if (isMain(import.meta.url)) {
  const files: Array<[string, string]> = [['docs/COMPLIANCE/MATRIX.md', matrixMd()], ['docs/COMPLIANCE/ROPA.md', ropaMd()]];
  if (process.argv.includes('--check')) { const bad = files.filter(([f, c]) => !existsSync(f) || readFileSync(f, 'utf8') !== c).map(([f]) => f); if (bad.length) { console.error(`defasados: ${bad.join(', ')} (rode npm run compliance:docs)`); process.exit(1); } console.log('ok'); }
  else { mkdirSync('docs/COMPLIANCE', { recursive: true }); for (const [f, c] of files) { writeFileSync(f, c); console.log(f); } }
}
