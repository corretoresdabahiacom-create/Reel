import { defineConfig } from 'vitest/config';
import { randomBytes } from 'node:crypto';
import { makeDevPki } from './scripts/c2pa-dev-pki.js';

export default defineConfig({
  test: {
    globalSetup: ['tests/global-setup.ts'], include: ['tests/**/*.test.ts'], testTimeout: 60_000, hookTimeout: 60_000,
    setupFiles: ['tests/contract.setup.ts', ...(process.env.OPENAPI_RECORD === '1' ? ['tests/openapi-record.setup.ts'] : [])], // P0-1: contrato validado (sempre) e gravado (openapi:record)
    fileParallelism: false, pool: 'forks', poolOptions: { forks: { singleFork: true } }, // um único Postgres/Redis compartilhado → arquivos em série
    env: {
      NODE_ENV: 'test', CONTRACT_ENFORCE: process.env.OPENAPI_RECORD === '1' ? '0' : '1', TRUSTED_PROXY: 'true', LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent', JWT_SECRET: 'test-secret-test-secret-test-secret-12345', DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), IP_HASH_SALT: 'salt',
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/nexus_test', REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://127.0.0.1:56379',
      STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: `/tmp/nexus-test-storage-${randomBytes(3).toString('hex')}`, MOCK_OAUTH: 'true', PLATFORM_MODE: 'mock', PAYMENTS_MODE: 'mock', AI_VIDEO_PROVIDER: 'mock', AI_TTS_PROVIDER: 'mock', AI_MODERATION_PROVIDER: 'mock',
      QUEUE_BACKOFF_MS: '30', PUBLISH_POLL_MS: '20', PUBLISH_POLL_MAX: '50', CLICK_FLUSH_MS: '200', METRICS_TOKEN: 'metrics-token', AFFILIATE_WEBHOOK_SECRET: 'aff-secret', STRIPE_WEBHOOK_SECRET: 'whsec_test', PIX_WEBHOOK_SECRET: 'pix-secret', BULL_BOARD_ENABLED: 'false', QUEUE_PREFIX: 'nxtest' /* não disputa jobs com um servidor de dev (EMBED_WORKERS) no mesmo Redis */, PUBLIC_API_URL: 'http://localhost:8787',
      ...makeDevPki(), // Módulo 10: PKI efêmera do selo C2PA (gerada a cada execução; nenhuma chave versionada)
    },
    coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/server.ts', 'src/worker.ts', 'src/instrumentation.ts', 'src/db/migrate.ts', 'src/integrations/**/oauth.ts', 'src/providers/ai/kling.ts', 'src/providers/ai/elevenlabs.ts', 'src/providers/ai/openaiModeration.ts'], reporter: ['text-summary', 'json-summary', 'html'], thresholds: { lines: 50, statements: 50, 'src/modules/**': { lines: 70, statements: 70 }, 'src/providers/**': { lines: 70, statements: 70 } } },
  },
});
