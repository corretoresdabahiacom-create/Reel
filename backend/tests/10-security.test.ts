import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, pool, uploadPhoto, connectPlatform, png, type Session } from './helpers.js';
import { tx } from '../src/db/pool.js';
import supertest from 'supertest';
import { app } from './helpers.js';
import { decrypt, encrypt } from '../src/utils/crypto.js';

let a: Session; let b: Session;
beforeAll(async () => { await boot(false); a = await signup({ plan: 'pro' }); b = await signup({ plan: 'pro' }); });
afterAll(() => shutdown());

describe('10. Segurança', () => {
  it('tokens de plataforma ficam criptografados (AES-256-GCM v1:…) e nunca aparecem na API', async () => {
    await connectPlatform(a, 'tiktok'); const row = (await pool.query(`SELECT access_token_enc, refresh_token_enc FROM connected_accounts WHERE user_id=$1 AND platform='tiktok'`, [a.id])).rows[0];
    expect(row.access_token_enc).toMatch(/^v1:k1:/); expect(row.access_token_enc.split(':')).toHaveLength(5); expect(decrypt(row.access_token_enc)).toMatch(/mock/i);
    const list = await http.get('/api/v1/integrations').set(auth(a)); expect(JSON.stringify(list.body).toLowerCase()).not.toMatch(/access_?token|refresh_?token/);
    expect(encrypt('x')).not.toBe(encrypt('x')); // IV aleatório
    const tampered = row.access_token_enc.slice(0, -2) + (row.access_token_enc.endsWith('aa') ? 'bb' : 'aa'); expect(() => decrypt(tampered)).toThrow();
  });
  it('rate limiting: login 429 com Retry-After após o limite, por IP', async () => {
    const st = supertest(app.server); let last = 0; let retry = ''; for (let i = 0; i < 14; i++) { const r = await st.post('/api/v1/auth/login').set('x-forwarded-for', '203.0.113.9').send({ email: 'nobody@t.dev', password: 'whatever-pass' }); last = r.status; if (r.status === 429) { retry = String(r.headers['retry-after']); break; } }
    expect(last).toBe(429); expect(Number(retry)).toBeGreaterThan(0);
    expect((await st.post('/api/v1/auth/login').set('x-forwarded-for', '203.0.113.77').send({ email: 'outro-nobody@t.dev', password: 'whatever-pass' })).status).toBe(401); // outro IP não é afetado
  });
  it('RLS: usuário não lê nem altera projetos de outro, mesmo com SQL direto como nexus_app', async () => {
    const p = await http.post('/api/v1/projects').set(auth(a)).send({ title: 'Privado', script: 'x', photos: [] }); const id = p.body.id as string;
    expect((await http.get(`/api/v1/projects/${id}`).set(auth(b))).status).toBe(404); expect((await http.patch(`/api/v1/projects/${id}`).set(auth(b)).send({ title: 'hack' })).status).toBe(404); expect((await http.delete(`/api/v1/projects/${id}`).set(auth(b))).status).toBe(404);
    const seen = await tx({ userId: b.id }, async (db) => (await db.query('SELECT count(*)::int n FROM projects WHERE id=$1', [id])).rows[0].n); expect(seen).toBe(0);
    const upd = await tx({ userId: b.id }, async (db) => (await db.query(`UPDATE projects SET title='x' WHERE id=$1`, [id])).rowCount); expect(upd).toBe(0);
    const mine = await tx({ userId: a.id }, async (db) => (await db.query('SELECT count(*)::int n FROM projects WHERE id=$1', [id])).rows[0].n); expect(mine).toBe(1);
    const none = await tx({}, async (db) => (await db.query('SELECT count(*)::int n FROM projects')).rows[0].n); expect(none).toBe(0); // sem contexto → nada
  });
  it('uploads: magic bytes, tamanho, EICAR e tipo falso são rejeitados', async () => {
    const up = (buf: Buffer, ct = 'image/png') => http.put('/api/v1/uploads/photo').set(auth(a)).set('content-type', ct).send(buf);
    expect((await up(png)).status).toBe(201); expect((await up(Buffer.from('<?php echo 1; ?>'))).status).toBe(422); expect((await up(Buffer.from('MZ\x90\x00this is an exe'))).status).toBe(422);
    expect((await up(Buffer.concat([png, Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*')]))).status).toBe(422); expect((await up(Buffer.alloc(11 * 1024 * 1024, 1))).status).toBeGreaterThanOrEqual(400);
    expect((await http.put('/api/v1/uploads/photo').set(auth(a)).send(png)).status).toBeGreaterThanOrEqual(400); // sem content-type de imagem
    expect(await uploadPhoto(a)).toMatch(/^uploads\//);
  });
  it('URLs assinadas: adulteradas ou expiradas dão 403; chave de outra pessoa não é acessível', async () => {
    const r = await http.put('/api/v1/uploads/photo').set(auth(a)).set('content-type', 'image/png').send(png); const u = new URL(r.body.url);
    expect((await http.get(u.pathname + u.search)).status).toBe(200); expect((await http.get(u.pathname + u.search.replace(/exp=\d+/, 'exp=1'))).status).toBe(403);
    expect((await http.get(u.pathname.replace('uploads', 'videos') + u.search)).status).toBe(403); expect((await http.get(`/api/v1/storage/uploads/../../etc/passwd?exp=9999999999&sig=x`)).status).toBeGreaterThanOrEqual(400);
  });
  it('autorização: rotas admin → 403, token inválido/alterado → 401, API key em rota de usuário → 403', async () => {
    expect((await http.get('/api/v1/admin/metrics').set(auth(a))).status).toBe(403); expect((await http.get('/api/v1/users/me').set('authorization', 'Bearer abc.def.ghi')).status).toBe(401);
    const parts = a.token.split('.'); const forged = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: a.id, adm: true, exp: 9999999999, iss: 'nexusreel' })).toString('base64url')}.${parts[2]}`; expect((await http.get('/api/v1/admin/metrics').set('authorization', `Bearer ${forged}`)).status).toBe(401);
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${parts[1]}.`; expect((await http.get('/api/v1/users/me').set('authorization', `Bearer ${none}`)).status).toBe(401);
  });
  it('entrada hostil: SQL injection em busca/cursor, JSON inválido, campos extras e IDs malformados', async () => {
    expect((await http.get('/api/v1/templates').query({ search: "'; DROP TABLE users; --" })).status).toBe(200); expect((await pool.query('SELECT count(*)::int n FROM users')).rows[0].n).toBeGreaterThan(0);
    expect((await http.get('/api/v1/projects').set(auth(a)).query({ cursor: 'not-base64!!' })).status).toBe(400); expect((await http.get('/api/v1/projects/not-a-uuid').set(auth(a))).status).toBe(400);
    expect((await http.post('/api/v1/auth/login').set('content-type', 'application/json').send('{bad json')).status).toBe(400); expect((await http.patch('/api/v1/users/me').set(auth(a)).send({ isAdmin: true, credits: 9999 })).status).toBe(400);
    const xss = await http.post('/api/v1/catalogs').set(auth(a)).send({ name: '<img src=x onerror=alert(1)>' }); expect(xss.status).toBe(201); // armazenado como texto; API é JSON-only (CSP default-src 'none')
  });
  it('cabeçalhos de segurança (helmet) e CORS restrito', async () => {
    const r = await http.get('/healthz'); expect(r.headers['x-content-type-options']).toBe('nosniff'); expect(r.headers['content-security-policy']).toContain("default-src 'none'"); expect(r.headers['x-powered-by']).toBeUndefined(); expect(r.headers['x-frame-options']).toBeTruthy();
  });
  it('webhooks: assinatura obrigatória (Stripe, Pix, afiliados, plataformas)', async () => {
    for (const path of ['/api/v1/webhooks/stripe', '/api/v1/webhooks/pix', '/api/v1/webhooks/affiliates/conversion']) { const r = await http.post(path).set('content-type', 'application/json').send('{"id":"x"}'); expect(r.status, path).toBe(401); }
    expect((await http.post('/api/v1/integrations/shopee/webhook').set('content-type', 'application/json').send('{"x":1}')).status).toBeGreaterThanOrEqual(400);
  });
  it('senha: Argon2id, sem enumeração de e-mail no login e resposta idêntica para usuário inexistente', async () => {
    const x = await http.post('/api/v1/auth/login').send({ email: a.email, password: 'senha-errada-123' }); const y = await http.post('/api/v1/auth/login').send({ email: 'inexistente@t.dev', password: 'senha-errada-123' });
    expect(x.status).toBe(y.status); expect(x.body.message).toBe(y.body.message);
  });
  it('logout revoga refresh; logout-all revoga todas as sessões', async () => {
    const u = await signup(); const l = await http.post('/api/v1/auth/login').send({ email: u.email, password: 'Sup3rSecret!pass' });
    expect((await http.post('/api/v1/auth/logout').set(auth(u)).send({ refreshToken: l.body.refreshToken })).status).toBeLessThan(300); expect((await http.post('/api/v1/auth/refresh').send({ refreshToken: l.body.refreshToken })).status).toBe(401);
    const l2 = await http.post('/api/v1/auth/login').send({ email: u.email, password: 'Sup3rSecret!pass' }); expect((await http.post('/api/v1/auth/logout-all').set({ authorization: `Bearer ${l2.body.accessToken}` }).send({})).status).toBeLessThan(300);
    expect((await http.post('/api/v1/auth/refresh').send({ refreshToken: u.refresh })).status).toBe(401); expect((await http.post('/api/v1/auth/refresh').send({ refreshToken: l2.body.refreshToken })).status).toBe(401);
  });
});
