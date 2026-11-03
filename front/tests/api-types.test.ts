import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** P0-1 etapa 1 — os tipos do front são gerados do contrato do backend e não podem divergir dele. */
test('api:types:check — schema.d.ts gerado bate com o snapshot do OpenAPI (e o snapshot com o backend, se presente)', () => {
  const out = execFileSync('node', ['tools/api-types.mjs', 'check'], { encoding: 'utf8' });
  assert.match(out, /tipos da API em dia/);
});
test('todas as rotas do snapshot viraram tipos (nenhuma perdida na geração)', () => {
  const yaml = readFileSync('src/api/openapi.snapshot.yaml', 'utf8'); const dts = readFileSync('src/api/schema.d.ts', 'utf8');
  const inYaml = [...yaml.matchAll(/^ {2}(\/[^:\s]*):\s*$/gm)].map((m) => m[1]!);
  assert.ok(inYaml.length > 300, `esperava >300 rotas, achei ${inYaml.length}`);
  const missing = inYaml.filter((p) => !dts.includes(`"${p}": {`));
  assert.deepEqual(missing, []);
});
test('o arquivo gerado é marcado como gerado (ninguém edita à mão)', () => {
  assert.match(readFileSync('src/api/schema.d.ts', 'utf8').split('\n')[0]!, /^\/\/ GERADO por tools\/api-types\.mjs/);
});
