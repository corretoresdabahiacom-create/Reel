import { z } from 'zod';

const bool = z.enum(['true', 'false']).default('false').transform((v) => v === 'true');
const num = (d: number) => z.coerce.number().default(d);
const csv = z.string().default('').transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: num(8787), REGION: z.string().default('sa-east-1'),
  PUBLIC_API_URL: z.string().default('http://localhost:8787'), PUBLIC_APP_URL: z.string().default('http://localhost:5173'),
  CORS_ORIGINS: csv, TRUSTED_PROXY: bool,
  // P0-1 etapa 3 (RFC 2026-10-session-cookie): sessão do navegador em cookie httpOnly
  SESSION_COOKIE_SECURE: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'), SESSION_COOKIE_DOMAIN: z.string().regex(/^[a-z0-9.-]*$/i).default(''),
  DATABASE_URL: z.string().default('postgres://nexus:nexus@localhost:5432/nexusreel'), DATABASE_READ_URL: z.string().default(''),
  DB_APP_ROLE: z.string().regex(/^[a-z_][a-z0-9_]*$|^$/).default('nexus_app'), // papel sem privilégio de dono assumido por toda conexão do app (RLS efetivo); '' desliga (não recomendado)
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET precisa de ≥32 caracteres'), JWT_ISSUER: z.string().default('nexusreel'),
  ACCESS_TTL_SEC: num(900), REFRESH_TTL_SEC: num(2592000), ADMIN_REQUIRE_TOTP: bool, MOCK_OAUTH: bool,
  GOOGLE_CLIENT_ID: z.string().default(''), GOOGLE_CLIENT_SECRET: z.string().default(''), APPLE_CLIENT_ID: z.string().default(''),
  META_APP_ID: z.string().default(''), META_APP_SECRET: z.string().default(''),
  DATA_ENCRYPTION_KEY: z.string().min(1, 'DATA_ENCRYPTION_KEY obrigatório (32 bytes base64)'), DATA_ENCRYPTION_KEY_ID: z.string().default('k1'),
  IP_HASH_SALT: z.string().default('change-me'),
  STORAGE_DRIVER: z.enum(['s3', 'local']).default('local'), S3_ENDPOINT: z.string().default(''), S3_REGION: z.string().default('sa-east-1'),
  S3_FORCE_PATH_STYLE: bool, S3_ACCESS_KEY_ID: z.string().default(''), S3_SECRET_ACCESS_KEY: z.string().default(''),
  S3_BUCKET_UPLOADS: z.string().default('nexus-uploads'), S3_BUCKET_VIDEOS: z.string().default('nexus-videos'), S3_BUCKET_EXPORTS: z.string().default('nexus-exports'),
  CDN_BASE_URL: z.string().default(''), LOCAL_STORAGE_DIR: z.string().default('./.storage'), SIGNED_URL_TTL_SEC: num(3600),
  /** Projeto excluído: em quantos segundos os arquivos (vídeo, cenas, fotos sem outro uso) são apagados do storage. 0 = logo em seguida, em segundo plano. */
  PROJECT_PURGE_DELAY_SEC: num(0),
  /** 2ª passada da limpeza (apaga o que um job em andamento gravou depois da 1ª). Maior que o job mais longo (~30 min). */
  PROJECT_PURGE_RECHECK_SEC: num(7200),
  /** CDN dos vídeos (CloudFront com URL assinada). Só é usado com os três: CDN_BASE_URL + par de chaves. Sem eles: URL pré-assinada do S3. */
  CLOUDFRONT_KEY_PAIR_ID: z.string().default(''), CLOUDFRONT_PRIVATE_KEY: z.string().default(''),
  /** Chave KMS explícita para os objetos (SSE-KMS). Vazio: vale a criptografia padrão do bucket (KMS no Terraform). */
  S3_KMS_KEY_ID: z.string().default(''),
  AI_VIDEO_PROVIDER: z.enum(['mock', 'kling']).default('mock'), AI_VIDEO_FALLBACK: z.enum(['mock', 'kling']).default('mock'),
  AI_TTS_PROVIDER: z.enum(['mock', 'elevenlabs', 'espeak', 'piper', 'kokoro', 'open']).default('mock'),
  /** Voz reserva se a principal falhar (ex.: modelo Piper ausente → espeak). */
  AI_TTS_FALLBACK: z.enum(['mock', 'elevenlabs', 'espeak', 'piper', 'kokoro', 'open']).default('mock'),
  ESPEAK_BIN: z.string().default('espeak-ng'), PIPER_BIN: z.string().default('piper'), PIPER_VOICES_DIR: z.string().default('/opt/piper/voices'),
  PIPER_VOICE_PT_BR: z.string().default(''), PIPER_VOICE_EN: z.string().default(''), PIPER_VOICE_ES: z.string().default(''),
  /** Kokoro-82M (Apache-2.0, kokoro-onnx): vozes abertas femininas/masculinas; arquivos baixados no build do Docker. */
  KOKORO_PYTHON: z.string().default('python3'), KOKORO_SCRIPT: z.string().default('tools/kokoro/speak.py'),
  KOKORO_MODEL: z.string().default('/opt/kokoro/kokoro-v1.0.int8.onnx'), KOKORO_VOICES: z.string().default('/opt/kokoro/voices-v1.0.bin'),
  /** Vozes neurais online (Edge TTS, não oficial): '1' liga; reserva automática = Kokoro/Piper. */
  EDGE_TTS: z.string().default('0'), EDGE_PYTHON: z.string().default(''), EDGE_SCRIPT: z.string().default('tools/edge/speak.py'),
  /** Movimento humano (imagem→vídeo aberto, Space gratuito). Vazio = desligado (só movimento de câmera). */
  HF_VIDEO_SPACE: z.string().default(''), HF_VIDEO_API: z.string().default(''), HF_TOKEN: z.string().default(''), HF_TALK_SPACE: z.string().default(''), HF_VIDEO_TIMEOUT_MS: num(180000),
  // Módulo 1 (áudio, atrás de ff_audio): só há implementação mock por enquanto — os reais entram com contrato (opt-out de treino).
  AI_MUSIC_PROVIDER: z.enum(['mock', 'composer']).default('mock'), AI_VOICE_CLONE_PROVIDER: z.enum(['mock']).default('mock'),
  AUDIO_STEM_URL_TTL_SEC: num(86400), AUDIO_VERSION_RETENTION_DAYS: num(90), VOICE_SAMPLE_MAX_BYTES: num(5 * 1024 * 1024),
  /** `composer`: música original composta pelo app e tocada com instrumentos reais (FluidSynth + soundfont FluidR3_GM, MIT). */
  FLUIDSYNTH_BIN: z.string().default('fluidsynth'), MUSIC_SOUNDFONT: z.string().default('/usr/share/sounds/sf2/FluidR3_GM.sf2'),
  /** Estúdio de voz (ff_voice_studio): gravação da narração e música enviada pelo usuário. */
  RECORDING_MAX_BYTES: num(30 * 1024 * 1024), RECORDING_MAX_SEC: num(300), MUSIC_UPLOAD_MAX_BYTES: num(25 * 1024 * 1024), TTS_PREVIEW_MAX_CHARS: num(600),
  // Módulo 2 (edição de fundo, atrás de ff_background): só mock (FFmpeg local) por enquanto.
  AI_BACKGROUND_PROVIDER: z.enum(['mock']).default('mock'), BACKGROUND_URL_TTL_SEC: num(86400),
  // Módulo 3 (inserção de elementos, atrás de ff_elements): só mock (FFmpeg local) por enquanto.
  AI_ELEMENTS_PROVIDER: z.enum(['mock']).default('mock'),
  // Módulo 4 (união de vídeos, atrás de ff_merge): análise de transição local; vídeo unido até MERGE_MAX_SEC.
  // Módulo 9 (transcrição + agente, atrás de ff_transcript / ff_agent): STT com opt-out de treino; transcrição cifrada e com retenção.
  AI_STT_PROVIDER: z.enum(['mock', 'openai', 'deepgram', 'whisper']).default('mock'),
  /** `whisper`: transcrição local gratuita (faster-whisper; tools/whisper/transcribe.py). Modelo baixado no build do Docker. */
  WHISPER_PYTHON: z.string().default('python3'), WHISPER_SCRIPT: z.string().default('tools/whisper/transcribe.py'), WHISPER_MODEL: z.string().default('small'), WHISPER_MODELS_DIR: z.string().default('/opt/whisper'), DEEPGRAM_API_KEY: z.string().default(''),
  AI_AGENT_PROVIDER: z.enum(['mock']).default('mock'), TRANSCRIPT_RETENTION_DAYS: num(90), EDIT_URL_TTL_SEC: num(86400),
  // Módulo 11 (acessibilidade + teleprompter, atrás de ff_accessibility / ff_teleprompter): descrição visual (mock) revisável; gravação do
  // teleprompter só chega ao servidor por opt-in explícito (limite de tamanho abaixo).
  A11Y_VISION_PROVIDER: z.enum(['mock']).default('mock'), TELEPROMPTER_MAX_BYTES: num(150 * 1024 * 1024),
  // Módulo 10 (insights/séries/selo/live, atrás de ff_insights/ff_series/ff_seal/ff_live). Selo C2PA: assinatura via KMS (produção) ou chave
  // local SÓ fora de produção. Cadeia de certificados e âncoras em PEM base64. `none` = selo indisponível (503 seal_not_configured).
  C2PA_SIGNER: z.enum(['none', 'local', 'kms']).default('none'), C2PA_CERT_CHAIN_PEM_B64: z.string().default(''), C2PA_PRIVATE_KEY_PEM_B64: z.string().default(''),
  C2PA_KMS_KEY_ID: z.string().default(''), C2PA_TRUST_ANCHORS_PEM_B64: z.string().default(''), C2PA_TSA_URL: z.string().default(''),
  LIVE_AVATAR_PROVIDER: z.enum(['mock']).default('mock'), INSIGHTS_MODEL: z.enum(['heuristic-v1']).default('heuristic-v1'),
  // Módulo 8 (colaboração + timeline, atrás de ff_collaboration / ff_timeline): snapshot automático a cada N edições; login do socket na 1ª mensagem.
  TIMELINE_SNAPSHOT_EVERY: num(20), COLLAB_WS_AUTH_TIMEOUT_MS: num(5000),
  // Módulo 7 (envio por e-mail, atrás de ff_email): link HMAC de até 7 dias; anti-spam por envio e por dia.
  EMAIL_SHARE_SECRET: z.string().default(''), EMAIL_SHARE_TTL_DAYS: num(7), EMAIL_SHARE_MAX_RECIPIENTS: num(20), EMAIL_SHARE_DAILY_RECIPIENTS: num(200), EMAIL_BLOCKED_DOMAINS: z.string().default(''),
  // Módulo 6 (assets derivados, atrás de ff_assets): conversões locais; arquivos em derived/<user>/ por ASSETS_TTL_DAYS.
  ASSETS_TTL_DAYS: num(30), ASSETS_URL_TTL_SEC: num(86400),
  // Módulo 5 (salvamento, atrás de ff_save): nuvens do usuário via OAuth de escopo mínimo; tokens em envelope AES-256-GCM com chave do KMS.
  CLOUD_MODE: z.enum(['mock', 'real']).default('mock'), KMS_DRIVER: z.enum(['local', 'aws']).default('local'), KMS_KEY_ID: z.string().default(''),
  GOOGLE_DRIVE_CLIENT_ID: z.string().default(''), GOOGLE_DRIVE_CLIENT_SECRET: z.string().default(''), DROPBOX_APP_KEY: z.string().default(''), DROPBOX_APP_SECRET: z.string().default(''),
  ONEDRIVE_CLIENT_ID: z.string().default(''), ONEDRIVE_CLIENT_SECRET: z.string().default(''), S3_BUCKET_ARCHIVE: z.string().default('nexus-archive'),
  NEXUS_CLOUD_RETENTION_FREE_DAYS: num(90), NEXUS_CLOUD_RETENTION_PRO_DAYS: num(365), NEXUS_CLOUD_QUOTA_FREE_MB: num(2048), NEXUS_CLOUD_QUOTA_PRO_MB: num(51200),
  SAVE_URL_TTL_SEC: num(86400), SAVE_DEVICE_ZIP_DAYS: num(7), SAVE_BATCH_MAX_ITEMS: num(200),
  MERGE_MAX_SEC: num(120), MERGE_INPUT_MAX_SEC: num(61), MERGE_URL_TTL_SEC: num(86400), AI_MODERATION_PROVIDER: z.enum(['mock', 'openai']).default('mock'),
  KLING_ACCESS_KEY: z.string().default(''), KLING_SECRET_KEY: z.string().default(''), KLING_API_BASE: z.string().default('https://api.klingai.com'),
  ELEVENLABS_API_KEY: z.string().default(''), OPENAI_API_KEY: z.string().default(''),
  AI_DAILY_COST_ALERT_CENTS: num(50000), AI_COST_LIMIT_FREE_CENTS: num(200), AI_COST_LIMIT_PRO_CENTS: num(2000), AI_COST_LIMIT_BUSINESS_CENTS: num(20000),
  PLATFORM_MODE: z.enum(['mock', 'real']).default('mock'), OAUTH_REDIRECT_URI: z.string().default('http://localhost:5173/oauth/callback'),
  TIKTOK_CLIENT_KEY: z.string().default(''), TIKTOK_CLIENT_SECRET: z.string().default(''), TIKTOK_APP_AUDITED: bool, YOUTUBE_PROJECT_VERIFIED: bool,
  INSTAGRAM_APP_ID: z.string().default(''), INSTAGRAM_APP_SECRET: z.string().default(''), INSTAGRAM_WEBHOOK_VERIFY_TOKEN: z.string().default(''),
  ALLOW_STUBS_IN_PRODUCTION: bool,
  /** `free`: instalação sem nenhum serviço pago (servidor único, docs/FREE.md): aceita IA/voz simuladas ou abertas, arquivos no
   *  disco e chave local em produção; exige PAYMENTS_MODE=off. As regras de segurança (segredos, cookie, CORS, 2FA, RLS) continuam. */
  APP_PROFILE: z.enum(['standard', 'free']).default('standard'),
  /** Login com Firebase Authentication (plano gratuito Spark). Vazio = desligado. */
  FIREBASE_PROJECT_ID: z.string().default(''),
  /** Só dev/teste: emulador local do Firebase Auth (aceita tokens sem assinatura). Produção recusa. */
  FIREBASE_AUTH_EMULATOR_HOST: z.string().default(''),
  SHOPEE_PARTNER_ID: z.string().default(''), SHOPEE_PARTNER_KEY: z.string().default(''),
  TEMU_APP_KEY: z.string().default(''), TEMU_APP_SECRET: z.string().default(''), TEMU_AUTH_URL: z.string().default(''), TEMU_API_BASE: z.string().default(''),
  OLX_CLIENT_ID: z.string().default(''), OLX_CLIENT_SECRET: z.string().default(''), OLX_AUTH_URL: z.string().default(''), OLX_API_BASE: z.string().default(''),
  MELI_APP_ID: z.string().default(''), MELI_CLIENT_SECRET: z.string().default(''), AFFILIATE_WEBHOOK_SECRET: z.string().default('change-me'),
  PAYMENTS_MODE: z.enum(['mock', 'real', 'off']).default('mock'), STRIPE_SECRET_KEY: z.string().default(''), STRIPE_WEBHOOK_SECRET: z.string().default('whsec_test'),
  STRIPE_PRICE_PRO: z.string().default(''), STRIPE_PRICE_BUSINESS: z.string().default(''), STRIPE_PRICE_PRO_LOW: z.string().default(''), STRIPE_PRICE_PRO_HIGH: z.string().default(''), STRIPE_CONNECT_CLIENT_ID: z.string().default(''),
  PIX_PROVIDER: z.enum(['mercadopago', 'pagarme']).default('mercadopago'), MERCADOPAGO_ACCESS_TOKEN: z.string().default(''), PAGARME_API_KEY: z.string().default(''),
  PIX_WEBHOOK_SECRET: z.string().default('change-me'),
  EMAIL_PROVIDER: z.enum(['log', 'resend', 'ses']).default('log'), RESEND_API_KEY: z.string().default(''), EMAIL_FROM: z.string().default('NexusReel <no-reply@nexusreel.com>'),
  LOG_LEVEL: z.string().default('info'), SENTRY_DSN: z.string().default(''), OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default(''), OTEL_SAMPLE_RATIO: num(0.1),
  METRICS_ALLOW_CIDRS: csv, METRICS_TOKEN: z.string().default(''), BULL_BOARD_ENABLED: bool, WORKER_CONCURRENCY_SCALE: num(1),
  /** Prefixo das chaves do BullMQ no Redis. Padrão = o do BullMQ ('bull'). Os testes usam outro para não disputar jobs com um servidor de dev no mesmo Redis. */
  QUEUE_PREFIX: z.string().regex(/^[a-z0-9_-]{1,32}$/).default('bull'),
  // ── Fase 7 (growth & data science)
  ANALYTICS_PSEUDO_SALT: z.string().default('change-me'), WAREHOUSE_EXPORT_DIR: z.string().default('./.warehouse'),
  ML_SERVICE_URL: z.string().default(''), ML_TIMEOUT_MS: num(50), ML_SERVICE_TOKEN: z.string().default(''),
  PUSH_PROVIDER: z.enum(['log', 'onesignal']).default('log'), ONESIGNAL_APP_ID: z.string().default(''), ONESIGNAL_API_KEY: z.string().default(''),
  // Fase 8 (todos opcionais: sem eles os adaptadores operam em modo log/stub)
  OPS_JOBS_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'), SLACK_WEBHOOK_URL: z.string().url().optional(), SLACK_BOT_TOKEN: z.string().optional(), PAGERDUTY_ROUTING_KEY: z.string().optional(),
  STATUS_PUBLIC_URL: z.string().default('https://status.nexusreel.com'), KYC_PROVIDER: z.enum(['stub', 'persona', 'onfido']).default('stub'), SANCTIONS_PROVIDER: z.enum(['stub', 'opensanctions']).default('stub'),
  GROWTH_JOBS_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'), WAITLIST_PUBLIC_URL: z.string().default('https://nexusreel.com/waitlist'),
});

export type Env = z.infer<typeof schema>;
export function loadEnv(src: NodeJS.ProcessEnv = process.env): Env {
  const r = schema.safeParse(src);
  if (!r.success) throw new Error('Configuração inválida: ' + r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  const e = r.data;
  if (e.NODE_ENV === 'production') {
    const problems = productionProblems(e);
    if (problems.length) throw new Error('Configuração insegura para produção: ' + problems.join('; '));
  }
  return e;
}

/**
 * Auditoria pós-Fase 8 (P0): em produção, recusa segredos conhecidos/padrão (qualquer um poderia assinar webhooks de
 * pagamento/afiliados e criar créditos ou comissões), modo mock de pagamentos e stubs de KYC/sanções/IA/plataformas.
 * Stubs funcionais só sobem com reconhecimento explícito `ALLOW_STUBS_IN_PRODUCTION=true` (ex.: soft launch fechado).
 */
const KNOWN_DEFAULTS = new Set(['', 'change-me', 'whsec_test', 'changeme', 'secret', 'test']);
/** Domínio registrável aproximado (sufixos de 2 níveis comuns no BR/UK/AU tratados). */
export function siteOf(url: string): string { try { const h = new URL(url).hostname.toLowerCase(); const parts = h.split('.'); if (parts.length <= 2 || /^\d+$/.test(parts.at(-1)!)) return h; const two = /^(com|net|org|gov|edu|co|ac)$/.test(parts.at(-2)!) && parts.at(-1)!.length === 2; return parts.slice(two ? -3 : -2).join('.'); } catch { return ''; } }
export function productionProblems(e: Env): string[] {
  const p: string[] = [];
  const weak = (name: string, v: string, min = 24) => { if (KNOWN_DEFAULTS.has(v) || v.startsWith('change-me') || v.length < min) p.push(`${name} ausente, padrão ou curto (<${min})`); };
  if (e.MOCK_OAUTH) p.push('MOCK_OAUTH ligado');
  if (!e.SESSION_COOKIE_SECURE) p.push('SESSION_COOKIE_SECURE=false (cookie de sessão sem Secure)');
  // cookie de sessão SameSite=Strict + credentials: front e API no MESMO site (ex.: app.nexusreel.com + api.nexusreel.com), origens explícitas
  if (!e.CORS_ORIGINS.length) p.push('CORS_ORIGINS vazio (sessão em cookie exige lista explícita de origens do front)');
  // CDN: ou completo (https + par de chaves válido) ou nenhum; meio-configurado entregaria vídeo sem assinatura ou quebraria o player
  if (e.CDN_BASE_URL && !/^https:\/\//.test(e.CDN_BASE_URL)) p.push('CDN_BASE_URL sem https');
  if ((e.CLOUDFRONT_KEY_PAIR_ID || e.CLOUDFRONT_PRIVATE_KEY) && !(e.CDN_BASE_URL && e.CLOUDFRONT_KEY_PAIR_ID && /BEGIN (RSA )?PRIVATE KEY/.test(e.CLOUDFRONT_PRIVATE_KEY.replace(/\\n/g, '\n')))) p.push('CDN meio configurado (precisa de CDN_BASE_URL + CLOUDFRONT_KEY_PAIR_ID + CLOUDFRONT_PRIVATE_KEY em PEM)');
  for (const o of e.CORS_ORIGINS) if (!/^https:\/\//.test(o)) p.push(`CORS_ORIGINS com origem sem https: ${o}`);
  // P0-1 etapa 4: cookie SameSite=Strict só vai se o front e a API forem o MESMO SITE (domínio registrável); provado em navegador real
  for (const o of e.CORS_ORIGINS) { const a = siteOf(o), b = siteOf(e.PUBLIC_API_URL); if (!b) { p.push('PUBLIC_API_URL ausente (necessário para conferir o site do cookie de sessão)'); break; } if (a !== b) p.push(`origem ${o} é de outro site que a API (${b}): o cookie de sessão não seria enviado`); }
  if (e.JWT_SECRET.startsWith('change-me')) p.push('JWT_SECRET padrão');
  const free = e.APP_PROFILE === 'free';
  if (e.STORAGE_DRIVER === 'local' && !free) p.push('STORAGE_DRIVER=local');
  if (free && e.STORAGE_DRIVER === 'local' && !e.LOCAL_STORAGE_DIR.startsWith('/')) p.push('APP_PROFILE=free: LOCAL_STORAGE_DIR precisa ser caminho absoluto (volume persistente)');
  if (free && e.PAYMENTS_MODE !== 'off') p.push('APP_PROFILE=free exige PAYMENTS_MODE=off (sem cobrança real nem simulada)');
  if (e.FIREBASE_AUTH_EMULATOR_HOST) p.push('FIREBASE_AUTH_EMULATOR_HOST em produção (aceitaria tokens do Firebase sem assinatura)');
  const k = Buffer.from(e.DATA_ENCRYPTION_KEY, 'base64');
  if (k.length !== 32 || k.every((b) => b === k[0])) p.push('DATA_ENCRYPTION_KEY precisa de 32 bytes aleatórios (base64)');
  weak('ANALYTICS_PSEUDO_SALT', e.ANALYTICS_PSEUDO_SALT, 16); weak('IP_HASH_SALT', e.IP_HASH_SALT, 16);
  if (e.PAYMENTS_MODE !== 'off') { weak('STRIPE_WEBHOOK_SECRET', e.STRIPE_WEBHOOK_SECRET, 16); weak('PIX_WEBHOOK_SECRET', e.PIX_WEBHOOK_SECRET); } // pagamentos desligados: webhooks respondem 503
  weak('AFFILIATE_WEBHOOK_SECRET', e.AFFILIATE_WEBHOOK_SECRET);
  if (e.INSTAGRAM_WEBHOOK_VERIFY_TOKEN) weak('INSTAGRAM_WEBHOOK_VERIFY_TOKEN', e.INSTAGRAM_WEBHOOK_VERIFY_TOKEN, 16);
  if (e.PAYMENTS_MODE === 'mock') p.push('PAYMENTS_MODE=mock (checkout/saques simulados)');
  if (!e.ADMIN_REQUIRE_TOTP) p.push('ADMIN_REQUIRE_TOTP=false (admins sem 2FA)');
  if (!e.DB_APP_ROLE) p.push('DB_APP_ROLE vazio (RLS deixaria de valer para consultas comuns)');
  if (e.ML_SERVICE_URL && !e.ML_SERVICE_TOKEN) p.push('ML_SERVICE_URL sem ML_SERVICE_TOKEN');
  if (e.BULL_BOARD_ENABLED && !e.ADMIN_REQUIRE_TOTP) p.push('BULL_BOARD_ENABLED exige ADMIN_REQUIRE_TOTP');
  const stubs = [e.AI_VIDEO_PROVIDER === 'mock' && 'AI_VIDEO_PROVIDER=mock', e.AI_TTS_PROVIDER === 'mock' && 'AI_TTS_PROVIDER=mock', e.AI_MODERATION_PROVIDER === 'mock' && 'AI_MODERATION_PROVIDER=mock',
    e.PLATFORM_MODE === 'mock' && 'PLATFORM_MODE=mock', e.KYC_PROVIDER === 'stub' && 'KYC_PROVIDER=stub', e.SANCTIONS_PROVIDER === 'stub' && 'SANCTIONS_PROVIDER=stub'].filter(Boolean) as string[];
  if (e.KMS_DRIVER === 'aws' && !e.KMS_KEY_ID) p.push('KMS_DRIVER=aws sem KMS_KEY_ID (tokens de nuvem não teriam chave mestra)');
  if (e.C2PA_SIGNER === 'local' && !free) p.push('C2PA_SIGNER=local em produção (a chave do selo precisa ficar no KMS: C2PA_SIGNER=kms)');
  if (e.C2PA_SIGNER === 'local' && free && (!e.C2PA_PRIVATE_KEY_PEM_B64 || !e.C2PA_CERT_CHAIN_PEM_B64)) p.push('APP_PROFILE=free com C2PA_SIGNER=local exige C2PA_PRIVATE_KEY_PEM_B64 e C2PA_CERT_CHAIN_PEM_B64');
  if (e.C2PA_SIGNER === 'kms' && (!e.C2PA_KMS_KEY_ID || !e.C2PA_CERT_CHAIN_PEM_B64)) p.push('C2PA_SIGNER=kms sem C2PA_KMS_KEY_ID ou C2PA_CERT_CHAIN_PEM_B64');
  if (stubs.length && !e.ALLOW_STUBS_IN_PRODUCTION && !free) p.push(`stubs em produção sem ALLOW_STUBS_IN_PRODUCTION=true: ${stubs.join(', ')}`);
  return p;
}
export const env: Env = loadEnv();
