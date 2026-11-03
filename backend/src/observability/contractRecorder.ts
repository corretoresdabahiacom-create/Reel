/**
 * P0-1 etapa 1b — gravador de CONTRATO, ligado só com `OPENAPI_RECORD=1` (nunca em produção: `NODE_ENV=production` desliga).
 *
 * Durante a suíte de testes:
 *  - entrada: cada `parse(schema, req.body | req.query)` registra o schema zod que a rota REALMENTE usa para validar
 *    (casado por identidade do objeto — nenhuma rota muda);
 *  - saída: cada resposta JSON 2xx tem o FORMATO inferido (tipos e chaves; nenhum valor é guardado — sem PII, sem token).
 * `scripts/openapi-record-flush.ts` converte o zod em JSON Schema e grava `docs/openapi-observed.json`, que o gerador do
 * OpenAPI usa onde não há schema escrito à mão.
 */
import type { ZodTypeAny } from 'zod';

export type Shape = { type?: string | string[]; format?: string; properties?: Record<string, Shape>; required?: string[]; items?: Shape; additionalProperties?: Shape | boolean };
interface RouteRec { body?: ZodTypeAny; query?: ZodTypeAny; responses: Record<string, Shape> }

export const recording = process.env.OPENAPI_RECORD === '1' && process.env.NODE_ENV !== 'production';
const parsed = new WeakMap<object, ZodTypeAny>();
export const routes = new Map<string, RouteRec>();

/** Chamado por `parse()`: lembra qual schema validou este objeto. */
export function noteParse(schema: ZodTypeAny, data: unknown): void { if (recording && data && typeof data === 'object' && !parsed.has(data)) parsed.set(data, schema); }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
/** Chave que parece dado (id, data, e-mail, número) → o objeto é um mapa, não um registro com campos fixos. */
const dataKey = (k: string) => UUID.test(k) || /^\d/.test(k) || k.includes('@') || /^\d{4}-\d{2}/.test(k) || /(?=[0-9a-f]*\d)[0-9a-f]{6,}/i.test(k); // …ou sufixo aleatório (exp_9806322a)

export function infer(v: unknown, depth = 0): Shape {
  if (v === null) return { type: 'null' };
  if (Array.isArray(v)) { let items: Shape | undefined; for (const x of v.slice(0, 50)) items = items ? merge(items, infer(x, depth + 1)) : infer(x, depth + 1); return items ? { type: 'array', items } : { type: 'array' }; }
  switch (typeof v) {
    case 'string': return UUID.test(v) ? { type: 'string', format: 'uuid' } : DT.test(v) ? { type: 'string', format: 'date-time' } : { type: 'string' };
    case 'number': return { type: Number.isInteger(v) ? 'integer' : 'number' };
    case 'boolean': return { type: 'boolean' };
    case 'object': {
      if (depth > 8) return { type: 'object' };
      const keys = Object.keys(v as object);
      if (keys.length > 40 || keys.some(dataKey)) { let ap: Shape | undefined; for (const k of keys.slice(0, 50)) { const s = infer((v as Record<string, unknown>)[k], depth + 1); ap = ap ? merge(ap, s) : s; } return { type: 'object', additionalProperties: ap ?? true }; }
      const properties: Record<string, Shape> = {}; for (const k of keys.sort()) properties[k] = infer((v as Record<string, unknown>)[k], depth + 1);
      return { type: 'object', properties, required: keys.filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort() };
    }
    default: return {};
  }
}
const types = (s: Shape) => (s.type === undefined ? [] : ([] as string[]).concat(s.type));
/** Une dois formatos observados: campo ausente numa amostra vira opcional; tipos diferentes viram lista; integer ⊂ number. */
export function merge(a: Shape, b: Shape): Shape {
  let t = [...new Set([...types(a), ...types(b)])]; if (t.includes('number')) t = t.filter((x) => x !== 'integer');
  const out: Shape = {}; if (t.length) out.type = t.length === 1 ? t[0] : t.sort();
  if (a.format && a.format === b.format) out.format = a.format; else if (a.format && !types(b).includes('string')) out.format = a.format; else if (b.format && !types(a).includes('string')) out.format = b.format;
  if (a.properties || b.properties) {
    const keys = [...new Set([...Object.keys(a.properties ?? {}), ...Object.keys(b.properties ?? {})])].sort(); out.properties = {};
    for (const k of keys) { const x = a.properties?.[k], y = b.properties?.[k]; out.properties[k] = x && y ? merge(x, y) : (x ?? y)!; }
    const ra = a.properties ? new Set(a.required ?? []) : null, rb = b.properties ? new Set(b.required ?? []) : null;
    out.required = keys.filter((k) => (ra ? ra.has(k) : true) && (rb ? rb.has(k) : true));
  }
  if (a.items || b.items) out.items = a.items && b.items ? merge(a.items, b.items) : (a.items ?? b.items);
  if (a.additionalProperties || b.additionalProperties) {
    const x = a.additionalProperties, y = b.additionalProperties;
    out.additionalProperties = typeof x === 'object' && typeof y === 'object' ? merge(x, y) : (typeof x === 'object' ? x : typeof y === 'object' ? y : true);
  }
  return out;
}

/** Chamado no onSend (só com `recording`): casa body/query com o schema que os validou e infere a resposta. */
export function noteExchange(method: string, url: string | undefined, req: { body?: unknown; query?: unknown }, status: number, contentType: string | undefined, payload: unknown): void {
  if (!recording || !url) return;
  const key = `${method} ${url.replace(/:(\w+)/g, '{$1}')}`; const rec = routes.get(key) ?? { responses: {} }; routes.set(key, rec);
  if (req.body && typeof req.body === 'object' && parsed.has(req.body)) rec.body ??= parsed.get(req.body);
  if (req.query && typeof req.query === 'object' && parsed.has(req.query)) rec.query ??= parsed.get(req.query);
  if (status >= 200 && status < 300 && contentType?.includes('application/json') && typeof payload === 'string' && payload.length < 5_000_000) {
    try { const s = infer(JSON.parse(payload)); rec.responses[String(status)] = rec.responses[String(status)] ? merge(rec.responses[String(status)]!, s) : s; } catch { /* corpo não-JSON */ }
  }
}

/**
 * Fim da gravação: os NOMES de campo vêm desta execução (campo que sumiu do código sai do contrato); os TIPOS unem esta
 * execução com o contrato anterior (um campo que noutra execução veio null continua anulável — sem "vai e volta").
 */
export function refresh(base: Shape | undefined, cur: Shape): Shape {
  if (!base) return cur;
  const t = [...new Set([...types(base), ...types(cur)])].filter((x, _, a) => !(x === 'integer' && a.includes('number')));
  const out: Shape = { ...(t.length ? { type: t.length === 1 ? t[0] : t.sort() } : {}) };
  if (cur.format && (!base.format || base.format === cur.format)) out.format = cur.format;
  if (cur.properties) {
    out.properties = Object.fromEntries(Object.keys(cur.properties).sort().map((k) => [k, refresh(base.properties?.[k], cur.properties![k]!)]));
    out.required = (cur.required ?? []).filter((k) => !base.properties || !base.properties[k] || (base.required ?? []).includes(k));
  }
  if (cur.items) out.items = refresh(base.items, cur.items);
  if (cur.additionalProperties) out.additionalProperties = typeof cur.additionalProperties === 'object' ? refresh(typeof base.additionalProperties === 'object' ? base.additionalProperties : undefined, cur.additionalProperties) : cur.additionalProperties;
  return out;
}
