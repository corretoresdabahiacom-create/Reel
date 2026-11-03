import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, missingKeys, detectLocale, direction, formatCurrency, formatDate } from '../src/services/i18n';
import { priceFor } from '../src/services/i18n/format';
import { withRetry, CircuitBreaker, CircuitOpenError, withFallback } from '../src/services/resilience/retry';
import { isEnabled, bucket } from '../src/services/flags/featureFlags';
import { getVariant, EXPERIMENTS } from '../src/services/ab/testing';
import { log, redact, setSinks } from '../src/services/observability/logger';
import { MemoryMetrics } from '../src/services/observability/metrics';
import { startSpan, endSpan, toTraceparent, fromTraceparent } from '../src/services/observability/tracing';
import { registerConsent, getConsent, revokeConsent, hasAll, CONSENT_VERSION } from '../src/services/security/consent';
import { requestExport, requestDeletion, cancelDeletion, processDueDeletions, getDeletionStatus, type RightsDb } from '../src/services/security/dataRights';
import { encryptToken, decryptToken } from '../src/services/security/crypto';
import { RateLimiter } from '../src/services/security/rateLimit';
import { dubVideo, detectLanguage, generateSubtitles, CREDITS_PER_LANGUAGE } from '../src/services/localization/dubbing';
import { getSignedUrl, verifySignedUrl, getHlsManifest, getThumbnails, CACHE_CONTROL } from '../src/services/cdn/videoDelivery';
import type { FeatureFlag, Locale } from '../src/types/phase5';

const noSleep = async () => {};
test('i18n: todos os idiomas têm as mesmas chaves e interpolação/plural/gênero funcionam', () => {
  assert.deepEqual(missingKeys('en'), []); assert.deepEqual(missingKeys('es'), []);
  assert.equal(translate('en', 'set.language.changed', { lang: 'English' }), 'Language changed to English');
  assert.match(translate('pt-BR', 'off.banner', { count: 1 }), /1 ação pendente/);
  assert.match(translate('pt-BR', 'off.banner', { count: 3 }), /3 ações pendentes/);
  assert.match(translate('es', 'off.banner', { count: 0 }), /sin conexión/);
  assert.equal(translate('pt-BR', 'profile.welcome', { name: 'Ana', context: 'female' }), 'Bem-vinda, Ana');
  assert.equal(translate('pt-BR', 'chave.inexistente'), 'chave.inexistente');
});
test('i18n: detecção de idioma, direção e formatação Intl', () => {
  assert.equal(detectLocale(['es-MX', 'en']), 'es'); assert.equal(detectLocale(['fr-FR']), 'pt-BR'); assert.equal(detectLocale(['en-GB']), 'en');
  assert.equal(direction('ar'), 'rtl'); assert.equal(direction('pt-BR'), 'ltr');
  assert.match(formatCurrency(4900, 'pt-BR', 'BRL'), /R\$\s?49,00/); assert.match(formatCurrency(4900, 'en', 'USD'), /\$49\.00/);
  assert.ok(formatDate('2026-10-20T12:00:00Z', 'en').includes('2026'));
  const eu = priceFor('pro', 'EU', 'es'); assert.equal(eu.currency, 'EUR'); assert.ok(eu.tax > 0 && eu.total === eu.net + eu.tax);
});
test('retry: backoff exponencial e respeita shouldRetry', async () => {
  const delays: number[] = []; let n = 0;
  const r = await withRetry(async () => { if (++n < 3) throw new Error('x'); return 'ok'; }, { retries: 3, baseDelayMs: 100, jitter: false, sleep: async (ms) => { delays.push(ms); } });
  assert.equal(r, 'ok'); assert.deepEqual(delays, [100, 200]);
  await assert.rejects(withRetry(async () => { throw new Error('fatal'); }, { retries: 3, shouldRetry: () => false, sleep: noSleep }), /fatal/);
});
test('circuit breaker: abre após falhas, half-open após o tempo e fecha com sucesso; fallback degrada', async () => {
  let t = 0; const b = new CircuitBreaker('x', { failureThreshold: 2, openMs: 1000, now: () => t });
  const bad = () => b.exec(async () => { throw new Error('boom'); });
  await assert.rejects(bad(), /boom/); await assert.rejects(bad(), /boom/); assert.equal(b.state, 'open');
  await assert.rejects(b.exec(async () => 1), CircuitOpenError);
  t = 1500; assert.equal(b.state, 'half_open'); assert.equal(await b.exec(async () => 'ok'), 'ok'); assert.equal(b.state, 'closed');
  const r = await withFallback('fb', async () => { throw new Error('down'); }, async () => 'cached'); assert.deepEqual(r, { value: 'cached', degraded: true });
});
test('feature flags: kill switch, região, plano e rollout estável', () => {
  const mk = (o: Partial<FeatureFlag>): FeatureFlag => ({ key: 'k', description: '', enabled: true, rolloutPercent: 100, updatedAt: '', updatedBy: 't', ...o });
  const ctx = { userId: 'u1', region: 'LATAM' as const, plan: 'free' as const };
  assert.equal(isEnabled([mk({ enabled: false })], 'k', ctx), false);
  assert.equal(isEnabled([mk({ regions: ['EU'] })], 'k', ctx), false);
  assert.equal(isEnabled([mk({ plans: ['pro'] })], 'k', ctx), false);
  assert.equal(isEnabled([], 'desconhecida', ctx), true);
  assert.equal(bucket('u1', 'k'), bucket('u1', 'k'));
  const on = Array.from({ length: 1000 }, (_, i) => isEnabled([mk({ rolloutPercent: 30 })], 'k', { ...ctx, userId: 'user' + i })).filter(Boolean).length;
  assert.ok(on > 230 && on < 370, 'rollout ~30%: ' + on);
});
test('A/B: determinístico e respeita pesos', () => {
  const e = EXPERIMENTS[0]; assert.equal(getVariant(e, 'u9'), getVariant(e, 'u9'));
  const c = Array.from({ length: 1000 }, (_, i) => getVariant(e, 'x' + i)).filter((v) => v === 'trial').length; assert.ok(c > 400 && c < 600);
});
test('observabilidade: logs sem PII/tokens, métricas e traceparent', () => {
  const got: unknown[] = []; setSinks([{ write: (e) => got.push(e) }]);
  const e = log('info', 'publish', { traceId: 't1', userId: 'u1', provider: 'tiktok', status: 'ok', latencyMs: 12, accessToken: 'abc', note: 'fale com ana@x.com Bearer abc.def', cpf: '123.456.789-09' });
  const s = JSON.stringify(e); assert.ok(!s.includes('abc') && !s.includes('ana@x.com') && !s.includes('123.456'));
  assert.equal((redact({ password: 'x', ok: 1 }) as any).password, '[redigido]');
  const m = new MemoryMetrics(); [10, 20, 30, 40, 100].forEach((v) => m.histogram('generation_duration_ms', v)); assert.equal(m.percentile('generation_duration_ms', 50), 30);
  m.increment('generation_failures_total'); m.increment('generation_failures_total'); assert.equal([...m.counters.values()][0], 2);
  const sp = startSpan('generation'); endSpan(sp); assert.deepEqual(fromTraceparent(toTraceparent(sp)), { traceId: sp.traceId, spanId: sp.spanId });
});
test('LGPD: consentimento granular versionado, revogação e direitos do titular', () => {
  const db = { records: [] }; registerConsent(db, 'u1', ['terms', 'ai', 'cookies']);
  assert.equal(getConsent(db, 'u1', 'ai')?.version, CONSENT_VERSION); assert.ok(hasAll(db, 'u1', ['terms', 'ai']));
  revokeConsent(db, 'u1', 'ai'); assert.equal(getConsent(db, 'u1', 'ai'), undefined); assert.throws(() => revokeConsent(db, 'u1', 'terms'));
  const purged: string[] = [];
  const r: RightsDb = { exports: [], deletions: [], audit: [], collect: () => ({ name: 'Ana', accessToken: 'segredo', nested: { refresh_token: 'x', ok: 1 } }), purge: (id) => purged.push(id) };
  const { json } = requestExport(r, 'u1'); assert.ok(!json.includes('segredo') && !json.includes('refresh_token') && json.includes('Ana'));
  const t0 = new Date('2026-10-20T00:00:00Z'); const d = requestDeletion(r, 'u1', t0);
  assert.equal(d.scheduledFor, '2026-11-19T00:00:00.000Z'); assert.equal(requestDeletion(r, 'u1', t0).id, d.id);
  assert.equal(processDueDeletions(r, new Date('2026-11-01T00:00:00Z')), 0);
  assert.ok(cancelDeletion(r, 'u1')); assert.equal(getDeletionStatus(r, 'u1').status, 'cancelled');
  requestDeletion(r, 'u1', t0); assert.equal(processDueDeletions(r, new Date('2026-11-20T00:00:00Z')), 1); assert.deepEqual(purged, ['u1']);
  assert.ok(r.audit.some((a) => a.action === 'account.hard_deleted'));
});
test('crypto: AES-256-GCM ida e volta, falha com chave errada ou payload adulterado', () => {
  const key = Buffer.alloc(32, 7).toString('base64'); const enc = encryptToken('tok_123', key);
  assert.ok(!enc.includes('tok_123')); assert.equal(decryptToken(enc, key), 'tok_123');
  assert.throws(() => decryptToken(enc, Buffer.alloc(32, 8).toString('base64')));
  const parts = enc.split('.'); parts[3] = Buffer.from('xxxxxxx').toString('base64'); assert.throws(() => decryptToken(parts.join('.'), key));
  assert.throws(() => encryptToken('a', Buffer.alloc(8).toString('base64')));
});
test('rate limit: janela deslizante', () => {
  let t = 0; const rl = new RateLimiter(() => t);
  assert.ok(rl.take('a', 2, 1000)); assert.ok(rl.take('a', 2, 1000)); assert.equal(rl.take('a', 2, 1000), false); t = 1001; assert.ok(rl.take('a', 2, 1000));
});
test('dublagem: 3 idiomas em paralelo, falha isolada e legendas WebVTT', async () => {
  assert.equal(detectLanguage('Conheça o melhor produto para você'), 'pt-BR'); assert.equal(detectLanguage('This is the best product for you and your family'), 'en');
  const seen: string[] = []; const targets: Locale[] = ['en', 'es', 'pt-BR'];
  const out = await dubVideo('mock://v.mp4', targets, { sleep: noSleep, failLocale: 'es', onProgress: (l, s) => seen.push(l + ':' + s) });
  assert.equal(out.find((x) => x.locale === 'en')?.status, 'ready'); assert.equal(out.find((x) => x.locale === 'es')?.status, 'failed'); assert.equal(out.find((x) => x.locale === 'pt-BR')?.status, 'ready');
  assert.ok(seen.includes('en:sync') && !seen.some((x) => x.startsWith('es:video'))); assert.equal(CREDITS_PER_LANGUAGE, 5);
  const vtt = generateSubtitles([{ start: 0, end: 2.5, text: 'Hello' }], 'en'); assert.ok(vtt.startsWith('WEBVTT') && vtt.includes('00:00:00.000 --> 00:00:02.500'));
});
test('CDN: URL assinada válida/expirada/adulterada, HLS e thumbnails', () => {
  const s = getSignedUrl('abc', 60, 0); assert.ok(verifySignedUrl(s.url, 1000)); assert.equal(verifySignedUrl(s.url, 61_000), false); assert.equal(verifySignedUrl(s.url.replace('abc', 'abd'), 1000), false);
  assert.equal(getHlsManifest('abc', false).available, false); assert.equal(getHlsManifest('abc', true).renditions.length, 3);
  assert.ok(getThumbnails('abc')[0].avif.endsWith('.avif')); assert.match(CACHE_CONTROL.video, /immutable/); assert.match(CACHE_CONTROL.manifest, /max-age=60/);
});
