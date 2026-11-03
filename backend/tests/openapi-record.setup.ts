/**
 * P0-1 etapa 1b — só carregado com OPENAPI_RECORD=1 (vitest.config.ts). Ao fim de CADA arquivo de teste, junta o que o
 * gravador de contrato viu (schemas zod de entrada → JSON Schema; formato das respostas) em `.openapi-record/observed.json`.
 * O globalSetup move o resultado para `docs/openapi-observed.json` no fim da suíte.
 */
import { afterAll } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { routes, merge, type Shape } from '../src/observability/contractRecorder.js';

const FILE = '.openapi-record/observed.json';
type Out = Record<string, { body?: unknown; query?: unknown; responses: Record<string, Shape> }>;
const toJson = (s: Parameters<typeof zodToJsonSchema>[0]) => { const j = zodToJsonSchema(s, { $refStrategy: 'none', target: 'jsonSchema7' }) as Record<string, unknown>; delete j.$schema; return j; };

afterAll(() => {
  mkdirSync('.openapi-record', { recursive: true });
  const out: Out = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {};
  for (const [k, r] of routes) {
    const o = (out[k] ??= { responses: {} });
    if (r.body && !o.body) o.body = toJson(r.body);
    if (r.query && !o.query) o.query = toJson(r.query);
    for (const [st, sh] of Object.entries(r.responses)) o.responses[st] = o.responses[st] ? merge(o.responses[st]!, sh) : sh;
  }
  writeFileSync(FILE, JSON.stringify(out));
});
