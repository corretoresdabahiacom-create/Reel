import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, pool, uniq } from './helpers.js';

beforeAll(() => boot()); afterAll(() => shutdown());

describe('1. Onboarding + LGPD + idioma', () => {
  it('registra, valida idade e aplica locale', async () => {
    const email = `${uniq()}@t.dev`;
    const minor = await http.post('/api/v1/auth/register').send({ email, password: 'Sup3rSecret!pass', name: 'Kid', birthDate: '2015-01-01' }); expect(minor.status).toBe(403);
    const ok = await http.post('/api/v1/auth/register').send({ email, password: 'Sup3rSecret!pass', name: 'Ana', locale: 'es', birthDate: '1995-05-05' });
    expect(ok.status).toBe(201); expect(ok.body.user).toMatchObject({ email, locale: 'es', plan: 'free' }); expect(ok.body.accessToken).toBeTruthy(); expect(ok.body.user.passwordHash).toBeUndefined();
    const dup = await http.post('/api/v1/auth/register').send({ email, password: 'Sup3rSecret!pass', name: 'Ana' }); expect(dup.status).toBe(409);
    const hash = (await pool.query('SELECT password_hash FROM users WHERE email=$1', [email])).rows[0].password_hash as string; expect(hash.startsWith('$argon2id$')).toBe(true);
  });
  it('rejeita senha fraca e login inválido, com lockout após falhas', async () => {
    expect((await http.post('/api/v1/auth/register').send({ email: `${uniq()}@t.dev`, password: 'curta', name: 'x' })).status).toBe(400);
    const s = await signup(); for (let i = 0; i < 6; i++) await http.post('/api/v1/auth/login').send({ email: s.email, password: 'errada-errada' });
    const l = await http.post('/api/v1/auth/login').send({ email: s.email, password: 'Sup3rSecret!pass' }); expect([423, 429]).toContain(l.status);
  });
  it('rotaciona refresh token e detecta reuso (revoga a família)', async () => {
    const s = await signup(); const r1 = await http.post('/api/v1/auth/refresh').send({ refreshToken: s.refresh }); expect(r1.status).toBe(200); expect(r1.body.refreshToken).not.toBe(s.refresh);
    const reuse = await http.post('/api/v1/auth/refresh').send({ refreshToken: s.refresh }); expect(reuse.status).toBe(401);
    const afterReuse = await http.post('/api/v1/auth/refresh').send({ refreshToken: r1.body.refreshToken }); expect(afterReuse.status).toBe(401);
  });
  it('login social (mock) cria e reaproveita usuário; magic link responde 202 sem vazar existência', async () => {
    const email = `${uniq()}@t.dev`; const a = await http.post('/api/v1/auth/oauth/google/callback').send({ code: `mock:${email}` }); expect(a.status).toBe(200);
    const b = await http.post('/api/v1/auth/oauth/google/callback').send({ code: `mock:${email}` }); expect(b.body.user.id).toBe(a.body.user.id);
    expect((await http.post('/api/v1/auth/magic-link').send({ email: 'nao-existe@t.dev' })).status).toBe(202);
  });
  it('rotas protegidas exigem token; /auth/me retorna o usuário', async () => {
    expect((await http.get('/api/v1/users/me')).status).toBe(401); const s = await signup(); const me = await http.get('/api/v1/users/me').set(auth(s)); expect(me.status).toBe(200); expect(me.body.id).toBe(s.id);
  });
  it('consentimentos versionados (cookies/IA/marketing) e PATCH de perfil', async () => {
    const s = await signup(); const c = await http.post('/api/v1/users/me/consents').set(auth(s)).send({ items: [{ type: 'cookies', accepted: true }, { type: 'ai', accepted: true }, { type: 'marketing', accepted: false }] }); expect(c.status).toBe(201);
    const list = await http.get('/api/v1/users/me/consents').set(auth(s)); expect(JSON.stringify(list.body)).toContain('cookies');
    const p = await http.patch('/api/v1/users/me').set(auth(s)).send({ locale: 'en', name: 'Novo Nome' }); expect(p.body).toMatchObject({ locale: 'en', name: 'Novo Nome' });
    expect((await http.patch('/api/v1/users/me').set(auth(s)).send({ plan: 'business' })).status).toBe(400); // mass-assignment bloqueado
  });
  it('TOTP: setup + verificação ativa 2FA', async () => {
    const s = await signup(); const setup = await http.post('/api/v1/auth/totp/setup').set(auth(s)); expect(setup.status).toBe(200); expect(setup.body.secret).toBeTruthy();
    const { totpAt } = await import('../src/utils/totp.js'); const code = totpAt(setup.body.secret);
    const v = await http.post('/api/v1/auth/totp/verify').set(auth(s)).send({ code }); expect(v.status).toBe(200);
    expect((await http.post('/api/v1/auth/login').send({ email: s.email, password: 'Sup3rSecret!pass' })).status).toBe(401); // pede TOTP
  });
});
