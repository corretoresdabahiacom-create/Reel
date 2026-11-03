import pg from 'pg';
import { env } from '../config/env.js';
import { currentDbCtx, type DbCtx } from './context.js';

pg.types.setTypeParser(20, (v) => Number(v)); // bigint → number (valores em centavos cabem em 2^53)
pg.types.setTypeParser(1700, (v) => Number(v)); // numeric

/**
 * Auditoria pós-Fase 8 — RLS efetivo em TODAS as consultas.
 * Antes: só ~4% das consultas (as feitas via `asUser`) passavam pelo RLS; o resto rodava como dono das tabelas.
 * Agora: cada conexão assume o papel sem privilégio de dono (`DB_APP_ROLE`, padrão `nexus_app`) e cada checkout
 * aplica o contexto da requisição (src/db/context.ts) antes da consulta. Migrations usam um cliente próprio (dono).
 */
const APP_ROLE = env.DB_APP_ROLE;
function makeRaw(connectionString: string, max: number): pg.Pool {
  const p = new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
  return p;
}
const kCtx = Symbol('ctxKey'); const kRole = Symbol('appRole');
type Tagged = pg.PoolClient & { [kCtx]?: string; [kRole]?: boolean };
/**
 * Fail-closed: a conexão só executa consultas depois de CONFIRMAR que assumiu o papel sem privilégio de dono.
 * (Antes, um `SET ROLE` com erro era ignorado e a conexão seguia como dono das tabelas — RLS desligado em silêncio.)
 */
async function ensureRole(c: Tagged, role: string = APP_ROLE): Promise<void> {
  if (!role || c[kRole]) return;
  await c.query(`SET ROLE ${pg.escapeIdentifier(role)}`);
  const who = (await c.query<{ u: string }>('SELECT current_user AS u')).rows.at(0)?.u;
  if (who !== role) throw new Error(`RLS: conexão não assumiu o papel ${role} (current_user=${who})`);
  c[kRole] = true;
}
const keyOf = (c: DbCtx) => `${c.userId ?? ''}|${c.isAdmin ? 1 : 0}|${c.system ? 1 : 0}`;
async function applyCtx(c: Tagged, ctx: DbCtx, role: string = APP_ROLE): Promise<void> {
  await ensureRole(c, role);
  const k = keyOf(ctx); if (c[kCtx] === k) return;
  await c.query(`SELECT set_config('app.user_id', $1, false), set_config('app.is_admin', $2, false), set_config('app.system', $3, false)`, [ctx.userId ?? '', ctx.isAdmin ? 'true' : 'false', ctx.system ? 'true' : 'false']);
  c[kCtx] = k;
}
type QueryArgs = [text: string | pg.QueryConfig, values?: unknown[]];
export interface RlsPool {
  query<R extends pg.QueryResultRow = any>(...a: QueryArgs): Promise<pg.QueryResult<R>>;  
  connect(): Promise<pg.PoolClient>;
  end(): Promise<void>;
  readonly raw: pg.Pool;
}
/**
 * Diagnóstico (só testes, `RLS_DIFF_LOG=<arquivo>`): reexecuta como system, numa transação desfeita, cada consulta feita em
 * contexto de usuário e registra quando o número de linhas difere. Revela consultas que o RLS restringiu — proteção
 * esperada (IDOR) ou degradação silenciosa de uma operação legítima entre usuários (ver docs/SECURITY_RLS.md).
 */
const DIFF_LOG = process.env.RLS_DIFF_LOG;
const digest = (rows: unknown[]): string => rows.map((r) => JSON.stringify(r)).sort().join('\n');
async function rlsDiff(raw: pg.Pool, ctx: DbCtx, text: string | pg.QueryConfig, values: unknown[] | undefined, userCount: number | null, userRows: unknown[]): Promise<void> {
  if (!DIFF_LOG || ctx.system || ctx.isAdmin || !ctx.userId) return;
  const sql = typeof text === 'string' ? text : text.text; if (/^\s*(BEGIN|COMMIT|ROLLBACK|SET|SELECT set_config|SAVEPOINT|RELEASE)/i.test(sql) || /FOR UPDATE|pg_advisory|nextval|INSERT /i.test(sql)) return;
  const site = (new Error().stack ?? '').split('\n').filter((l) => l.includes('/src/') && !l.includes('/src/db/')).slice(0, 2).map((l) => l.trim().replace(/^at /, '').replace(/\(?\/.*\/src\//, 'src/').replace(/\)$/, '')).join(' <- ');
  const c = (await raw.connect()) as Tagged; c[kCtx] = undefined; await ensureRole(c).catch(() => undefined);
  try {
    await c.query('BEGIN'); await c.query(`SELECT set_config('app.system','true',true), set_config('app.user_id','',true), set_config('app.is_admin','false',true)`);
    const r = await c.query(sql, values); const sysCount = r.rowCount ?? r.rows.length;
    // compara contagem E conteúdo: agregados (GROUP BY/count) mantêm o nº de linhas mas mudam os valores quando o RLS filtra
    const isRead = /^\s*(SELECT|WITH)\b/i.test(sql);
    if (sysCount !== userCount || (isRead && digest(r.rows) !== digest(userRows))) { const { appendFileSync } = await import('node:fs'); appendFileSync(DIFF_LOG, JSON.stringify({ site, user: userCount, system: sysCount, sameCount: sysCount === userCount, sql: sql.replace(/\s+/g, ' ').slice(0, 240) }) + '\n'); }
  } catch { /* diagnóstico nunca falha a consulta original */ } finally { await c.query('ROLLBACK').catch(() => undefined); c.release(); }
}
function rls(raw: pg.Pool, role: string = APP_ROLE): RlsPool {
  return {
    raw,
    async query(text: string | pg.QueryConfig, values?: unknown[]) {
      const c = (await raw.connect()) as Tagged; let broken: Error | undefined; const ctx = currentDbCtx();
      try { await applyCtx(c, ctx, role); const r = await c.query(text as string, values); if (DIFF_LOG) await rlsDiff(raw, ctx, text, values, r.rowCount ?? r.rows.length, r.rows); return r; }
      catch (e) { if ((e as { code?: string }).code === undefined) broken = e as Error; throw e; } finally { c.release(broken); }
    },
    async connect() { const c = (await raw.connect()) as Tagged; try { await applyCtx(c, currentDbCtx(), role); } catch (e) { c.release(e as Error); throw e; } return c; },
    end: () => raw.end(),
  } as RlsPool;
}

/** Fábrica exposta para testes de segurança (papel/RLS). A aplicação usa só `pool`/`readPool`. */
export const createRlsPool = (connectionString: string, role: string = APP_ROLE, max = 2): RlsPool => rls(makeRaw(connectionString, max), role);
const rawPool = makeRaw(env.DATABASE_URL, env.NODE_ENV === 'test' ? 10 : 20);
export const pool: RlsPool = rls(rawPool);
export const readPool: RlsPool = env.DATABASE_READ_URL ? rls(makeRaw(env.DATABASE_READ_URL, 20)) : pool;

/** Qualquer executor de consultas: o `pool` com RLS ou um cliente dentro de transação. */
export interface Db { query<R extends pg.QueryResultRow = any>(text: string | pg.QueryConfig, values?: unknown[]): Promise<pg.QueryResult<R>> }  
export interface Ctx { userId?: string; isAdmin?: boolean; system?: boolean }

/** Transação com contexto RLS explícito (`SET LOCAL` sobrepõe o contexto da requisição só dentro da transação). */
export async function tx<T>(ctx: Ctx, fn: (db: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    if (APP_ROLE) await c.query(`SET LOCAL ROLE ${pg.escapeIdentifier(APP_ROLE)}`);
    await c.query(`SELECT set_config('app.user_id', $1, true), set_config('app.is_admin', $2, true), set_config('app.system', $3, true)`,
      [ctx.userId ?? '', ctx.isAdmin ? 'true' : 'false', ctx.system ? 'true' : 'false']);
    const r = await fn(c); await c.query('COMMIT'); return r;
  } catch (e) { await c.query('ROLLBACK').catch(() => undefined); throw e; } finally { c.release(); }
}
export const asUser = <T>(userId: string, fn: (db: pg.PoolClient) => Promise<T>, isAdmin = false) => tx({ userId, isAdmin }, fn);
/** Escalonamento explícito para operações legítimas entre usuários. Todo uso novo deve entrar em docs/SECURITY_RLS.md. */
export const asSystem = <T>(fn: (db: pg.PoolClient) => Promise<T>) => tx({ system: true }, fn);
export async function closePools(): Promise<void> { await pool.end(); if (readPool !== pool) await readPool.end(); }
