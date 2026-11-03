import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { infer, merge, recording } from '../src/observability/contractRecorder.js';
import { enforcing, checkResponse, violations } from '../src/observability/contractEnforcer.js';
import { extract } from '../scripts/gen-response-types.js';
import { generate } from '../scripts/gen-openapi.js';
import { generateDbTypes } from '../scripts/gen-db-types.js';
import { typeQueries } from '../scripts/type-queries.js';

/**
 * P0-1 etapa 1b — o contrato descreve os CORPOS, não só as rotas. Catraca: a cobertura de schemas nunca diminui
 * (`docs/openapi-coverage.json`); o contrato observado guarda só formato (nenhum valor de teste, e-mail ou id vaza).
 */
type Op = { requestBody?: { content?: Record<string, { schema?: Record<string, unknown> }> }; responses?: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }> };
const spec = YAML.parse(readFileSync('docs/openapi.yaml', 'utf8')) as { paths: Record<string, Record<string, Op>> };
const ops = Object.values(spec.paths).flatMap((p) => Object.entries(p).filter(([m]) => ['get', 'post', 'put', 'patch', 'delete'].includes(m)).map(([m, o]) => ({ m, o })));
const useful = (s?: Record<string, unknown>) => !!s && (!!s.$ref || !!s.properties || !!s.items || !!s.additionalProperties || (s.type !== undefined && s.type !== 'object'));
const typedRes = ops.filter(({ o }) => Object.entries(o.responses ?? {}).some(([k, r]) => k.startsWith('2') && useful(r.content?.['application/json']?.schema))).length;
const withBody = ops.filter(({ o }) => o.requestBody).length;

describe('P0-1 1b — contrato com schemas', () => {
  it('catraca: respostas tipadas e corpos de entrada documentados não diminuem', () => {
    const min = JSON.parse(readFileSync('docs/openapi-coverage.json', 'utf8')) as { typedResponses: number; requestBodies: number };
    expect(typedRes, `respostas 2xx tipadas: ${typedRes}/${ops.length}`).toBeGreaterThanOrEqual(min.typedResponses);
    expect(withBody, `operações com corpo de entrada: ${withBody}`).toBeGreaterThanOrEqual(min.requestBodies);
  });
  it('contrato observado só tem FORMATO: nenhuma chave parece e-mail, id ou data; nenhum exemplo/valor guardado', () => {
    const raw = readFileSync('docs/openapi-observed.json', 'utf8');
    expect(raw).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i); // nenhum e-mail
    expect(raw).not.toMatch(/"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"\s*:/i); // nenhum id como chave
    expect(raw).not.toMatch(/"(example|examples)"\s*:/);
    expect(raw).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\./); // nenhum JWT
  });
  it('inferência: campo ausente vira opcional; integer+number = number; mapa por id vira additionalProperties; sem valores', () => {
    const a = infer({ id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed', n: 1, at: '2026-10-21T10:00:00.000Z', name: 'Ana' });
    const b = infer({ id: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b', n: 1.5, at: '2026-10-21T10:00:00Z' });
    const m = merge(a, b);
    expect(m.required).toEqual(['at', 'id', 'n']); expect(m.properties?.n?.type).toBe('number'); expect(m.properties?.id?.format).toBe('uuid'); expect(m.properties?.at?.format).toBe('date-time');
    expect(JSON.stringify(m)).not.toContain('Ana');
    const map = infer({ '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed': { ok: true }, '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b': { ok: false } });
    expect(map.properties).toBeUndefined(); expect(map.additionalProperties).toEqual({ type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] });
    expect(merge(infer(null), infer('x')).type).toEqual(['null', 'string']);
    expect(infer({ exp_9806322a: { v: 'a' } }).additionalProperties).toBeTruthy(); // chave com sufixo aleatório = mapa (diff estável)
    expect(infer({ sha256: 'x', createdAt: 'y' }).properties).toBeTruthy(); // campos normais continuam campos
  });
  it('gravador desligado fora do modo de gravação (produção nunca grava)', () => {
    if (process.env.OPENAPI_RECORD !== '1') expect(recording).toBe(false);
  });
});

describe('P0-1 etapa 2 — contrato garantido', () => {
  it('src/db/rows.generated.ts bate com o schema do banco migrado (tipos das linhas usados nas consultas)', async () => {
    expect(readFileSync('src/db/rows.generated.ts', 'utf8') === await generateDbTypes(process.env.DATABASE_URL!), 'rode: npx tsx scripts/gen-db-types.ts').toBe(true);
  });
  it('docs/openapi-static.json bate com os tipos atuais do código (tipos de resposta gerados do TypeScript)', () => {
    const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort((v as Record<string, unknown>)[k])])) : v;
    expect(JSON.parse(readFileSync('docs/openapi-static.json', 'utf8')), 'rode: npx tsx scripts/gen-response-types.ts && npm run openapi').toEqual(sort(extract().routes));
  }, 120_000);
  it('docs/openapi.yaml é exatamente o que o gerador produz agora (ninguém edita à mão, ninguém esquece de regenerar)', async () => {
    const r = await generate(); expect(r.missing).toEqual([]); expect(r.stale).toEqual([]);
    expect(r.yaml === readFileSync('docs/openapi.yaml', 'utf8'), 'docs/openapi.yaml defasado → npm run openapi').toBe(true);
  }, 120_000);
  it('API em camelCase: nenhum campo de resposta em snake_case (exceto catálogos de códigos de erro/motivo, que são dados)', () => {
    const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/; const DATA_MAPS = new Set(['messages', 'suppressed']); const bad: string[] = [];
    const walk = (s: unknown, route: string, parent: string) => {
      if (!s || typeof s !== 'object') return; const o = s as Record<string, unknown>;
      for (const [k, v] of Object.entries((o.properties ?? {}) as Record<string, unknown>)) { if (SNAKE.test(k) && !DATA_MAPS.has(parent)) bad.push(`${route} ${parent}.${k}`); walk(v, route, k); }
      for (const k of ['items', 'additionalProperties']) walk(o[k], route, parent);
      for (const k of ['anyOf', 'oneOf', 'allOf']) for (const x of (o[k] as unknown[] | undefined) ?? []) walk(x, route, parent);
    };
    for (const [p, ops] of Object.entries(spec.paths)) for (const [m, op] of Object.entries(ops)) for (const r of Object.values(op.responses ?? {})) walk(r.content?.['application/json']?.schema, `${m.toUpperCase()} ${p}`, '$');
    expect(bad).toEqual([]);
  });
  it('o validador PEGA divergência: tipo errado, campo a mais em tipo fechado e status não documentado', async () => {
    if (!enforcing) return;
    const before = violations.length;
    await checkResponse('GET', '/api/v1/users/me/consents', 200, 'application/json', JSON.stringify({ version: 1, items: [] })); // version deveria ser string
    await checkResponse('GET', '/api/v1/series/:seriesId', 200, 'application/json', JSON.stringify({ intruso: true }));
    await checkResponse('GET', '/api/v1/users/me', 299, 'application/json', '{}');
    const got = violations.splice(before); // não deixa estas violações propositais reprovarem o arquivo
    expect(got.map((v) => v.route)).toEqual(['GET /users/me/consents', 'GET /series/{seriesId}', 'GET /users/me']);
    expect(got[0]!.errors.join(' ')).toMatch(/version must be string/); expect(got[2]!.errors[0]).toMatch(/não documentado/);
  });
  it('consultas novas: o número de consultas que DEVOLVEM linhas sem tipo não pode crescer (rode scripts/type-queries.ts)', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && !p.endsWith('rows.generated.ts') ? [p] : []; });
    let n = 0; const RE = /\b(pool|db|readPool)\.query\((`|')/g;
    for (const f of walk('src')) { const s = readFileSync(f, 'utf8'); for (const m of s.matchAll(RE)) { const end = s.indexOf(m[2]!, m.index! + m[0].length); const sql = s.slice(m.index! + m[0].length, end); if (/^\s*(SELECT|WITH)\b/i.test(sql) || /\bRETURNING\b/i.test(sql)) n++; } }
    const max = (JSON.parse(readFileSync('docs/openapi-coverage.json', 'utf8')) as { untypedResultQueries: number }).untypedResultQueries;
    expect(n, `consultas sem tipo: ${n} (máximo ${max}). Tipe com: DATABASE_URL=<banco migrado> npx tsx scripts/type-queries.ts --write`).toBeLessThanOrEqual(max);
  });
  it('consultas novas não entram sem tipo: nada que o tipador consiga tipar ficou sem tipo (rode scripts/type-queries.ts --write)', async () => {
    const r = await typeQueries(process.env.DATABASE_URL!, false); expect(r.failed).toEqual([]); expect(r.typed).toBe(0);
  }, 120_000);
  it('o validador de contrato está ligado na suíte (fora da gravação) e nunca em produção', () => {
    if (process.env.OPENAPI_RECORD !== '1') expect(enforcing).toBe(true);
  });
});
