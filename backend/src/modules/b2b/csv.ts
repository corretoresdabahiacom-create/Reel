/** Parser CSV RFC 4180 mínimo (aspas, vírgula/; como separador, CRLF) + sanitização contra CSV/formula injection. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, ''); const first = t.split(/\r?\n/, 1)[0] ?? ''; const sep = (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let q = false;
  for (let i = 0; i < t.length; i++) { const c = t[i]!;
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"' && cell === '') q = true; else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cell += c; }
  if (cell !== '' || row.length) { row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row); }
  return rows;
}
/** Neutraliza células que o Excel/Sheets interpretariam como fórmula (=,+,-,@, TAB, CR). */
export const sanitizeCell = (s: string): string => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
