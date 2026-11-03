import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, redis, pool } from './helpers.js';
import { hit } from '../src/middlewares/rateLimit.js';
import { bucket, evaluate, isEnabled, setFlag, invalidateFlags, flagsFor, type FlagRow } from '../src/modules/flags.service.js';
import { newSecret, totpAt, verifyTotp } from '../src/utils/totp.js';
import { hashPassword, verifyPassword } from '../src/utils/password.js';
import { sha256, hmacHex, safeEqual, randomToken } from '../src/utils/crypto.js';
import { verifyStripeSignature, signStripe } from '../src/modules/payments/payments.service.js';
import { split, MARKETPLACE_FEE_PCT } from '../src/modules/marketplace/marketplace.service.js';
import { render } from '../src/modules/emails/email.service.js';
import { loadEnv } from '../src/config/env.js';
import { sniffMime } from '../src/providers/storage.js';
import { aiProvider } from '../src/providers/ai/router.js';
import { INTEGRATIONS } from '../src/integrations/index.js';
import { PLATFORMS } from '../src/utils/validate.js';
import { itemsFromCsv } from '../src/modules/b2b/b2b.service.js';
import { migrate } from '../src/db/migrate.js';

beforeAll(() => boot(false)); afterAll(() => shutdown());
const flag = (o: Partial<FlagRow> = {}): FlagRow => ({ key: 'k', description: '', enabled: true, rollout_percent: 100, regions: [], plans: [], updated_at: '', ...o });

describe('unit: segurança e utilidades', () => {
  it('Argon2id hash/verify', async () => { const h = await hashPassword('Segredo!12345'); expect(h).toMatch(/^\$argon2id\$/); expect(await verifyPassword(h, 'Segredo!12345')).toBe(true); expect(await verifyPassword(h, 'errada')).toBe(false); });
  it('TOTP RFC 6238 (vetor SHA1 do RFC) e janela ±1', () => { const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; expect(totpAt(secret, 59_000)).toBe('287082'); expect(totpAt(secret, 1111111109_000)).toBe('081804'); const s = newSecret(); const now = Date.now(); expect(verifyTotp(s, totpAt(s, now - 30_000), now)).toBe(true); expect(verifyTotp(s, totpAt(s, now - 120_000), now)).toBe(false); });
  it('crypto helpers', () => { expect(sha256('a')).toHaveLength(64); expect(hmacHex('k', 'd')).toHaveLength(64); expect(safeEqual('abc', 'abc')).toBe(true); expect(safeEqual('abc', 'abd')).toBe(false); expect(safeEqual('a', 'abc')).toBe(false); expect(randomToken()).not.toBe(randomToken()); });
  it('assinatura Stripe: válida, adulterada, expirada', () => { const raw = Buffer.from('{"a":1}'); const h = signStripe(raw.toString()); expect(verifyStripeSignature(raw, h)).toBe(true); expect(verifyStripeSignature(Buffer.from('{"a":2}'), h)).toBe(false); expect(verifyStripeSignature(raw, signStripe(raw.toString(), 'whsec_test', 1000))).toBe(false); expect(verifyStripeSignature(raw, 'lixo')).toBe(false); });
  it('sniff de MIME por magic bytes', () => { expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe('image/jpeg'); expect(sniffMime(Buffer.from('89504e470d0a1a0a00', 'hex'))).toBe('image/png'); expect(sniffMime(Buffer.from('RIFF0000WEBP'))).toBe('image/webp'); expect(sniffMime(Buffer.from('hello'))).toBeNull(); });
  it('docs/ANALYTICS_TAXONOMY.md é igual ao gerado da taxonomia em código (paridade)', async () => { const { renderTaxonomy } = await import('../scripts/gen-taxonomy-doc.js'); const { readFileSync } = await import('node:fs'); expect(readFileSync('docs/ANALYTICS_TAXONOMY.md', 'utf8')).toBe(renderTaxonomy()); });
  it('env: produção recusa segredos padrão de webhook, mock de pagamentos, admin sem 2FA e stubs não reconhecidos (auditoria P0)', () => {
    const strong = { NODE_ENV: 'production', JWT_SECRET: 'j'.repeat(48), DATA_ENCRYPTION_KEY: Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64'), STORAGE_DRIVER: 's3',
      ANALYTICS_PSEUDO_SALT: 'salt-analytics-0123456789', IP_HASH_SALT: 'salt-ip-0123456789abcdef', STRIPE_WEBHOOK_SECRET: 'whsec_live_0123456789abcdef', PIX_WEBHOOK_SECRET: 'pix-0123456789abcdef0123456789',
      AFFILIATE_WEBHOOK_SECRET: 'aff-0123456789abcdef0123456789', PAYMENTS_MODE: 'real', ADMIN_REQUIRE_TOTP: 'true', AI_VIDEO_PROVIDER: 'kling', AI_TTS_PROVIDER: 'elevenlabs', AI_MODERATION_PROVIDER: 'openai',
      PLATFORM_MODE: 'real', KYC_PROVIDER: 'persona', SANCTIONS_PROVIDER: 'opensanctions',
      CORS_ORIGINS: 'https://app.nexusreel.com', PUBLIC_API_URL: 'https://api.nexusreel.com' /* obrigatórios em produção desde a sessão em cookie (etapa 3; regra coberta no test 37) */ };
    expect(() => loadEnv(strong as never)).not.toThrow();
    const bad = (over: Record<string, string>, re: RegExp) => expect(() => loadEnv({ ...strong, ...over } as never)).toThrow(re);
    bad({ STRIPE_WEBHOOK_SECRET: 'whsec_test' }, /STRIPE_WEBHOOK_SECRET/); bad({ PIX_WEBHOOK_SECRET: 'change-me' }, /PIX_WEBHOOK_SECRET/); bad({ AFFILIATE_WEBHOOK_SECRET: 'change-me' }, /AFFILIATE_WEBHOOK_SECRET/);
    bad({ IP_HASH_SALT: 'change-me' }, /IP_HASH_SALT/); bad({ PAYMENTS_MODE: 'mock' }, /PAYMENTS_MODE=mock/); bad({ ADMIN_REQUIRE_TOTP: 'false' }, /ADMIN_REQUIRE_TOTP/);
    bad({ DATA_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64') }, /DATA_ENCRYPTION_KEY/); bad({ KYC_PROVIDER: 'stub' }, /KYC_PROVIDER=stub/);
    expect(() => loadEnv({ ...strong, KYC_PROVIDER: 'stub', ALLOW_STUBS_IN_PRODUCTION: 'true' } as never)).not.toThrow();
    expect(() => loadEnv({ ...strong, NODE_ENV: 'staging', STRIPE_WEBHOOK_SECRET: 'whsec_test', PAYMENTS_MODE: 'mock' } as never)).not.toThrow();
  });
  it('env: produção exige segredos fortes', () => { expect(() => loadEnv({ NODE_ENV: 'production', JWT_SECRET: 'x'.repeat(40), DATA_ENCRYPTION_KEY: 'a' } as never)).toThrow(); expect(() => loadEnv({ JWT_SECRET: 'curto', DATA_ENCRYPTION_KEY: 'a' } as never)).toThrow(/JWT_SECRET/); });
});
describe('unit: rate limit, flags, regras de negócio', () => {
  it('rate limit janela fixa', async () => { const k = `t-${Math.random()}`; const r = []; for (let i = 0; i < 5; i++) r.push((await hit(k, 3, 60)).ok); expect(r).toEqual([true, true, true, false, false]); });
  it('flags: kill switch, rollout determinístico, região e plano', () => {
    expect(evaluate(flag({ enabled: false }), {})).toBe(false); expect(evaluate(flag({ regions: ['EU'] }), { region: 'LATAM' })).toBe(false); expect(evaluate(flag({ regions: ['EU'] }), { region: 'EU' })).toBe(true); expect(evaluate(flag({ plans: ['pro'] }), { plan: 'free' })).toBe(false);
    const f = flag({ rollout_percent: 30 }); const on = Array.from({ length: 1000 }, (_, i) => evaluate(f, { userId: `u${i}` })).filter(Boolean).length; expect(on).toBeGreaterThan(220); expect(on).toBeLessThan(380); expect(evaluate(f, { userId: 'u7' })).toBe(evaluate(f, { userId: 'u7' })); expect(bucket('k', 'u1')).toBe(bucket('k', 'u1'));
  });
  it('flags persistidas: setFlag invalida cache; flagsFor expõe todas', async () => { await setFlag('00000000-0000-0000-0000-000000000000', 'dubbing_enabled', { enabled: false }).catch(() => undefined); await invalidateFlags(); expect(await isEnabled('dubbing_enabled', {})).toBe(false); await pool.query(`UPDATE feature_flags SET enabled=true WHERE key='dubbing_enabled'`); await invalidateFlags(); expect(await isEnabled('dubbing_enabled', {})).toBe(true); expect(Object.keys(await flagsFor({}))).toContain('generation_enabled'); expect(await isEnabled('flag_inexistente', {})).toBe(false); });
  it('marketplace: split 80/20 com arredondamento', () => { expect(MARKETPLACE_FEE_PCT).toBe(20); expect(split(10)).toEqual({ fee: 2, creator: 8 }); expect(split(3)).toEqual({ fee: 1, creator: 2 }); expect(split(0)).toEqual({ fee: 0, creator: 0 }); });
  it('e-mail: templates pt-BR/en e erro em template desconhecido', () => { expect(render({ to: 'a@b.c', template: 'welcome', locale: 'en', vars: { name: 'Ana' } }).subject).toBe('Welcome to NexusReel'); expect(render({ to: 'a@b.c', template: 'magic_link', vars: { link: 'L' } }).text).toContain('L'); expect(() => render({ to: 'a@b.c', template: 'zzz' })).toThrow(); });
  it('CSV: exige coluna de nome e limite de linhas', () => { expect(() => itemsFromCsv('sku,price\nA,1')).toThrow(); expect(() => itemsFromCsv('name\n' + Array.from({ length: 501 }, (_, i) => `p${i}`).join('\n'))).toThrow(/500/); expect(itemsFromCsv('Nome;Preço\nA;1,5')[0]).toMatchObject({ name: 'A', price: '1,5' }); });
});
describe('unit: provedores e integrações (regras da Fase 3)', () => {
  it('moderação mock bloqueia conteúdo proibido', async () => { expect((await aiProvider.moderateContent('Compre agora, produto incrível', [])).allowed).toBe(true); const r = await aiProvider.moderateContent('venda de arma ilegal e golpe de pirâmide', []); expect(r.allowed).toBe(false); });
  it('regras de validação por plataforma', () => {
    const v = (p: (typeof PLATFORMS)[number], vid: Record<string, number>, meta: Record<string, unknown> = { title: 'Título', caption: 'x', price: 10, listingId: 'MLB123456789' }) => INTEGRATIONS[p].publish.validate({ bytes: 5e6, durationSec: 30, width: 1080, height: 1920, ...vid }, meta);
    expect(v('tiktok', { bytes: 1.1e9 }).ok).toBe(false); expect(v('tiktok', {}).ok).toBe(true); expect(v('shopee', { bytes: 32e6 }).ok).toBe(false); expect(v('shopee', { durationSec: 61 }).ok).toBe(false); expect(v('temu', { width: 400, height: 300 }).ok).toBe(false);
    expect(v('mercadolivre', { durationSec: 9 }).ok).toBe(false); expect(v('mercadolivre', { durationSec: 62 }).ok).toBe(false); expect(v('mercadolivre', { bytes: 300e6 }).ok).toBe(false); expect(v('mercadolivre', {}).ok).toBe(true); expect(v('mercadolivre', {}, { title: 'x' }).ok).toBe(false);
    expect(v('youtube', { durationSec: 61 }).ok).toBe(false); expect(v('instagram', { durationSec: 91 }).ok).toBe(false); expect(v('olx', {}, { title: 'ab' }).ok).toBe(false);
  });
  it('as 7 plataformas expõem oauth e publish', () => { for (const p of PLATFORMS) { expect(INTEGRATIONS[p].oauth).toBeTruthy(); expect(INTEGRATIONS[p].publish.rules.maxSec).toBeGreaterThan(0); } });
  it('circuit breaker de IA abre após 3 falhas e fecha após TTL (Redis)', async () => { const { breakerOpen } = await import('../src/providers/ai/router.js'); await redis.del('cb:open:testprov', 'cb:fail:testprov'); expect(await breakerOpen('testprov')).toBe(false); await redis.set('cb:open:testprov', '1', 'EX', 600); expect(await breakerOpen('testprov')).toBe(true); await redis.del('cb:open:testprov'); });
  it('migrações: status lista aplicadas; dry-run não altera', async () => { const log = await migrate(process.env.DATABASE_URL!, 'status'); expect(log.join('\n')).toContain('0001_init'); expect(await migrate(process.env.DATABASE_URL!, 'dry')).toEqual([]); });
});

describe('retenção (docs/RETENTION.md)', () => {
  it('expurga logs/analytics/webhooks/cliques vencidos e preserva os recentes', async () => {
    const { runRetention } = await import('../src/jobs/retention.js');
    await pool.query(`INSERT INTO analytics_events (name, created_at) VALUES ('old', now() - interval '181 days'), ('new', now() - interval '1 day')`);
    await pool.query(`INSERT INTO webhook_events (provider, event_id, event_type, payload, created_at) VALUES ('t','old-1','x','{}', now() - interval '61 days'), ('t','new-1','x','{}', now())`);
    const r = await runRetention(); expect(r.analytics).toBeGreaterThanOrEqual(1); expect(r.webhooks).toBeGreaterThanOrEqual(1);
    expect((await pool.query(`SELECT name FROM analytics_events WHERE name IN ('old','new')`)).rows.map((x) => x.name)).toEqual(['new']); expect((await pool.query(`SELECT event_id FROM webhook_events WHERE provider='t'`)).rows.map((x) => x.event_id)).toEqual(['new-1']);
  });
});

describe('analytics: detector de PII não descarta eventos por causa de UUID', async () => {
  const { piiProblem } = await import('../src/modules/analytics/taxonomy.js');
  it('UUID com trechos numéricos longos passa (antes era tomado por telefone e o evento sumia); telefone/CPF/e-mail continuam bloqueados', () => {
    for (const id of ['11112222-3333-4444-5555-666677778888', 'e631ce70-81d0-4735-8812-345678901234']) expect(piiProblem({ project_id: id }), id).toBeNull();
    expect(piiProblem({ ref: '+55 11 98765-4321' })).toMatch(/PII/); expect(piiProblem({ ref: '123.456.789-09' })).toMatch(/PII/); expect(piiProblem({ ref: 'a@b.com' })).toMatch(/PII/);
    expect(piiProblem({ ref: '11112222-3333-4444-5555-666677778888 +55 11 98765-4321' })).toMatch(/PII/);
  });
});
