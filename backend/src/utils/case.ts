/**
 * P0-1 etapa 2 — a API fala camelCase (convenção de `docs/API.md`). Algumas rotas devolviam linhas do Postgres cruas
 * (`duration_ms`, `created_at`…). `camelOut` converte as CHAVES de linhas na fronteira HTTP/WebSocket, sem tocar em
 * conteúdo livre: valores de colunas jsonb (props, metrics, timeline…) são dados, não campos, e passam intactos.
 */
const SNAKE = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
export const toCamel = (k: string) => (SNAKE.test(k) ? k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase()) : k);

/** Chaves cujo VALOR é conteúdo livre (jsonb) — a chave é renomeada, o valor não é percorrido. */
export const BLOB_KEYS = new Set(['props', 'metrics', 'subject', 'content', 'roles', 'timeline', 'actions_json', 'actionsJson', 'five_whys', 'fiveWhys', 'results', 'avatar_config', 'avatarConfig', 'details', 'metadata', 'op']);

export function camelOut<T>(v: T, blobs: ReadonlySet<string> = BLOB_KEYS): T {
  if (Array.isArray(v)) return v.map((x) => camelOut(x, blobs)) as T;
  if (!v || typeof v !== 'object' || v instanceof Date || Buffer.isBuffer(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[toCamel(k)] = blobs.has(k) ? x : camelOut(x, blobs);
  return out as T;
}

/** Tipo: as chaves snake_case viram camelCase (para o contrato gerado do TypeScript bater com o que sai). */
type CamelStr<S extends string> = S extends `${infer H}_${infer T}` ? `${H}${Capitalize<CamelStr<T>>}` : S;
export type Camel<T> = T extends Date ? T : T extends Array<infer U> ? Array<Camel<U>> : T extends object ? { [K in keyof T as K extends string ? CamelStr<K> : K]: K extends 'props' | 'metrics' | 'subject' | 'content' | 'roles' | 'timeline' | 'actions_json' | 'five_whys' | 'results' | 'avatar_config' | 'details' | 'metadata' | 'op' ? T[K] : Camel<T[K]> } : T;
export const camel = <T>(v: T) => camelOut(v) as Camel<T>;
/** Entrada no sentido inverso (ex.: `restore` do fork devolve o trecho como a API o entregou): camelCase → coluna. Raso. */
export const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
export const snakeKeys = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [toSnake(k), v]));
