import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { boot, shutdown, http, signup, auth, pool, uploadPhoto, uniq, type Session } from './helpers.js';
import { buildApp } from '../src/app.js';
import { createRlsPool, pool as appPool, type RlsPool } from '../src/db/pool.js';
import { authenticate } from '../src/middlewares/auth.js';
import { runWithDbCtx, PUBLIC_ROUTE_DB_SCOPE, type DbCtx } from '../src/db/context.js';
import { env } from '../src/config/env.js';

/**
 * Reauditoria de RLS (pós-auditoria): o banco nega por padrão.
 * - toda tabela tem RLS; tabelas com dono não vazam linhas para outro usuário nem para anônimo, mesmo com SQL direto;
 * - configuração (preços, flags, comissão) só muda com admin/system;
 * - o papel da aplicação é fail-closed;
 * - toda rota pública está classificada (anon × system) e as anônimas não enxergam dados privados;
 * - operações legítimas entre usuários (recomendação agregada, autenticação opcional) continuam funcionando.
 */
const OWNER_COLS = ['user_id', 'owner_id', 'creator_id', 'buyer_id', 'referrer_id', 'reporter_id'];
let a: Session; let b: Session; let rls: RlsPool;
const as = <T>(ctx: DbCtx, fn: () => Promise<T>) => runWithDbCtx(ctx, fn);

beforeAll(async () => {
  await boot(false); rls = createRlsPool(env.DATABASE_URL);
  a = await signup({ plan: 'business', credits: 300 }); b = await signup({ plan: 'business', credits: 300 });
  const photo = await uploadPhoto(a);
  expect((await http.post('/api/v1/projects').set(auth(a)).send({ title: 'Privado de A', script: 'Roteiro de A. Cena dois. Cena três.', photos: [photo] })).status).toBe(201);
  expect((await http.post('/api/v1/catalogs').set(auth(a)).send({ name: 'Catálogo de A' })).status).toBe(201);
  expect((await http.post('/api/v1/api-keys').set(auth(a)).send({ name: 'chave de A', scopes: ['catalogs:read'] })).status).toBe(201);
  await pool.query(`INSERT INTO notifications (user_id, channel, title, body) VALUES ($1,'push','oi','privado')`, [a.id]);
  await pool.query(`INSERT INTO transactions (user_id, type, amount_cents, credits_delta, source, external_ref) VALUES ($1,'credit_purchase',990,10,'test',$2)`, [a.id, uniq('tx')]);
  await pool.query(`INSERT INTO templates (creator_id, name, category, moderation_status) VALUES ($1, 'Pendente de A', 'moda', 'pending')`, [a.id]);
});
afterAll(async () => { await rls.end(); await shutdown(); });

async function ownerTables(): Promise<Array<{ t: string; col: string }>> {
  const r = await pool.query(`SELECT c.table_name t, c.column_name col FROM information_schema.columns c JOIN information_schema.tables x ON x.table_name=c.table_name AND x.table_schema='public' AND x.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.column_name = ANY($1) ORDER BY 1, array_position($1, c.column_name::text)`, [OWNER_COLS]);
  const seen = new Set<string>(); return r.rows.filter((x) => (seen.has(x.t) ? false : (seen.add(x.t), true)));
}

describe('21. RLS — negação por padrão e exposição de dados', () => {
  it('todas as tabelas do schema público têm RLS ligado (nada fora da regra)', async () => {
    const off = (await pool.query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity AND c.relname <> 'schema_migrations' ORDER BY 1`)).rows.map((r) => r.relname);
    expect(off).toEqual([]);
  });

  it('SQL direto como nexus_app: B não vê nenhuma linha de A em nenhuma tabela com dono; anônimo não vê nenhuma', async () => {
    const tables = await ownerTables(); expect(tables.length).toBeGreaterThan(30);
    const leaks: string[] = []; let withRows = 0;
    for (const { t, col } of tables) {
      const q = `SELECT count(*)::int n FROM ${t} WHERE ${col} = $1`;
      const sys = (await pool.query(q, [a.id])).rows[0].n as number; if (sys > 0) withRows++;
      const asB = (await as({ userId: b.id }, () => rls.query(q, [a.id]))).rows[0].n as number;
      const anon = (await as({}, () => rls.query(q, [a.id]))).rows[0].n as number;
      const visibleToAll = t === 'template_reviews' || (t === 'templates'); // leitura pública por policy (só aprovados no caso de templates)
      if (!visibleToAll && (asB > 0 || anon > 0)) leaks.push(`${t}.${col}: B=${asB} anon=${anon} (system=${sys})`);
    }
    expect(withRows).toBeGreaterThanOrEqual(6); // a sonda tem dados reais de A
    expect(leaks).toEqual([]);
    // templates: B e anônimo só veem aprovados
    expect((await as({ userId: b.id }, () => rls.query(`SELECT count(*)::int n FROM templates WHERE creator_id=$1 AND moderation_status<>'approved'`, [a.id]))).rows[0].n).toBe(0);
    expect((await as({}, () => rls.query(`SELECT count(*)::int n FROM templates WHERE moderation_status<>'approved'`))).rows[0].n).toBe(0);
  });

  it('controle positivo: A vê as próprias linhas pelo RLS (a sonda não é vazia)', async () => {
    for (const t of ['projects', 'catalogs', 'api_keys', 'notifications', 'transactions', 'refresh_tokens']) {
      const col = t === 'catalogs' ? 'owner_id' : 'user_id';
      expect([t, (await as({ userId: a.id }, () => rls.query(`SELECT count(*)::int n FROM ${t} WHERE ${col}=$1`, [a.id]))).rows[0].n > 0]).toEqual([t, true]);
    }
    expect((await as({ userId: a.id }, () => rls.query(`SELECT count(*)::int n FROM users`))).rows[0].n).toBe(1); // só a própria linha
  });

  it('usuário não altera dados de outro nem configuração (preço, flags, comissão, experimentos)', async () => {
    const upd = await as({ userId: b.id }, () => rls.query(`UPDATE users SET credits = credits + 1000 WHERE id=$1`, [a.id])); expect(upd.rowCount).toBe(0);
    for (const sql of [`UPDATE settings SET value=value`, `UPDATE feature_flags SET enabled=NOT enabled`, `UPDATE pricing_regions SET plan_pro_price_cents=1`, `UPDATE experiments SET status=status`, `DELETE FROM lifecycle_campaigns`]) {
      const r = await as({ userId: b.id }, () => rls.query(sql)); expect([sql, r.rowCount]).toEqual([sql, 0]);
    }
    await expect(as({ userId: b.id }, () => rls.query(`INSERT INTO feature_flags (key, enabled) VALUES ('hack_${Date.now()}', true)`))).rejects.toThrow(/row-level security/);
    await expect(as({ userId: b.id }, () => rls.query(`INSERT INTO transactions (user_id, type, amount_cents, credits_delta, source, external_ref) VALUES ($1,'bonus_credit',0,999,'hack',$2)`, [a.id, uniq('h')]))).rejects.toThrow(/row-level security/);
    // trilhas internas: usuário registra, mas não lê
    expect((await as({ userId: a.id }, () => rls.query(`SELECT count(*)::int n FROM audit_logs`))).rows[0].n).toBe(0);
    expect((await as({ userId: a.id }, () => rls.query(`SELECT count(*)::int n FROM analytics_events`))).rows[0].n).toBe(0);
  });

  it('papel da aplicação é fail-closed: se o SET ROLE falha, nenhuma consulta roda (não cai para o dono)', async () => {
    const bad = createRlsPool(env.DATABASE_URL, 'papel_que_nao_existe');
    try { await expect(as({ userId: a.id }, () => bad.query('SELECT count(*) FROM users'))).rejects.toThrow(); } finally { await bad.end(); }
    expect((await as({ userId: a.id }, () => rls.query('SELECT current_user AS u'))).rows[0].u).toBe('nexus_app');
  });

  it('toda rota sem autenticação obrigatória está classificada (anon/system) e toda classificação aponta para rota real', async () => {
    const spec = parseYaml(readFileSync('docs/openapi.yaml', 'utf8')) as { security?: Array<Record<string, unknown>>; paths: Record<string, Record<string, { security?: Array<Record<string, unknown>> }>> };
    const root = (p: string) => /^\/(healthz|readyz|metrics|r\/)/.test(p);
    const toKey = (m: string, p: string) => `${m.toUpperCase()} ${root(p) ? '' : '/api/v1'}${p.replace(/\{([^}]+)\}/g, ':$1')}`;
    const publicOps: string[] = [];
    for (const [p, ops] of Object.entries(spec.paths)) for (const [m, o] of Object.entries(ops)) {
      if (!['get', 'post', 'put', 'patch', 'delete'].includes(m)) continue; const sec = o.security ?? spec.security ?? [];
      if (sec.length === 0 || sec.every((s) => Object.keys(s).length === 0)) publicOps.push(toKey(m, p));
    }
    const missing = publicOps.filter((k) => !PUBLIC_ROUTE_DB_SCOPE[k]); expect(missing).toEqual([]);
    const live = new Set<string>(); const probe = await buildApp({ onRoute: (r) => { for (const m of [r.method].flat()) live.add(`${m} ${r.url}`); } }); await probe.ready(); await probe.close();
    expect(Object.keys(PUBLIC_ROUTE_DB_SCOPE).filter((k) => !live.has(k))).toEqual([]);
    expect(Object.values(PUBLIC_ROUTE_DB_SCOPE).every((v) => v.reason.length > 10)).toBe(true);
  });

  it('rotas públicas anônimas não enxergam dados privados (template pendente) e autenticação opcional vira usuário', async () => {
    const pend = (await pool.query(`SELECT id FROM templates WHERE creator_id=$1 AND moderation_status='pending' LIMIT 1`, [a.id])).rows[0].id as string;
    expect((await http.get(`/api/v1/templates/${pend}`)).status).toBe(404);
    expect((await http.get(`/api/v1/templates/${pend}`).set(auth(b))).status).toBe(404);
    expect((await http.get(`/api/v1/templates/${pend}`).set(auth(a))).status).toBe(200); // dono, via autenticação opcional
    expect(JSON.stringify((await http.get('/api/v1/templates?limit=50')).body)).not.toContain(pend);
    // preço regional depende do país do usuário: com JWT, a rota pública lê a própria linha (antes do ajuste, anônimo → região padrão)
    await pool.query(`UPDATE users SET country='MX' WHERE id=$1`, [b.id]);
    expect((await http.get('/api/v1/pricing').set(auth(b))).body.currency).toBe('MXN');
    expect((await http.get('/api/v1/pricing?country=BR')).body.currency).toBe('BRL');
  });

  it('agregado legítimo entre usuários continua funcionando: recomendação por coocorrência usa uso de outras pessoas', async () => {
    const creator = await signup(); const t: string[] = [];
    for (const [i, cat] of ['moda', 'casa', 'tech', 'beleza', 'pets', 'auto', 'food'].entries()) t.push((await pool.query(`INSERT INTO templates (creator_id,name,category,moderation_status,usage_count,price_credits) VALUES ($1,$2,$3,'approved',$4,0) RETURNING id`, [creator.id, `CF ${uniq('t')}`, cat, 50 - i])).rows[0].id);
    const others = [await signup(), await signup(), await signup()];
    for (const o of others) await http.post('/api/v1/recommendations/events').set(auth(o)).send({ events: [t[0], t[6]].map((id) => ({ surface: 'templates', itemType: 'template', itemId: id, action: 'use' })) });
    const u = await signup();
    await http.post('/api/v1/recommendations/events').set(auth(u)).send({ events: [{ surface: 'templates', itemType: 'template', itemId: t[0], action: 'use' }, ...t.slice(1, 5).map((id) => ({ surface: 'templates', itemType: 'template', itemId: id, action: 'click' }))] });
    const r = (await http.get('/api/v1/recommendations/templates?limit=30').set(auth(u))).body;
    expect(r.mode).toBe('personalized');
    const item = r.items.find((x: { id: string }) => x.id === t[6]); expect(item).toBeTruthy();
    expect(item.reasons.join(' ')).toMatch(/Quem usou/); // só existe com dados de outros usuários (agregados)
    expect(JSON.stringify(r)).not.toMatch(new RegExp(others.map((o) => o.id).join('|'))); // e não revela quem
  });
  it('contexto efetivo por tipo de requisição: anônima sem bypass, rota pública classificada como system, autenticada como o usuário', async () => {
    const probe = await buildApp({ bullBoard: false });
    const who = async () => (await appPool.query(`SELECT current_user AS u, current_setting('app.user_id', true) AS uid, current_setting('app.system', true) AS sys, current_setting('app.is_admin', true) AS adm`)).rows[0];
    probe.get('/api/v1/__probe/anon', async () => who());
    probe.post('/api/v1/__probe/system', async () => who());
    probe.get('/api/v1/__probe/user', { preHandler: [authenticate()] }, async () => who());
    PUBLIC_ROUTE_DB_SCOPE['POST /api/v1/__probe/system'] = { scope: 'system', reason: 'sonda de teste' };
    try {
      await probe.ready();
      const anon = (await probe.inject({ method: 'GET', url: '/api/v1/__probe/anon' })).json();
      expect(anon).toEqual({ u: 'nexus_app', uid: '', sys: 'false', adm: 'false' });
      const sys = (await probe.inject({ method: 'POST', url: '/api/v1/__probe/system', payload: { x: 1 } })).json(); // corpo JSON: contexto sobrevive ao parse
      expect(sys).toMatchObject({ u: 'nexus_app', sys: 'true' });
      const usr = (await probe.inject({ method: 'GET', url: '/api/v1/__probe/user', headers: auth(a) })).json();
      expect(usr).toEqual({ u: 'nexus_app', uid: a.id, sys: 'false', adm: 'false' });
    } finally { delete PUBLIC_ROUTE_DB_SCOPE['POST /api/v1/__probe/system']; await probe.close(); }
  });
  it('varredura: nenhuma rota GET autenticada (não-admin) devolve segredo, hash interno ou e-mail de outra pessoa', async () => {
    const spec = parseYaml(readFileSync('docs/openapi.yaml', 'utf8')) as { paths: Record<string, Record<string, { security?: Array<Record<string, unknown>> }>> };
    const project = (await pool.query(`SELECT id FROM projects WHERE user_id=$1 LIMIT 1`, [a.id])).rows[0].id as string;
    const FORBIDDEN = /password_hash|passwordHash|totp_secret|totpSecret|token_enc|tokenEnc|key_hash|keyHash|ip_hash|ipHash|device_hash|deviceHash|stripe_customer_id|stripeCustomerId|v1:k1:|\$argon2/;
    const bad: string[] = []; let n = 0;
    for (const [path, ops] of Object.entries(spec.paths)) {
      const op = ops.get; if (!op || path.startsWith('/admin') || /^\/(healthz|readyz|metrics|r\/)/.test(path)) continue;
      if (!(op.security ?? []).length) continue; // públicas já cobertas acima
      const url = '/api/v1' + path.replace(/\{(id|projectId)\}/g, project).replace(/\{platform\}/g, 'tiktok').replace(/\{[^}]+\}/g, '00000000-0000-4000-8000-000000000001');
      const r = await http.get(url).set(auth(a)); n++;
      const text = (r.text ?? '') + JSON.stringify(r.body ?? '');
      const m = text.match(FORBIDDEN); if (m) bad.push(`GET ${path}: ${m[0]}`);
      if (text.includes(b.email)) bad.push(`GET ${path}: e-mail de outro usuário`);
    }
    expect(n).toBeGreaterThanOrEqual(40); expect(bad).toEqual([]);
  });
});
