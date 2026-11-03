#!/usr/bin/env tsx
/** Gera docs/INTERNATIONALIZATION/MATRIX.md a partir de PROFILES (src/modules/i18n-deep/profile.ts) + jurisdições. `--check` falha se defasado. */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isMain } from '../lib/args.js';
import { PROFILES } from '../../src/modules/i18n-deep/profile.js';
import { residencyFor, jurisdictionFor } from '../../src/modules/compliance/matrix.js';

const esc = (s: string): string => s.replace(/\|/g, '/');
export function matrixMd(): string {
  const L = ['# Matriz de internacionalização', '', '> GERADO por `tools/i18n-check/docs.ts` de `src/modules/i18n-deep/profile.ts` (endpoint `GET /api/v1/i18n/profile?locale=es-MX&country=MX`). Perfis são **configuração a validar localmente** (jurídico, fiscal, pagamentos, parceiros) antes de lançar em cada país. Pacotes de música são **identificadores de pacotes a licenciar** — nenhuma música está incluída.', '',
    '| Idioma/país | Formatos de vídeo | Plataformas dominantes | Música (pacotes) | Pagamentos / imposto | Residência | DSAR | Suporte | Regulação de IA/dados |', '|---|---|---|---|---|---|---|---|---|'];
  for (const p of PROFILES) L.push(`| ${p.locale} / ${p.country} | ${esc(p.videoFormats.join('; '))} | ${p.dominantPlatforms.join(', ')} | ${p.musicPackIds.join(', ')} | ${p.payments.methods.join(', ')} · ${p.payments.currency} · ${esc(p.payments.taxName)}${p.payments.taxPct != null ? ` ${p.payments.taxPct}%` : ''} | ${residencyFor(p.country)} | ${jurisdictionFor(p.country)?.dsarDays ?? p.dsarDays ?? '—'} d | ${p.support.channels.join('/')} · 1ª resposta ${p.support.firstResponseSlaHours} h | ${esc(p.aiRegulation.join('; '))} |`);
  L.push('', '## Notas culturais', '', ...PROFILES.flatMap((p) => [`**${p.locale}/${p.country}**`, ...p.culturalNotes.map((n) => `- ${n}`), '']));
  L.push('## Países sem perfil dedicado', '', 'Herdam o perfil do idioma, mas com residência de dados e prazo de DSAR da jurisdição real do país (`resolveProfile`), e recebem a nota "revisar localmente". Países fora de qualquer jurisdição da matriz de compliance usam o padrão (residência US, DSAR 30 d).', '');
  return L.join('\n');
}
const f = 'docs/INTERNATIONALIZATION/MATRIX.md';
if (isMain(import.meta.url)) {
  if (process.argv.includes('--check')) { if (!existsSync(f) || readFileSync(f, 'utf8') !== matrixMd()) { console.error(`${f} defasado (npm run i18n:docs)`); process.exit(1); } console.log('ok'); } else { writeFileSync(f, matrixMd()); console.log(f); }
}
