/** Parser de CSV do catálogo B2B. Colunas: nome, descricao, preco, categoria, fotos (separadas por |), sku. Aceita , ou ; e campos entre aspas. */
export const CATEGORIES = ['Eletrônicos', 'Moda', 'Casa e Decoração', 'Esportes e Lazer', 'Veículos', 'Beleza'] as const;
export interface ParsedItem { name: string; description: string; price: number; category: string; sku: string; photoUrls: string[] }
export interface RowIssue { line: number; message: string }
export interface ParseResult { items: ParsedItem[]; errors: RowIssue[]; warnings: RowIssue[] }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const ALIASES: Record<string, string> = { nome: 'name', produto: 'name', descricao: 'description', preco: 'price', valor: 'price', categoria: 'category', fotos: 'photos', foto: 'photos', imagens: 'photos', sku: 'sku', codigo: 'sku' };
const CAT_SYN: Record<string, string> = { eletronicos: 'Eletrônicos', eletronico: 'Eletrônicos', moda: 'Moda', roupas: 'Moda', casa: 'Casa e Decoração', 'casa e decoracao': 'Casa e Decoração', esportes: 'Esportes e Lazer', 'esportes e lazer': 'Esportes e Lazer', veiculos: 'Veículos', automotivo: 'Veículos', beleza: 'Beleza' };

/** "R$ 1.299,90" → 1299.9 | "49.90" → 49.9 | "1,5" → 1.5. Retorna NaN se inválido. */
export function parsePrice(raw: string): number {
  let s = raw.replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  if (s.includes(',') && s.includes('.')) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (s.includes(',')) s = s.replace(',', '.');
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
export function splitCsv(text: string): string[][] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}
export function parseCatalogCsv(text: string, maxRows = 500): ParseResult {
  const out: ParseResult = { items: [], errors: [], warnings: [] };
  const rows = splitCsv(text.replace(/^﻿/, ''));
  if (rows.length === 0) { out.errors.push({ line: 1, message: 'Arquivo vazio.' }); return out; }
  const cols = rows[0].map((h) => ALIASES[norm(h).replace(/\[\]$/, '')] ?? norm(h));
  for (const req of ['name', 'price']) if (!cols.includes(req)) out.errors.push({ line: 1, message: `Coluna obrigatória ausente: ${req === 'name' ? 'nome' : 'preco'}.` });
  if (out.errors.length) return out;
  if (rows.length - 1 > maxRows) out.errors.push({ line: 1, message: `Máximo de ${maxRows} produtos por catálogo.` });
  const seen = new Set<string>();
  rows.slice(1, maxRows + 1).forEach((r, i) => {
    const line = i + 2; const g = (k: string) => (r[cols.indexOf(k)] ?? '').trim();
    const name = g('name'); const price = parsePrice(g('price')); let sku = g('sku');
    if (!name) { out.errors.push({ line, message: 'Nome vazio.' }); return; }
    if (!(price > 0)) { out.errors.push({ line, message: `Preço inválido: "${g('price')}".` }); return; }
    if (!sku) { sku = 'SKU-' + String(i + 1).padStart(3, '0'); out.warnings.push({ line, message: `SKU vazio; gerado ${sku}.` }); }
    if (seen.has(sku)) { out.errors.push({ line, message: `SKU duplicado: ${sku}.` }); return; }
    seen.add(sku);
    const rawCat = g('category'); const cat = CAT_SYN[norm(rawCat)];
    if (!cat) out.warnings.push({ line, message: `Categoria "${rawCat}" desconhecida; usando ${CATEGORIES[0]}.` });
    out.items.push({ name, description: g('description'), price, category: cat ?? CATEGORIES[0], sku, photoUrls: g('photos').split('|').map((x) => x.trim()).filter(Boolean) });
  });
  return out;
}
