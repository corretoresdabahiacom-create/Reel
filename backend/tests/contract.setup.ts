/**
 * P0-1 etapa 2 — ao fim de cada arquivo de teste, toda resposta 2xx que divergiu do contrato (docs/openapi.yaml) faz o
 * arquivo falhar com a lista. Desligado só durante `npm run openapi:record` (que está justamente regravando o contrato).
 */
import { afterAll, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { enforcing, violations } from '../src/observability/contractEnforcer.js';

afterAll(() => {
  if (!enforcing) return;
  const uniq = [...new Map(violations.map((v) => [`${v.route} ${v.status} ${v.errors.join('|')}`, v])).values()];
  if (uniq.length && process.env.CONTRACT_REPORT) appendFileSync(process.env.CONTRACT_REPORT, uniq.map((v) => JSON.stringify(v)).join('\n') + '\n');
  violations.length = 0;
  expect(uniq.map((v) => `${v.route} [${v.status}] ${v.errors.join('; ')}`), 'respostas fora do contrato (docs/openapi.yaml)').toEqual([]);
});
