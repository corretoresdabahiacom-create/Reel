import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSign } from 'node:crypto';
import { boot, shutdown, http, pool, auth, signup } from './helpers.js';
import { env, productionProblems, loadEnv, type Env } from '../src/config/env.js';
import { __setFirebaseCertSource } from '../src/modules/auth/firebase.js';

/**
 * Instalação gratuita: login com Firebase Authentication (ID token conferido pelo backend) e APP_PROFILE=free.
 * Tokens assinados aqui com um par de chaves + certificado X.509 gerados no teste, no mesmo formato do Google
 * (RS256, kid → certificado PEM). O teste com o Firebase de verdade é o do navegador com o emulador oficial.
 */
const PROJECT = 'nexusreel-teste';
let dir: string; let keyPem: string; let certPem: string; let otherKey: string;
const saved: Partial<Env> = {};
const set = (o: Partial<Env>) => { for (const [k, v] of Object.entries(o)) { (saved as Record<string, unknown>)[k] ??= (env as Record<string, unknown>)[k]; (env as Record<string, unknown>)[k] = v; } };
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function token(claims: Record<string, unknown>, o: { kid?: string; key?: string; alg?: string } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = { iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, auth_time: now - 10, iat: now - 10, exp: now + 3600, sub: 'uid-1', email: 'fb@test.dev', email_verified: true, firebase: { sign_in_provider: 'password' }, ...claims };
  const h = b64u(JSON.stringify({ alg: o.alg ?? 'RS256', kid: o.kid ?? 'k1', typ: 'JWT' })); const p = b64u(JSON.stringify(body));
  if ((o.alg ?? 'RS256') === 'none') return `${h}.${p}.`;
  return `${h}.${p}.${b64u(createSign('RSA-SHA256').update(`${h}.${p}`).sign(o.key ?? keyPem))}`;
}
const login = (idToken: string, headers: Record<string, string> = {}) => http.post('/api/v1/auth/firebase').set(headers).send({ idToken, locale: 'pt-BR' });

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'fbcert-'));
  for (const n of ['a', 'b']) spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, `${n}.key`), '-out', join(dir, `${n}.crt`), '-days', '1', '-subj', '/CN=securetoken'], { stdio: 'ignore' });
  keyPem = readFileSync(join(dir, 'a.key'), 'utf8'); certPem = readFileSync(join(dir, 'a.crt'), 'utf8'); otherKey = readFileSync(join(dir, 'b.key'), 'utf8');
  __setFirebaseCertSource(async () => ({ certs: { k1: certPem }, maxAgeSec: 3600 }));
  await boot(false);
});
afterAll(async () => { for (const [k, v] of Object.entries(saved)) (env as Record<string, unknown>)[k] = v; await shutdown(); rmSync(dir, { recursive: true, force: true }); });

describe('login com Firebase', () => {
  it('desligado sem FIREBASE_PROJECT_ID → 404 com mensagem', async () => {
    set({ FIREBASE_PROJECT_ID: '' });
    const r = await login(token({})); expect(r.status).toBe(404); expect(r.body.message).toMatch(/Firebase/);
    set({ FIREBASE_PROJECT_ID: PROJECT });
  });

  it('token válido → sessão do app; mesmo uid volta para a mesma conta; vínculo em auth_identities', async () => {
    const email = `fb-${Date.now()}@test.dev`;
    const r1 = await login(token({ sub: `uid-${email}`, email, name: 'Fulana' })); expect(r1.status).toBe(200); expect(r1.body.accessToken).toBeTruthy();
    const me = await http.get('/api/v1/users/me').set({ authorization: `Bearer ${r1.body.accessToken}` }); expect(me.body.email).toBe(email);
    const r2 = await login(token({ sub: `uid-${email}`, email })); expect(r2.status).toBe(200);
    const me2 = await http.get('/api/v1/users/me').set({ authorization: `Bearer ${r2.body.accessToken}` }); expect(me2.body.id).toBe(me.body.id);
    expect((await pool.query(`SELECT 1 FROM auth_identities WHERE provider='firebase' AND provider_user_id=$1 AND user_id=$2`, [`uid-${email}`, me.body.id])).rowCount).toBe(1);
  });

  it('e-mail já cadastrado (senha) + Firebase com o mesmo e-mail verificado → mesma conta', async () => {
    const s = await signup();
    const r = await login(token({ sub: `uid-link-${s.id}`, email: s.email })); expect(r.status).toBe(200);
    const me = await http.get('/api/v1/users/me').set({ authorization: `Bearer ${r.body.accessToken}` }); expect(me.body.id).toBe(s.id);
  });

  it('recusa: e-mail não verificado (403), assinatura de outra chave, projeto/emissor errado, expirado, kid desconhecido, sem assinatura (401)', async () => {
    const un = await login(token({ sub: 'u-unv', email: 'unv@test.dev', email_verified: false })); expect(un.status).toBe(403); expect(un.body.message).toMatch(/Confirme seu e-mail/);
    expect((await login(token({ sub: 'u-x' }, { key: otherKey }))).status).toBe(401);
    expect((await login(token({ sub: 'u-x', aud: 'outro-projeto' }))).status).toBe(401);
    expect((await login(token({ sub: 'u-x', iss: 'https://securetoken.google.com/outro' }))).status).toBe(401);
    expect((await login(token({ sub: 'u-x', exp: Math.floor(Date.now() / 1000) - 60 }))).status).toBe(401);
    expect((await login(token({ sub: 'u-x' }, { kid: 'desconhecido' }))).status).toBe(401);
    expect((await login(token({ sub: 'u-x' }, { alg: 'none' }))).status).toBe(401); // fora do emulador
    const t = token({ sub: 'u-x' }); const [h, , sg] = t.split('.'); const forged = `${h}.${b64u(JSON.stringify({ ...JSON.parse(Buffer.from(t.split('.')[1]!, 'base64').toString()), email: 'vitima@test.dev' }))}.${sg}`;
    expect((await login(forged)).status).toBe(401); // trocar o e-mail invalida a assinatura
    const en = await login(token({ sub: 'u-x', aud: 'x' }), { 'accept-language': 'en' }); expect(en.body.message).toMatch(/could not confirm/);
  });

  it('emulador local (só fora de produção) aceita token sem assinatura', async () => {
    set({ FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' });
    const r = await login(token({ sub: 'u-emu', email: `emu-${Date.now()}@test.dev` }, { alg: 'none' })); expect(r.status).toBe(200);
    set({ FIREBASE_AUTH_EMULATOR_HOST: '' });
  });

  it('modo cookie do navegador funciona igual (nx_rt httpOnly + csrfToken)', async () => {
    const r = await login(token({ sub: `uid-ck-${Date.now()}`, email: `ck-${Date.now()}@test.dev` }), { 'x-session-mode': 'cookie' });
    expect(r.status).toBe(200); expect(r.body.csrfToken).toBeTruthy(); expect(r.body.refreshToken).toBeUndefined();
    expect(String(r.headers['set-cookie'])).toMatch(/nx_rt=.*HttpOnly/);
  });
});

describe('perfil gratuito (APP_PROFILE=free)', () => {
  const base = (o: Partial<Env>): Env => ({ ...env, NODE_ENV: 'production', ...o } as Env);
  it('produção gratuita aceita IA simulada, arquivos no disco e sem pagamentos; continua exigindo segurança', () => {
    const free = { APP_PROFILE: 'free', PAYMENTS_MODE: 'off', STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: '/data/storage', AI_VIDEO_PROVIDER: 'mock', AI_TTS_PROVIDER: 'mock', KYC_PROVIDER: 'stub', ALLOW_STUBS_IN_PRODUCTION: false, C2PA_SIGNER: 'none' } as Partial<Env>;
    const p = productionProblems(base(free)).join(' | ');
    expect(p).not.toMatch(/STORAGE_DRIVER=local|stubs em produção|PAYMENTS_MODE|STRIPE_WEBHOOK_SECRET|PIX_WEBHOOK_SECRET/);
    expect(p).toMatch(/JWT_SECRET|DATA_ENCRYPTION_KEY|CORS_ORIGINS|SESSION_COOKIE_SECURE|ADMIN_REQUIRE_TOTP|DB_APP_ROLE/); // segurança continua
  });
  it('perfil gratuito recusa pagamentos simulados/reais, disco relativo, emulador do Firebase e C2PA local sem chave', () => {
    const p = (o: Partial<Env>) => productionProblems(base({ APP_PROFILE: 'free', PAYMENTS_MODE: 'off', LOCAL_STORAGE_DIR: '/data', ...o } as Partial<Env>)).join(' | ');
    expect(p({ PAYMENTS_MODE: 'mock' })).toMatch(/exige PAYMENTS_MODE=off/);
    expect(p({ PAYMENTS_MODE: 'real' })).toMatch(/exige PAYMENTS_MODE=off/);
    expect(p({ STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: './.storage' })).toMatch(/caminho absoluto/);
    expect(p({ FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099' })).toMatch(/FIREBASE_AUTH_EMULATOR_HOST em produção/);
    expect(p({ C2PA_SIGNER: 'local', C2PA_PRIVATE_KEY_PEM_B64: '' })).toMatch(/C2PA_SIGNER=local exige/);
  });
  it('perfil padrão continua recusando disco local e stubs sem reconhecimento (nada afrouxou fora do gratuito)', () => {
    const p = productionProblems(base({ APP_PROFILE: 'standard', STORAGE_DRIVER: 'local', AI_VIDEO_PROVIDER: 'mock', ALLOW_STUBS_IN_PRODUCTION: false } as Partial<Env>)).join(' | ');
    expect(p).toMatch(/STORAGE_DRIVER=local/); expect(p).toMatch(/stubs em produção/);
  });
  it('docker-compose.free.yml + segredos gerados → produção sem nenhum problema de configuração (compose e regras não divergem)', async () => {
    const { parse } = await import('yaml');
    const fe = (parse(readFileSync('docker-compose.free.yml', 'utf8')) as { 'x-free-env': Record<string, string> })['x-free-env'];
    const secrets = Object.fromEntries(spawnSync('bash', ['infra/free/gen-secrets.sh'], { encoding: 'utf8' }).stdout.trim().split('\n').map((l) => l.split(/=(.*)/s).slice(0, 2)));
    const sub = (v: string) => String(v).replace(/\$\{(\w+)(?::[?-][^}]*)?\}/g, (_, k: string) => ({ ...secrets, SITE_DOMAIN: 'app.exemplo.dev', FIREBASE_PROJECT_ID: '' } as Record<string, string>)[k] ?? '');
    const raw = Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, sub(v)]));
    const parsed = loadEnv(raw); // o mesmo teste da subida: lança se houver qualquer problema de produção
    expect(productionProblems(parsed)).toEqual([]);
    expect(parsed.APP_PROFILE).toBe('free'); expect(parsed.PAYMENTS_MODE).toBe('off'); expect(parsed.AI_TTS_PROVIDER).toBe('open'); expect(parsed.AI_MUSIC_PROVIDER).toBe('composer');
  });
  it('PAYMENTS_MODE=off: checkout, Pix, saque e webhooks respondem 503 com mensagem; catálogo continua', async () => {
    set({ PAYMENTS_MODE: 'off' }); const s = await signup();
    const r = await http.post('/api/v1/billing/checkout/credits').set(auth(s)).set('idempotency-key', `k-${Date.now()}`).send({ packId: 'p100' });
    expect(r.status).toBe(503); expect(r.body.code).toBe('payments_disabled'); expect(r.body.message).toMatch(/Pagamentos desativados/);
    expect((await http.post('/api/v1/billing/pix').set(auth(s)).set('idempotency-key', `k2-${Date.now()}`).set('accept-language', 'en').send({ packId: 'p100' })).body.message).toMatch(/disabled/);
    expect((await http.post('/api/v1/webhooks/stripe').send({})).status).toBe(503);
    expect((await http.get('/api/v1/billing/catalog')).status).toBe(200);
    set({ PAYMENTS_MODE: 'mock' });
  });
});
