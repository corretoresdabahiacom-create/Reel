/**
 * P0-1 etapa 2 — tipos de RESPOSTA garantidos pelo compilador.
 *
 * Lê cada `app.<método>('<rota>', …, handler)` do código, pede ao TypeScript o tipo que o handler devolve
 * (desembrulhando Promise e `reply.send(x)`) e converte em JSON Schema, já no formato que o Fastify serializa
 * (Date → string date-time, `undefined` some, campo opcional sai de `required`). Grava `docs/openapi-static.json`.
 *
 * O gerador do OpenAPI usa este schema como fonte principal da resposta; onde o código não tem tipo (`any`),
 * cai para o formato observado na suíte. Nos testes, toda resposta 2xx é validada contra o schema final
 * (`src/observability/contractEnforcer.ts`), então tipo declarado e resposta real não podem divergir.
 *
 * Uso: `npx tsx scripts/gen-response-types.ts` (rápido, sem banco). `--check` falha se o arquivo estiver defasado.
 */
import ts from 'typescript';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';

export type J = Record<string, unknown>;
const ROOT = resolve(import.meta.dirname, '..');
const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

function program(): ts.Program {
  const cfg = ts.readConfigFile(resolve(ROOT, 'tsconfig.json'), ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, ROOT);
  return ts.createProgram(parsed.fileNames.filter((f) => f.includes('/src/')), parsed.options);
}

/** Converte um tipo TS no JSON que o Fastify realmente envia. `unknownCount` conta trechos sem tipo (`any`/`unknown`). */
class Conv {
  unknownCount = 0;
  constructor(private c: ts.TypeChecker) {}
  private isDate(t: ts.Type) { return t.symbol?.name === 'Date'; }
  private isReply(t: ts.Type) { return !!t.getProperty('send') && !!t.getProperty('status') && !!t.getProperty('header'); }
  schema(t: ts.Type, depth = 0, seen = new Set<ts.Type>()): J {
    const c = this.c; const f = t.flags;
    if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) { this.unknownCount++; return {}; }
    if (f & ts.TypeFlags.Never || f & ts.TypeFlags.Void || f & ts.TypeFlags.Undefined) return { not: {} };
    if (f & ts.TypeFlags.Null) return { type: 'null' };
    if (f & ts.TypeFlags.BooleanLike) return f & ts.TypeFlags.BooleanLiteral ? { type: 'boolean', const: (t as unknown as { intrinsicName: string }).intrinsicName === 'true' } : { type: 'boolean' };
    if (f & ts.TypeFlags.StringLiteral) return { type: 'string', const: (t as ts.StringLiteralType).value };
    if (f & ts.TypeFlags.NumberLiteral) return { type: Number.isInteger((t as ts.NumberLiteralType).value) ? 'integer' : 'number', const: (t as ts.NumberLiteralType).value };
    if (f & ts.TypeFlags.StringLike || f & ts.TypeFlags.TemplateLiteral) return { type: 'string' };
    if (f & ts.TypeFlags.NumberLike || f & ts.TypeFlags.Enum) return { type: 'number' };
    if (f & ts.TypeFlags.BigIntLike) return { type: 'string', description: 'bigint' };
    if (t.isUnion()) {
      const parts = t.types.filter((x) => !(x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Void)));
      // boolean = true|false; enums de string viram enum
      if (parts.length && parts.every((x) => x.flags & ts.TypeFlags.BooleanLiteral)) return { type: 'boolean' };
      const lits = parts.filter((x) => x.flags & ts.TypeFlags.StringLiteral);
      const rest = parts.filter((x) => !(x.flags & ts.TypeFlags.StringLiteral) && !(x.flags & ts.TypeFlags.BooleanLiteral));
      const bools = parts.some((x) => x.flags & ts.TypeFlags.BooleanLiteral);
      const out: J[] = []; if (lits.length) out.push({ type: 'string', enum: lits.map((x) => (x as ts.StringLiteralType).value).sort() }); if (bools) out.push({ type: 'boolean' });
      for (const x of rest) out.push(this.schema(x, depth + 1, seen));
      return out.length === 1 ? out[0]! : { anyOf: out };
    }
    if (this.isDate(t)) return { type: 'string', format: 'date-time' };
    if (depth > 12 || seen.has(t)) { this.unknownCount++; return {}; }
    if (c.isArrayType(t) || c.isTupleType(t)) {
      const args = c.getTypeArguments(t as ts.TypeReference); const s2 = new Set(seen); s2.add(t);
      if (c.isTupleType(t)) return { type: 'array', prefixItems: args.map((a) => this.schema(a, depth + 1, s2)), minItems: args.length, maxItems: args.length };
      return { type: 'array', items: args[0] ? this.schema(args[0], depth + 1, s2) : {} };
    }
    if (f & ts.TypeFlags.Object || t.isIntersection()) {
      if (t.symbol?.name === 'Buffer' || t.symbol?.name === 'Readable' || t.symbol?.name === 'ReadStream') return { description: 'binário (não-JSON)', 'x-binary': true };
      if (this.isReply(t)) return { 'x-reply': true };
      const s2 = new Set(seen); s2.add(t);
      const idx = c.getIndexInfosOfType(t); const props = c.getPropertiesOfType(t).filter((p) => !(p.flags & ts.SymbolFlags.Method));
      const properties: Record<string, J> = {}; const required: string[] = [];
      for (const p of props) {
        const pt = c.getTypeOfSymbol(p); const decl = p.valueDeclaration ?? p.declarations?.[0];
        if (pt.getCallSignatures().length) continue; // funções não são serializadas
        // `any`/`unknown` não diz se o campo vem: não pode ser obrigatório no contrato
        const optional = !!(p.flags & ts.SymbolFlags.Optional) || (pt.isUnion() && pt.types.some((x) => x.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown))) || !!(pt.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Any | ts.TypeFlags.Unknown));
        const s = this.schema(pt, depth + 1, s2); if (s.not) continue; properties[p.name] = s; if (!optional) required.push(p.name); void decl;
      }
      // `{}`/`object` sem campos = qualquer objeto (o TS não promete nada): aberto, e conta como não-tipado
      if (!props.length && !idx.length) { this.unknownCount++; return { type: 'object' }; }
      const out: J = { type: 'object', properties, required: required.sort() };
      if (idx.length) { out.additionalProperties = this.schema(idx[0]!.type, depth + 1, s2); if (!props.length) { delete out.properties; delete out.required; } }
      else out.additionalProperties = false;
      return out;
    }
    this.unknownCount++; return {};
  }
}

/** Tipo efetivamente enviado pelo handler: Promise<T> → T; se devolve o `reply`, junta os tipos de todos os `.send(x)`. */
function handlerTypes(c: ts.TypeChecker, fn: ts.SignatureDeclaration & { body?: ts.ConciseBody }): ts.Type[] {
  const sig = c.getSignatureFromDeclaration(fn); if (!sig) return [];
  const ret = c.getAwaitedType(c.getReturnTypeOfSignature(sig)) ?? c.getReturnTypeOfSignature(sig);
  const isReply = (t: ts.Type) => !!t.getProperty('send') && !!t.getProperty('status');
  const flat = ret.isUnion() ? ret.types : [ret];
  const direct = flat.filter((t) => !isReply(t) && !(t.flags & (ts.TypeFlags.Void | ts.TypeFlags.Undefined)));
  // devolve o `reply` (ou o TS não resolveu o tipo do reply → any/never): o que sai é o argumento de `.send(x)`
  const anyRet = !!(ret.flags & (ts.TypeFlags.Any | ts.TypeFlags.Never)); // `reply.send()` às vezes resolve como never
  if ((flat.some(isReply) || anyRet) && fn.body) {
    const before = direct.length;
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'send' && n.arguments[0]) {
        const at = c.getTypeAtLocation(n.arguments[0]); direct.push(c.getAwaitedType(at) ?? at);
      }
      if (!ts.isFunctionLike(n) || n === fn) ts.forEachChild(n, visit);
    };
    visit(fn.body);
    if (anyRet && direct.length > before) direct.splice(0, before); // achou .send(x): descarta o any do retorno
  }
  return direct;
}

export interface StaticEntry { file: string; schema: J; unknown: number; binary?: boolean }
export function extract(): { routes: Record<string, StaticEntry>; unmatched: string[] } {
  const p = program(); const c = p.getTypeChecker(); const found: Array<{ method: string; path: string; file: string; types: ts.Type[] }> = [];
  for (const sf of p.getSourceFiles()) {
    if (sf.isDeclarationFile || !sf.fileName.includes('/src/')) continue;
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && METHODS.has(n.expression.name.text) && n.arguments.length >= 2 && ts.isStringLiteral(n.arguments[0]!)) {
        const h = n.arguments[n.arguments.length - 1]!;
        const route = { method: n.expression.name.text.toUpperCase(), path: (n.arguments[0] as ts.StringLiteral).text.replace(/:(\w+)/g, '{$1}'), file: relative(ROOT, sf.fileName) };
        if (ts.isArrowFunction(h) || ts.isFunctionExpression(h)) found.push({ ...route, types: handlerTypes(c, h) });
        else if (ts.isCallExpression(h)) { // handler embrulhado (ex.: `cam(async (req) => …)`): vale o tipo do handler devolvido
          const sig = c.getTypeAtLocation(h).getCallSignatures()[0];
          if (sig) { const ret = c.getReturnTypeOfSignature(sig); found.push({ ...route, types: [c.getAwaitedType(ret) ?? ret] }); }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  const routes: Record<string, StaticEntry> = {}; const unmatched: string[] = [];
  for (const r of found) {
    const conv = new Conv(c); const parts = r.types.map((t) => conv.schema(t)).filter((s) => !s.not && !s['x-reply']);
    const binary = parts.some((s) => s['x-binary']); const json = parts.filter((s) => !s['x-binary']);
    const schema: J = json.length === 0 ? {} : json.length === 1 ? json[0]! : { anyOf: json };
    if (!json.length) conv.unknownCount++;
    routes[`${r.method} ${r.path}`] = { file: r.file, schema, unknown: conv.unknownCount, ...(binary ? { binary } : {}) };
  }
  return { routes, unmatched };
}

const sortDeep = (v: unknown): unknown => Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep((v as J)[k])])) : v;
if (process.argv[1]?.endsWith('gen-response-types.ts')) {
  const out = JSON.stringify(sortDeep(extract().routes), null, 1) + '\n'; const file = resolve(ROOT, 'docs/openapi-static.json');
  if (process.argv.includes('--check')) { if (!existsSync(file) || readFileSync(file, 'utf8') !== out) { console.error('docs/openapi-static.json defasado → npx tsx scripts/gen-response-types.ts'); process.exit(1); } console.log('tipos estáticos de resposta em dia'); }
  else { writeFileSync(file, out); const r = JSON.parse(out) as Record<string, StaticEntry>; const full = Object.values(r).filter((e) => e.unknown === 0).length; console.log(`docs/openapi-static.json: ${Object.keys(r).length} handlers; ${full} totalmente tipados`); }
}
