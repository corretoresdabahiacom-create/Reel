/**
 * P0-1 etapa 2 — o contrato é GARANTIDO, não só descrito. Com `CONTRACT_ENFORCE=1` (ligado em toda a suíte de testes,
 * nunca em produção), cada resposta JSON 2xx é validada contra o schema do `docs/openapi.yaml` para aquela rota.
 * Divergência (campo a mais onde o tipo é fechado, tipo errado, obrigatório ausente) vira uma violação registrada;
 * `tests/contract.setup.ts` faz o arquivo de teste falhar listando todas.
 */
import { readFileSync } from 'node:fs';

export const enforcing = process.env.CONTRACT_ENFORCE === '1' && process.env.NODE_ENV !== 'production';
export interface Violation { route: string; status: number; errors: string[] }
export const violations: Violation[] = [];

type Validate = ((d: unknown) => boolean) & { errors?: Array<{ instancePath: string; message?: string; params?: unknown }> | null };
let validators: Map<string, Validate> | null = null;

/** Carrega o spec e compila um validador por (método, rota, status). Só roda quando `enforcing`. */
async function load(): Promise<Map<string, Validate>> {
  const [{ default: Ajv2020 }, { parse }] = await Promise.all([import('ajv/dist/2020.js'), import('yaml')]);
  const spec = parse(readFileSync('docs/openapi.yaml', 'utf8')) as { paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> }>>; components?: { schemas?: Record<string, unknown> } };
  const toDefs = (v: unknown): unknown => Array.isArray(v) ? v.map(toDefs) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !k.startsWith('x-')).map(([k, x]) => [k, k === '$ref' && typeof x === 'string' ? x.replace('#/components/schemas/', '#/$defs/') : toDefs(x)])) : v;
  const ajv = new (Ajv2020 as unknown as new (o: object) => { compile: (s: unknown) => Validate })({ strict: false, allErrors: true, validateFormats: false });
  const $defs = toDefs(spec.components?.schemas ?? {});
  const m = new Map<string, Validate>();
  for (const [path, ops] of Object.entries(spec.paths)) for (const [method, op] of Object.entries(ops)) for (const [st, r] of Object.entries(op.responses ?? {})) {
    const schema = r.content?.['application/json']?.schema; if (!st.startsWith('2') || !schema) continue;
    m.set(`${method.toUpperCase()} ${path} ${st}`, ajv.compile({ ...(toDefs(schema) as object), $defs }));
  }
  return m;
}

/** `/__probe/*` são rotas registradas só pelos testes de RLS (tests/21), fora da API. */
export async function checkResponse(method: string, url: string | undefined, status: number, contentType: string | undefined, payload: unknown): Promise<void> {
  if (!enforcing || !url || /\/__probe\//.test(url) || status < 200 || status >= 300 || !contentType?.includes('application/json') || typeof payload !== 'string') return;
  validators ??= await load();
  const path = url.replace(/:(\w+)/g, '{$1}').replace(/^\/api\/v1(?=\/)/, '');
  const v = validators.get(`${method} ${path} ${status}`) ?? validators.get(`${method} ${url.replace(/:(\w+)/g, '{$1}')} ${status}`);
  const route = `${method} ${path}`;
  if (!v) { violations.push({ route, status, errors: [`status ${status} não documentado no contrato`] }); return; }
  let body: unknown; try { body = JSON.parse(payload); } catch { return; }
  if (!v(body)) violations.push({ route, status, errors: (v.errors ?? []).slice(0, 8).map((e) => `${e.instancePath || '/'} ${e.message ?? ''} ${e.params ? JSON.stringify(e.params) : ''}`.trim()) });
}
