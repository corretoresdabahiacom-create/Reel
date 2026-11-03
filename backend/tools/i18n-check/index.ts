#!/usr/bin/env tsx
/**
 * i18n-check — (1) completude dos catálogos por locale (es-MX resolve para es), (2) renderização pseudolocalizada de todos os e-mails (verifica que placeholders sobrevivem e o texto ficou
 * delimitado), (3) detector de strings hardcoded voltadas ao usuário em src/ comparado a um BASELINE (falha só para strings NOVAS; o baseline é a dívida conhecida — ver docs/INTERNATIONALIZATION/MATRIX.md).
 *   tsx tools/i18n-check/index.ts check [--baseline tools/i18n-check/baseline.json]
 *   tsx tools/i18n-check/index.ts baseline          # regrava o baseline (use só ao pagar/aceitar dívida)
 *   tsx tools/i18n-check/index.ts pseudo "Olá ${name}"
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { T, catalogFor } from '../../src/modules/emails/email.service.js';
import { pseudoLocalize, isPseudo } from './pseudo.js';
import { arg, isMain } from '../lib/args.js';

export const LOCALES = ['pt-BR', 'en', 'es', 'es-MX'] as const;
const SAMPLE = { name: 'Ana', link: 'https://x.test/l', position: '7', date: '2026-01-01' };
export function catalogReport(): { missing: Array<{ locale: string; template: string }>; fellBack: Array<{ locale: string; template: string; to: string }>; pseudoProblems: string[] } {
  const all = new Set(Object.values(T).flatMap((c) => Object.keys(c))); const missing: Array<{ locale: string; template: string }> = []; const fellBack: Array<{ locale: string; template: string; to: string }> = []; const pseudoProblems: string[] = [];
  for (const l of LOCALES) for (const t of all) {
    const cat = catalogFor(l); if (!cat[t]) { missing.push({ locale: l, template: t }); continue; }
    if (!T[l]?.[t]) fellBack.push({ locale: l, template: t, to: T[l.split('-')[0]!]?.[t] ? l.split('-')[0]! : 'pt-BR' });
    const e = cat[t]!; const subj = pseudoLocalize(e.subject); const body = pseudoLocalize(e.body(SAMPLE)); if (!isPseudo(subj) || !isPseudo(body)) pseudoProblems.push(`${l}/${t}`);
    if (e.body(SAMPLE).includes('undefined') || e.body(SAMPLE).includes('${')) pseudoProblems.push(`${l}/${t}: placeholder não resolvido`);
  }
  return { missing, fellBack, pseudoProblems };
}
const WORD = /[A-Za-zÀ-ÿ]{3,}[ ][A-Za-zÀ-ÿ]{2,}/; const USER_FACING = /(?:new AppError\(\s*\d+\s*,\s*'[^']+'\s*,\s*|message:\s*|summary:\s*)(['"`])([^'"`]{12,}?)\1/g;
export function scanHardcoded(root = 'src'): string[] {
  const out: string[] = []; const walk = (d: string): void => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) { const txt = readFileSync(p, 'utf8'); for (const m of txt.matchAll(USER_FACING)) if (WORD.test(m[2]!)) out.push(`${p.replace(/\\/g, '/')}::${m[2]!.slice(0, 80)}`); } } }; walk(root); return [...new Set(out)].sort();
}
function main(): void {
  const [cmd, ...a] = process.argv.slice(2); const bf = arg(a, 'baseline') ?? 'tools/i18n-check/baseline.json';
  if (cmd === 'pseudo') { console.log(pseudoLocalize(a.join(' '))); return; }
  if (cmd === 'baseline') { const s = scanHardcoded(); writeFileSync(bf, JSON.stringify({ generatedAt: new Date().toISOString(), count: s.length, strings: s }, null, 1)); console.log(`baseline: ${s.length} strings`); return; }
  if (cmd === 'check') {
    const c = catalogReport(); const base: string[] = existsSync(bf) ? JSON.parse(readFileSync(bf, 'utf8')).strings : []; const now = scanHardcoded(); const fresh = now.filter((x) => !base.includes(x));
    console.log(JSON.stringify({ catalogMissing: c.missing, catalogFallbacks: c.fellBack.length, pseudoProblems: c.pseudoProblems, hardcodedTotal: now.length, hardcodedNewSinceBaseline: fresh }, null, 2));
    if (c.missing.length || c.pseudoProblems.length || fresh.length) process.exitCode = 1; return;
  }
  console.error('uso: check | baseline | pseudo "<texto>"'); process.exitCode = 2;
}
if (isMain(import.meta.url)) { main(); process.exit(process.exitCode ?? 0); }
