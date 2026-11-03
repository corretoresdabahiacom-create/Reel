// P0-1 etapa 1 — tipos do front GERADOS do contrato do backend (fonte única: backend docs/openapi.yaml).
//   node tools/api-types.mjs sync   → copia o openapi.yaml do backend para src/api/openapi.snapshot.yaml
//                                      (origem: $NEXUS_OPENAPI ou ../nexusreel-backend/docs/openapi.yaml)
//   node tools/api-types.mjs gen    → gera src/api/schema.d.ts a partir do snapshot
//   node tools/api-types.mjs check  → falha se schema.d.ts não bate com o snapshot; e, se o backend estiver
//                                      ao lado, falha se o snapshot estiver atrás do contrato atual
/* global process, console, URL */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import openapiTS, { astToString } from 'openapi-typescript';

const ROOT = resolve(import.meta.dirname, '..');
const SNAPSHOT = resolve(ROOT, 'src/api/openapi.snapshot.yaml');
const OUT = resolve(ROOT, 'src/api/schema.d.ts');
const SOURCE = resolve(process.env.NEXUS_OPENAPI ?? resolve(ROOT, '../nexusreel-backend/docs/openapi.yaml'));
const HEADER = '// GERADO por tools/api-types.mjs a partir de src/api/openapi.snapshot.yaml — NÃO EDITE À MÃO.\n// Atualize com: npm run api:sync && npm run api:types\n\n';

async function generate() {
  const ast = await openapiTS(new URL(`file://${SNAPSHOT}`), { alphabetize: true, immutable: false, exportType: false });
  return HEADER + astToString(ast);
}

const cmd = process.argv[2];
if (cmd === 'sync') {
  if (!existsSync(SOURCE)) { console.error(`contrato do backend não encontrado em ${SOURCE} (defina NEXUS_OPENAPI)`); process.exit(2); }
  copyFileSync(SOURCE, SNAPSHOT); console.log(`snapshot atualizado a partir de ${SOURCE}`);
} else if (cmd === 'gen') {
  writeFileSync(OUT, await generate()); console.log(`gerado ${OUT}`);
} else if (cmd === 'check') {
  const problems = [];
  if (!existsSync(OUT) || readFileSync(OUT, 'utf8') !== await generate()) problems.push('src/api/schema.d.ts desatualizado → npm run api:types');
  if (existsSync(SOURCE) && readFileSync(SOURCE, 'utf8') !== readFileSync(SNAPSHOT, 'utf8')) problems.push(`snapshot atrás do contrato do backend (${SOURCE}) → npm run api:sync && npm run api:types`);
  else if (!existsSync(SOURCE)) console.log('aviso: backend não está ao lado; conferi só snapshot × tipos gerados');
  if (problems.length) { for (const p of problems) console.error('✗ ' + p); process.exit(1); }
  console.log('tipos da API em dia');
} else { console.error('uso: sync | gen | check'); process.exit(2); }
