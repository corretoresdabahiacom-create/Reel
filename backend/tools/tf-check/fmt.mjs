// Uso: node tools/tf-check/fmt.mjs [--write] <arquivos .tf>. Mesmo motor do `tofu fmt` (hclwrite.Format da HashiCorp, compilado para wasm): imprime os arquivos fora do padrão.
/* global process, console */
import { format } from '@cdktf/hcl-tools';
import { readFileSync, writeFileSync } from 'node:fs';
let bad = 0; const fix = process.argv.includes('--write');
for (const f of process.argv.slice(2).filter((x) => x !== '--write')) {
  const src = readFileSync(f, 'utf8'); const out = await format(src);
  if (out !== src) { bad++; console.log('FORA DO PADRÃO', f); if (fix) writeFileSync(f, out); } else console.log('ok', f);
}
process.exit(bad && !fix ? 1 : 0);
