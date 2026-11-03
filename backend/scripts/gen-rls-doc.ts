/**
 * Gera docs/SECURITY_RLS.md a partir do código (inventário de escalonamentos de RLS). `--check` falha se o doc estiver
 * desatualizado (CI). Fontes: PUBLIC_ROUTE_DB_SCOPE (src/db/context.ts), chamadas `systemScope('motivo', …)` e
 * `asSystem(` em src/, e as migrations com políticas (0002, 0004, 0007).
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PUBLIC_ROUTE_DB_SCOPE } from '../src/db/context.js';

const OUT = 'docs/SECURITY_RLS.md';
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
const files = walk('src').filter((f) => !f.startsWith(join('src', 'db')));
const scopes: Array<{ file: string; reason: string }> = []; const asSys = new Map<string, number>();
for (const f of files) {
  const s = readFileSync(f, 'utf8'); const rel = relative('.', f);
  for (const m of s.matchAll(/systemScope\('([^']+)'/g)) scopes.push({ file: rel, reason: m[1]! });
  const n = (s.match(/\basSystem\(/g) ?? []).length; if (n) asSys.set(rel, n);
}
const pub = Object.entries(PUBLIC_ROUTE_DB_SCOPE).sort(([a], [b]) => a.localeCompare(b));
const row = (cells: string[]) => `| ${cells.join(' | ')} |`;
const doc = `# RLS e escalonamentos — inventário (gerado)

> **Gerado** por \`npx tsx scripts/gen-rls-doc.ts\` a partir do código. Não edite à mão: o CI roda \`--check\`.
> Teste de garantia: \`tests/21-rls-hardening.test.ts\` (e \`tests/20-idor-exposure.test.ts\` na camada HTTP).

## Modelo
- **Papel:** toda conexão da aplicação assume \`nexus_app\` (\`DB_APP_ROLE\`), que **não** é dono das tabelas, então o RLS vale para todas as consultas. A troca de papel é **fail-closed**: se o \`SET ROLE\` falhar, a consulta não roda (\`src/db/pool.ts\`). Em produção, \`DB_APP_ROLE\` vazio impede o boot.
- **Contexto por requisição** (\`src/db/context.ts\`), aplicado em cada checkout de conexão: \`app.user_id\`, \`app.is_admin\` e \`app.system\`.
  - Requisição sem login começa **anônima** (sem usuário e sem bypass).
  - \`authenticate()\` troca para o usuário; \`requireAdmin\` troca para admin.
  - Workers, jobs e CLIs rodam como \`system\`.
- **Policies** (migrations 0002, 0004 e 0007):
  - **Dono:** \`user_id\`/\`owner_id\` = usuário, ou herança do pai (cenas, itens de catálogo, versões, logs, jobs de publicação, cliques/conversões).
  - **Leitura pública por policy:** templates aprovados e avaliações. Perfis públicos de terceiros só pela view \`user_public_profiles\` (\`id\`, \`name\`, \`creator_verified\`).
  - **Trilhas** (\`audit_logs\`, \`webhook_events\`, \`analytics_events\`): qualquer contexto grava, só admin/system lê.
  - **Dados internos** (incidentes, waitlist, parceiros, board, DPIA, FinOps, SLO etc.): só admin/system.
  - **Configuração** (preços, flags, settings, experimentos, campanhas): leitura pela app; escrita só admin/system.
  - **Colaboração** (0017 + 0021): membros aceitos LEEM timeline, histórico e comentários; só dono/editor ESCREVEM na timeline (\`collab_can_edit\`); \`timeline_ops\` é só acréscimo em nome próprio; comentário só em nome próprio, texto só o autor muda (trigger \`comments_guard\`), apagar = autor ou dono; convites/colaboradores só o dono. Teste: \`tests/35-rls-collab-reaudit.test.ts\`.
  - **Cobertura:** todas as tabelas do schema público têm RLS. A exceção é \`schema_migrations\`, que é do migrador — a role da aplicação não tem nenhum privilégio nela (0021).

## Rotas públicas (sem autenticação obrigatória) — ${pub.length}
${row(['Rota', 'Escopo', 'Motivo'])}
${row(['---', '---', '---'])}
${pub.map(([k, v]) => row([`\`${k}\``, v.scope === 'system' ? '**system**' : 'anon', v.reason])).join('\n')}

## Escalonamentos pontuais em código (\`systemScope\`) — ${scopes.length}
${row(['Onde', 'Motivo'])}
${row(['---', '---'])}
${scopes.map((x) => row([`\`${x.file}\``, x.reason])).join('\n')}

## Transações como system (\`asSystem\`) — ${[...asSys.values()].reduce((a, b) => a + b, 0)} chamadas em ${asSys.size} arquivos
Usadas por workers (geração, dublagem, publicação), por movimentação financeira entre contas (compra de template credita o criador, indicação credita os dois lados, webhooks de pagamento) e por jobs de manutenção. A regra: o handler valida antes quem pode pedir a operação (dono do recurso, assinatura do webhook, admin) e só então escala.
${row(['Arquivo', 'Chamadas'])}
${row(['---', '---'])}
${[...asSys.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([f, n]) => row([`\`${f}\``, String(n)])).join('\n')}

## Como adicionar
1. **Tabela nova com dado de usuário:** coloque a policy na mesma migration. O teste 21 falha se alguma tabela ficar sem RLS.
2. **Rota pública nova:** classifique-a em \`PUBLIC_ROUTE_DB_SCOPE\`. O teste 21 falha se alguma rota pública do OpenAPI não estiver classificada.
3. **Leitura legítima entre usuários numa rota autenticada:** use \`systemScope('motivo', …)\` ou \`asSystem\`, devolva só agregados ou campos públicos e rode \`npm run rls:docs\`.
`;
if (process.argv.includes('--check')) {
  const cur = (() => { try { return readFileSync(OUT, 'utf8'); } catch { return ''; } })();
  if (cur !== doc) { console.error(`${OUT} desatualizado — rode: npm run rls:docs`); process.exit(1); }
  console.log('inventário RLS ok'); process.exit(0);
}
writeFileSync(OUT, doc); console.log(`${OUT} gerado`); process.exit(0);
