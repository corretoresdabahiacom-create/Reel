import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import YAML from 'yaml';
import { buildApp } from '../src/app.js';
import { META, ROOT, type Meta } from './openapi-meta.js';

export async function liveRoutes(): Promise<Set<string>> {
  const set = new Set<string>(); const app = await buildApp({ bullBoard: false, onRoute: (r) => { for (const m of ([] as string[]).concat(r.method)) { if (m === 'HEAD' || m === 'OPTIONS') continue; const u = r.url.replace(/:(\w+)/g, '{$1}').replace(/\*$/, '{path}'); set.add(`${m} ${u}`); } } });
  await app.ready(); await app.close(); return set;
}
const str = { type: 'string' } as const; const int = { type: 'integer' } as const; const uuid = { type: 'string', format: 'uuid' } as const; const dt = { type: 'string', format: 'date-time' } as const;
const ref = (n: string) => ({ $ref: `#/components/schemas/${n}` });
const strN = { type: ['string', 'null'] } as const; const numN = { type: ['number', 'null'] } as const; // anuláveis (P0-1 etapa 2: o validador de contrato achou null real)
const schemas: Record<string, unknown> = {
  Error: { type: 'object', required: ['code', 'message'], properties: { code: str, message: str, details: {}, traceId: str } },
  User: { type: 'object', properties: { id: uuid, email: str, name: str, locale: { enum: ['pt-BR', 'en', 'es', 'es-MX'] }, region: str, plan: { enum: ['free', 'pro', 'business'] }, credits: int, affiliateBalanceCents: int, marketplaceBalanceCents: int, isAdmin: { type: 'boolean' } } },
  AuthResponse: { type: 'object', properties: { user: ref('User'), accessToken: str, refreshToken: { type: 'string', description: 'Ausente no modo cookie (`X-Session-Mode: cookie`): o refresh vai no cookie httpOnly `nx_rt`' }, csrfToken: { type: 'string', description: 'Só no modo cookie: enviar em `X-CSRF-Token` no refresh/logout' }, expiresIn: int } },
  RegisterRequest: { type: 'object', required: ['email', 'name'], properties: { email: { type: 'string', format: 'email' }, password: { type: 'string', minLength: 10 }, name: str, locale: { enum: ['pt-BR', 'en', 'es'] }, birthDate: { type: 'string', format: 'date' }, guardianConsent: { type: 'boolean' } } },
  LoginRequest: { type: 'object', required: ['email', 'password'], properties: { email: str, password: str, totp: { type: 'string', minLength: 6, maxLength: 6 } } },
  RefreshRequest: { type: 'object', properties: { refreshToken: { type: 'string', description: 'Omitido no modo cookie (usa `nx_rt` + cabeçalho `X-CSRF-Token`)' } } }, OAuthRequest: { type: 'object', required: ['code'], properties: { code: str, redirectUri: str, locale: str } },
  UserPatch: { type: 'object', additionalProperties: false, properties: { name: str, locale: str, region: { enum: ['LATAM', 'EU', 'US'] } } },
  ProjectCreate: { type: 'object', required: ['title'], properties: { title: str, script: { type: 'string', maxLength: 4000 }, locale: str, category: str, templateId: uuid, photos: { type: 'array', maxItems: 5, items: { type: 'string', description: 'ref devolvida por PUT /uploads/photo' } } } },
  Scene: { type: 'object', properties: { id: uuid, index: int, text: str, prompt: str, durationSec: int, status: { enum: ['pending', 'generating', 'done', 'error'] }, videoUrl: strN, lastFrameUrl: strN, consistency: numN, retried: { type: 'boolean' } } },
  Project: { type: 'object', properties: { id: uuid, title: str, script: str, status: { enum: ['draft', 'generating', 'ready', 'failed'] }, scenes: { type: 'array', items: ref('Scene') }, finalVideoUrl: { type: ['string', 'null'], description: 'URL assinada' }, createdAt: dt } },
  PublicationCreate: { type: 'object', required: ['projectId', 'targets'], properties: { projectId: uuid, targets: { type: 'array', minItems: 1, maxItems: 7, items: { type: 'object', required: ['platform'], properties: { platform: { enum: ['tiktok', 'youtube', 'instagram', 'shopee', 'temu', 'olx', 'mercadolivre'] }, locale: str, metadata: { type: 'object', properties: { title: str, caption: str, hashtags: { type: 'array', items: str }, visibility: str, listingId: str, price: { type: 'number' }, affiliate: { type: 'boolean' } } } } } } } },
  Publication: { type: 'object', properties: { id: uuid, projectId: uuid, platform: str, status: { enum: ['pending', 'uploading', 'processing', 'published', 'failed'] }, externalUrl: strN, error: strN, retryCount: int, progress: { type: 'number' }, stage: str } },
  PublicationBatch: { type: 'object', properties: { publications: { type: 'array', items: ref('Publication') } } },
  TemplateInput: { type: 'object', required: ['name', 'priceCredits', 'sceneStructure'], properties: { name: { type: 'string', minLength: 3, maxLength: 80 }, description: str, category: str, tags: { type: 'array', items: str }, priceCredits: { type: 'integer', minimum: 0, maximum: 500 }, sceneStructure: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'object' } }, promptHints: { type: 'array', items: str } } },
  Template: { type: 'object', properties: { id: uuid, name: str, priceCredits: int, status: { enum: ['draft', 'pending', 'approved', 'rejected'] }, ratingAvg: { type: 'number' }, ratingCount: int, usageCount: int, owned: { type: 'boolean' } } },
  SignedDownload: { type: 'object', required: ['url', 'expiresInSec'], additionalProperties: false, properties: { url: { type: 'string', description: 'URL assinada (5 min)' }, expiresInSec: int } },
  BatchJob: { type: 'object', properties: { id: uuid, type: { enum: ['generation', 'publication'] }, totalItems: int, completedItems: int, failedItems: int, status: { enum: ['queued', 'running', 'completed', 'partial', 'failed', 'cancelled'] } } },
};
/**
 * Resposta, em ordem de confiança: (1) `res` escrito à mão; (2) tipo ESTÁTICO do handler (docs/openapi-static.json, gerado do
 * TypeScript — garantido pelo compilador); trechos que o código não tipa (`any`) são preenchidos com (3) o formato OBSERVADO
 * na suíte. Nos testes, toda resposta 2xx é validada contra o resultado (contractEnforcer), então nenhuma das fontes pode mentir.
 */
type StaticE = { schema: Record<string, unknown>; unknown: number; binary?: boolean };
const STATIC: Record<string, StaticE> = existsSync('docs/openapi-static.json') ? JSON.parse(readFileSync('docs/openapi-static.json', 'utf8')) : {};
const isEmpty = (o: unknown) => !!o && typeof o === 'object' && !Array.isArray(o) && Object.keys(o as object).length === 0;
/** Completa os buracos (`{}`) do tipo estático com o observado no mesmo caminho. */
function fill(st: unknown, ob: unknown): unknown {
  if (isEmpty(st)) return ob && !isEmpty(ob) ? { ...(clean(ob) as object), 'x-schema-source': 'observed' } : {};
  if (!st || typeof st !== 'object' || Array.isArray(st)) return st;
  const S = st as Record<string, unknown>; const O = (ob && typeof ob === 'object' ? ob : {}) as Record<string, unknown>; const out: Record<string, unknown> = { ...S };
  if (S.properties) { const op = (O.properties ?? {}) as Record<string, unknown>; out.properties = Object.fromEntries(Object.entries(S.properties as Record<string, unknown>).map(([k, v]) => [k, fill(v, op[k])])); }
  if (S.items) out.items = fill(S.items, O.items);
  if (S.additionalProperties && typeof S.additionalProperties === 'object') out.additionalProperties = fill(S.additionalProperties, O.additionalProperties);
  if (Array.isArray(S.anyOf)) { const objLike = O.properties || O.items ? O : undefined; out.anyOf = (S.anyOf as unknown[]).map((x) => fill(x, (x as { type?: string }).type === 'object' || (x as { type?: string }).type === 'array' ? objLike : undefined)); }
  return out;
}
function responseSchema(key: string, obs: Obs | undefined, status: number): Record<string, unknown> {
  const ob = obs?.responses[String(status)] ?? Object.entries(obs?.responses ?? {}).find(([k]) => k.startsWith('2'))?.[1];
  const st = STATIC[key];
  if (st && !st.binary && !isEmpty(st.schema)) return { ...(fill(st.schema, ob) as object), 'x-schema-source': st.unknown === 0 ? 'typescript' : 'typescript+observed' };
  return ob ? { ...(clean(ob) as object), 'x-schema-source': 'observed' } : { type: 'object' };
}
const auths: Record<string, unknown[]> = { public: [], user: [{ bearerAuth: [] }], admin: [{ bearerAuth: [] }], apikey: [{ bearerAuth: [] }, { apiKey: [] }], signature: [] };
/**
 * P0-1 etapa 1b — contrato observado (`npm run openapi:record`): schema zod REAL de entrada de cada rota e formato das
 * respostas visto na suíte. Usado só onde não há schema escrito à mão (`req`/`res` em openapi-meta.ts), marcado com
 * `x-schema-source` ("zod" = exato; "observed" = inferido das respostas dos testes, sem valores).
 */
type Obs = { body?: Record<string, unknown>; query?: { properties?: Record<string, Record<string, unknown>>; required?: string[] }; responses: Record<string, unknown> };
const OBSERVED: Record<string, Obs> = existsSync('docs/openapi-observed.json') ? JSON.parse(readFileSync('docs/openapi-observed.json', 'utf8')) : {};
/** Campo visto só como null não diz o tipo real → desconhecido (não gera `null` falso no front). */
const clean = (v: unknown): unknown => { if (Array.isArray(v)) return v.map(clean); if (!v || typeof v !== 'object') return v; const o = v as Record<string, unknown>; if (o.type === 'null' && Object.keys(o).length === 1) return {}; return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, k === 'required' || k === 'enum' ? x : clean(x)])); };
function op(key: string, m: Meta, params: string[], obs?: Obs) {
  const [method, path] = key.split(' ') as [string, string]; const status = m.status ?? 200; const responses: Record<string, unknown> = {};
  responses[String(status)] = status === 204 || status === 302 ? { description: status === 302 ? 'Redirecionamento' : 'Sem conteúdo' } : { description: 'Sucesso', content: { 'application/json': { schema: m.res ? ref(m.res) : responseSchema(key, obs, status) } } };
  for (const a of m.alt ?? []) responses[String(a)] = { description: 'Sucesso (alternativo)', content: { 'application/json': { schema: m.res ? ref(m.res) : responseSchema(key, obs, a) } } };
  for (const e of new Set([...(m.errors ?? []), ...(m.auth === 'user' || m.auth === 'admin' || m.auth === 'apikey' ? [401] : []), ...(['POST', 'PUT', 'PATCH'].includes(method) ? [400] : [])])) responses[String(e)] = { $ref: '#/components/responses/Error' };
  const parameters: unknown[] = [...params.map((p) => ({ name: p, in: 'path', required: true, schema: p === 'platform' ? { enum: ['tiktok', 'youtube', 'instagram', 'shopee', 'temu', 'olx', 'mercadolivre'] } : p === 'key' || p === 'provider' || p === 'bucket' ? str : uuid })), ...[...new Set([...(m.query ?? []), ...Object.keys(obs?.query?.properties ?? {})])].map((q) => ({ name: q, in: 'query', ...(obs?.query?.required?.includes(q) ? { required: true } : {}), schema: obs?.query?.properties?.[q] ? { ...(clean(obs.query.properties[q]) as object), 'x-schema-source': 'zod' } : str }))];
  if (m.idem) parameters.push({ name: 'Idempotency-Key', in: 'header', required: m.idem === 'required', schema: { type: 'string', minLength: 8, maxLength: 128 }, description: 'Repetição devolve a mesma resposta (`Idempotent-Replay: true`); mesma chave com outro corpo → 422.' });
  return [method.toLowerCase(), { tags: [m.tag], summary: m.summary, operationId: `${method.toLowerCase()}_${path.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '')}`, security: auths[m.auth], ...(m.scope ? { 'x-required-scope': m.scope } : {}), ...(m.auth === 'signature' ? { 'x-webhook': true } : {}), ...(parameters.length ? { parameters } : {}),
    ...(['POST', 'PUT', 'PATCH'].includes(method) && (m.req || obs?.body) ? { requestBody: { required: true, content: { 'application/json': { schema: m.req ? ref(m.req) : { ...(clean(obs!.body) as object), 'x-schema-source': 'zod' } } } } } : {}), responses }] as const;
}
export async function generate(): Promise<{ yaml: string; missing: string[]; stale: string[] }> {
  const live = await liveRoutes(); const paths: Record<string, Record<string, unknown>> = {}; const missing: string[] = []; const used = new Set<string>();
  for (const k of [...live].sort()) {
    const [method, url] = k.split(' ') as [string, string]; const isApi = url.startsWith('/api/v1'); const rel = isApi ? url.slice(7) : url; const key = `${method} ${isApi ? rel.replace('/api/v1', '') : rel}`;
    const m = isApi ? META[`${method} ${url.replace('/api/v1', '')}`] : ROOT[k]; if (url.startsWith('/api/v1/storage') || url === '/storage/{bucket}/{path}') continue; if (!m) { missing.push(k); continue; } used.add(isApi ? `${method} ${url.replace('/api/v1', '')}` : k);
    const params = [...url.matchAll(/\{(\w+)\}/g)].map((x) => x[1]!); const [mm, o] = op(key, m, params, OBSERVED[k]); (paths[isApi ? url.replace('/api/v1', '') : url] ??= {})[mm] = o;
  }
  const stale = [...Object.keys(META)].filter((k) => !used.has(k) && !k.includes('/storage/'));
  const doc = { openapi: '3.1.0', info: { title: 'NexusReel API', version: '1.0.0', license: { name: 'Proprietário', identifier: 'LicenseRef-NexusReel-Proprietary' }, description: 'Backend de produção do NexusReel (Fase 6). Base `/api/v1`. Erros: `{code,message,details?,traceId}`. Auth: JWT 15 min + refresh rotativo; chaves `nxr_…` para B2B.' },
    servers: [{ url: '/api/v1', description: 'API' }, { url: '/', description: 'Raiz (ops, /r/{linkId})' }],
    tags: [...new Set([...Object.values(META), ...Object.values(ROOT)].map((m) => m.tag))].map((name) => ({ name })), paths,
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, apiKey: { type: 'http', scheme: 'bearer', description: 'Chave `nxr_…` (escopos catalogs:read|generate|publish)' } }, schemas, responses: { Error: { description: 'Erro', content: { 'application/json': { schema: ref('Error') } } } } } };
  return { yaml: YAML.stringify(doc, { lineWidth: 140, aliasDuplicateObjects: false }), missing, stale };
}
if (process.argv[1]?.endsWith('gen-openapi.ts')) {
  const r = await generate(); if (r.missing.length || r.stale.length) { console.error('Rotas sem metadado:', r.missing, '\nMetadados sem rota:', r.stale); process.exit(1); }
  writeFileSync('docs/openapi.yaml', r.yaml); console.log(`docs/openapi.yaml gerado (${Object.keys(YAML.parse(r.yaml).paths).length} paths)`); process.exit(0);
}
