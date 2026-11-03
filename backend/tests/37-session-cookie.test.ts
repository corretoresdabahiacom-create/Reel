import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, http, uniq } from './helpers.js';
import { loadEnv, productionProblems, siteOf } from '../src/config/env.js';
import { readCookies, serializeCookie } from '../src/utils/cookies.js';

/**
 * P0-1 etapa 3 — sessão do navegador em cookie httpOnly (docs/RFC/2026-10-session-cookie.md).
 * Modo cookie só com `X-Session-Mode: cookie`; sem ele, o contrato de sempre (app nativo, B2B, testes antigos).
 */
const PW = 'Sup3rSecret!pass';
type Res = { headers: Record<string, unknown>; body: Record<string, unknown>; status: number };
const setCookies = (r: Res) => ([] as string[]).concat((r.headers['set-cookie'] as string[] | string | undefined) ?? []);
const cookieOf = (r: Res, name: string) => setCookies(r).find((c) => c.startsWith(`${name}=`));
const valueOf = (c?: string) => (c ? decodeURIComponent(c.split(';')[0]!.split('=')[1]!) : '');
const jar = (r: Res) => setCookies(r).map((c) => c.split(';')[0]).join('; ');
let email = '';

beforeAll(async () => { await boot(false); email = `${uniq('ck')}@test.dev`; expect((await http.post('/api/v1/auth/register').send({ email, password: PW, name: 'Cookie', birthDate: '1990-01-01' })).status).toBe(201); });
afterAll(async () => { await shutdown(); });

describe('Sessão em cookie httpOnly (etapa 3)', () => {
  it('sem X-Session-Mode: nada muda — refresh no corpo, nenhum cookie', async () => {
    const r = await http.post('/api/v1/auth/login').send({ email, password: PW }) as unknown as Res;
    expect(r.status).toBe(200); expect(typeof r.body.refreshToken).toBe('string'); expect(r.body.csrfToken).toBeUndefined(); expect(setCookies(r)).toEqual([]);
  });
  it('modo cookie: refresh vai para nx_rt (HttpOnly, Secure, SameSite=Strict, Path=/api/v1/auth) e sai do corpo; corpo traz csrfToken', async () => {
    const r = await http.post('/api/v1/auth/login').set('x-session-mode', 'cookie').send({ email, password: PW }) as unknown as Res;
    expect(r.status).toBe(200); expect(r.body.refreshToken).toBeUndefined(); expect(typeof r.body.accessToken).toBe('string'); expect(String(r.body.csrfToken)).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(r.headers['cache-control']).toBe('no-store');
    const rt = cookieOf(r, 'nx_rt')!; const cs = cookieOf(r, 'nx_csrf')!;
    for (const c of [rt, cs]) { expect(c).toContain('HttpOnly'); expect(c).toContain('Secure'); expect(c).toContain('SameSite=Strict'); expect(c).toContain('Path=/api/v1/auth'); expect(c).toMatch(/Max-Age=2592000/); }
    expect(valueOf(cs)).toBe(r.body.csrfToken); expect(valueOf(rt).length).toBeGreaterThan(20);
  });
  it('refresh pelo cookie exige X-CSRF-Token igual ao cookie; gira refresh e CSRF; o refresh antigo vira reuso (família revogada)', async () => {
    const l = await http.post('/api/v1/auth/login').set('x-session-mode', 'cookie').send({ email, password: PW }) as unknown as Res; const c1 = jar(l); const csrf1 = String(l.body.csrfToken);
    const noHdr = await http.post('/api/v1/auth/refresh').set('cookie', c1).send({}); expect(noHdr.status).toBe(403); expect(noHdr.body.code).toBe('csrf_failed');
    const wrong = await http.post('/api/v1/auth/refresh').set('cookie', c1).set('x-csrf-token', 'x'.repeat(32)).send(); expect(wrong.status).toBe(403);
    const ok = await http.post('/api/v1/auth/refresh').set('cookie', c1).set('x-csrf-token', csrf1).send() as unknown as Res;
    expect(ok.status).toBe(200); expect(ok.body.refreshToken).toBeUndefined(); expect(typeof ok.body.accessToken).toBe('string');
    expect(valueOf(cookieOf(ok, 'nx_rt'))).not.toBe(valueOf(cookieOf(l, 'nx_rt'))); expect(ok.body.csrfToken).not.toBe(csrf1);
    const me = await http.get('/api/v1/auth/me').set('authorization', `Bearer ${String(ok.body.accessToken)}`); expect(me.status).toBe(200); expect(me.body.email).toBe(email);
    const reuse = await http.post('/api/v1/auth/refresh').set('cookie', c1).set('x-csrf-token', csrf1).send(); expect(reuse.status).toBe(401); // refresh antigo: reuso
    const after = await http.post('/api/v1/auth/refresh').set('cookie', jar(ok)).set('x-csrf-token', String(ok.body.csrfToken)).send(); expect(after.status).toBe(401); // família revogada
  });
  it('CSRF de outro login não serve (double-submit amarrado ao cookie)', async () => {
    const a = await http.post('/api/v1/auth/login').set('x-session-mode', 'cookie').send({ email, password: PW }) as unknown as Res;
    const b = await http.post('/api/v1/auth/login').set('x-session-mode', 'cookie').send({ email, password: PW }) as unknown as Res;
    expect((await http.post('/api/v1/auth/refresh').set('cookie', jar(a)).set('x-csrf-token', String(b.body.csrfToken)).send()).status).toBe(403);
  });
  it('logout pelo cookie revoga e apaga os cookies (Max-Age=0); depois, refresh 401; sem cookie, 401', async () => {
    const l = await http.post('/api/v1/auth/login').set('x-session-mode', 'cookie').send({ email, password: PW }) as unknown as Res;
    const out = await http.post('/api/v1/auth/logout').set('cookie', jar(l)).set('x-csrf-token', String(l.body.csrfToken)).send() as unknown as Res;
    expect(out.status).toBe(204); for (const n of ['nx_rt', 'nx_csrf']) expect(cookieOf(out, n)).toMatch(/Max-Age=0/);
    expect((await http.post('/api/v1/auth/refresh').set('cookie', jar(l)).set('x-csrf-token', String(l.body.csrfToken)).send()).status).toBe(401);
    expect((await http.post('/api/v1/auth/refresh').send({})).status).toBe(401);
  });
  it('registro e refresh pelo corpo também aceitam o modo cookie; refresh pelo corpo sem o cabeçalho segue igual', async () => {
    const e2 = `${uniq('ck2')}@test.dev`;
    const reg = await http.post('/api/v1/auth/register').set('x-session-mode', 'cookie').send({ email: e2, password: PW, name: 'C2', birthDate: '1990-01-01' }) as unknown as Res;
    expect(reg.status).toBe(201); expect(reg.body.refreshToken).toBeUndefined(); expect(cookieOf(reg, 'nx_rt')).toBeTruthy();
    const l = await http.post('/api/v1/auth/login').send({ email: e2, password: PW }); const r = await http.post('/api/v1/auth/refresh').send({ refreshToken: l.body.refreshToken });
    expect(r.status).toBe(200); expect(typeof r.body.refreshToken).toBe('string');
  });
  it('deploy: produção recusa front em OUTRO site que a API (o cookie Strict não iria — provado em Chromium real)', () => {
    expect(siteOf('https://app.nexusreel.com')).toBe('nexusreel.com'); expect(siteOf('https://api.nexusreel.com.br')).toBe('nexusreel.com.br'); expect(siteOf('http://localhost:5173')).toBe('localhost');
    const env = (o: Record<string, string>) => loadEnv({ ...process.env, NODE_ENV: 'test', ...o });
    expect(productionProblems(env({ CORS_ORIGINS: 'https://app.nexusreel.com', PUBLIC_API_URL: 'https://api.nexusreel.com' })).filter((x) => /site/.test(x))).toEqual([]);
    expect(productionProblems(env({ CORS_ORIGINS: 'https://nexusreel.app', PUBLIC_API_URL: 'https://api.nexusreel.com' })).join(' ')).toMatch(/outro site/);
    expect(productionProblems(env({ CORS_ORIGINS: 'https://app.nexusreel.com', PUBLIC_API_URL: '' })).join(' ')).toMatch(/PUBLIC_API_URL ausente/);
  });
  it('produção recusa cookie sem Secure; utilitários de cookie são estritos', () => {
    const base = { ...process.env, NODE_ENV: 'production' };
    expect(() => loadEnv({ ...base, SESSION_COOKIE_SECURE: 'false' })).toThrow(/SESSION_COOKIE_SECURE=false/);
    expect(productionProblems(loadEnv({ ...process.env, NODE_ENV: 'test', SESSION_COOKIE_SECURE: 'false' }))).toContain('SESSION_COOKIE_SECURE=false (cookie de sessão sem Secure)');
    expect(readCookies('a=1; nx_rt=abc%3D; bad name=x; nx_rt=segundo')).toEqual({ a: '1', nx_rt: 'abc=' });
    expect(() => serializeCookie('x;y', 'v', { maxAgeSec: 1, path: '/', secure: true })).toThrow();
    expect(serializeCookie('nx_rt', 'v', { maxAgeSec: 10, path: '/api/v1/auth', secure: true })).toBe('nx_rt=v; Max-Age=10; Path=/api/v1/auth; HttpOnly; Secure; SameSite=Strict');
  });
});
