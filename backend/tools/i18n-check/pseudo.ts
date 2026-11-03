/** Pseudolocalização: acentua vogais, expande ~35% e delimita com ⟦ ⟧ preservando placeholders (${x}, {x}, %s). Texto SEM delimitadores na UI = string hardcoded fora do catálogo. */
const MAP: Record<string, string> = { a: 'á', e: 'é', i: 'í', o: 'ö', u: 'ü', A: 'Å', E: 'Ë', I: 'Ï', O: 'Ø', U: 'Û', c: 'ç', n: 'ñ' };
export function pseudoLocalize(s: string): string {
  const parts = s.split(/(\$\{[^}]*\}|\{[^}]*\}|%[sd]|https?:\/\/\S+)/g); let out = '';
  for (const [i, p] of parts.entries()) out += i % 2 === 1 ? p : [...p].map((ch) => MAP[ch] ?? ch).join('');
  const pad = '~'.repeat(Math.ceil(s.replace(/\$\{[^}]*\}|\{[^}]*\}/g, '').length * 0.35)); return `⟦${out}${pad}⟧`;
}
export const isPseudo = (s: string): boolean => s.startsWith('⟦') && s.endsWith('⟧');
