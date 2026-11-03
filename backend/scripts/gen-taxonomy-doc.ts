/**
 * Gera docs/ANALYTICS_TAXONOMY.md a partir de src/modules/analytics/taxonomy.ts (fonte única).
 * `--check` falha se o arquivo commitado divergir (gate de CI; teste de paridade em tests/09-unit).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EVENTS, TAXONOMY_VERSION } from '../src/modules/analytics/taxonomy.js';

const COMMON = new Set(['locale', 'region', 'country', 'plan', 'utm_source', 'utm_medium', 'utm_campaign', 'experiment_key', 'variant', 'surface']);
export function renderTaxonomy(): string {
  const byCat = new Map<string, Array<[string, (typeof EVENTS)[string]]>>();
  for (const [name, def] of Object.entries(EVENTS)) { const l = byCat.get(def.category) ?? []; l.push([name, def]); byCat.set(def.category, l); }
  let out = `# Taxonomia de eventos de analytics — v${TAXONOMY_VERSION}\n\n`;
  out += '> **Gerado** por `npx tsx scripts/gen-taxonomy-doc.ts` a partir de `src/modules/analytics/taxonomy.ts`. Não edite à mão: o CI roda `--check`.\n\n';
  out += '## Regras\n';
  out += '- **Origem**: `client` = só pelo app (`POST /analytics/events`); `server` = só emitido pelo backend (um evento de servidor vindo do cliente é rejeitado); `both` = ambos.\n';
  out += '- **Desconhecidos** entram em quarentena (`schema_version` 0, fora dos marts). Em eventos conhecidos, propriedades fora do esquema são descartadas; tipo errado ou obrigatória ausente → rejeitado.\n';
  out += '- **PII proibida**: chaves como e-mail, telefone, CPF/CNPJ, nome, endereço, IP, token ou senha — e valores com formato de e-mail/CPF/telefone — fazem o evento ser rejeitado. O `user_id` é pseudonimizado (HMAC com `ANALYTICS_PSEUDO_SALT`) antes de sair para o warehouse.\n';
  out += '- **Consentimento**: sem consentimento ativo de métricas (`cookies`), o evento é gravado **sem** `user_id` (só conta no agregado). Eventos de servidor seguem a mesma regra, exceto quando o código força identificação para registro financeiro. O envio do app é *fire-and-forget* e nunca bloqueia a UI.\n';
  out += '- **Versionamento**: mudar nome, tipo ou obrigatoriedade = nova versão (`TAXONOMY_VERSION`), nunca edição retroativa.\n\n';
  out += `Propriedades comuns aceitas em todo evento: ${[...COMMON].map((c) => `\`${c}\``).join(', ')}.\n\n`;
  for (const [cat, list] of [...byCat.entries()].sort()) {
    out += `## ${cat}\n\n| Evento | Origem | Descrição | Propriedades específicas | Obrigatórias |\n|---|---|---|---|---|\n`;
    for (const [name, d] of list.sort((a, b) => a[0].localeCompare(b[0]))) {
      const own = Object.entries(d.props).filter(([k]) => !COMMON.has(k)).map(([k, t]) => `\`${k}\`:${t}`).join(', ') || '—';
      out += `| \`${name}\` | ${d.src} | ${d.desc} | ${own} | ${(d.required ?? []).map((r) => `\`${r}\``).join(', ') || '—'} |\n`;
    }
    out += '\n';
  }
  out += `Total: ${Object.keys(EVENTS).length} eventos.\n`;
  return out;
}

const target = fileURLToPath(new URL('../docs/ANALYTICS_TAXONOMY.md', import.meta.url));
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const md = renderTaxonomy();
  if (process.argv.includes('--check')) {
    if (!existsSync(target) || readFileSync(target, 'utf8') !== md) { console.error('docs/ANALYTICS_TAXONOMY.md desatualizado: rode npx tsx scripts/gen-taxonomy-doc.ts'); process.exit(1); }
    console.log('taxonomia ok');
  } else { writeFileSync(target, md); console.log('docs/ANALYTICS_TAXONOMY.md gerado'); }
}
