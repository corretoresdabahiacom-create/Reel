import { createHash } from 'node:crypto';
import { asUser, tx } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import { sealSecret, openSecret, kms } from '../../providers/kms.js';
import { breakerOpen, recordProviderFailure, recordProviderOk, recordUsage } from '../../providers/ai/router.js';
import { randomToken } from '../../utils/crypto.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { AppError } from '../../utils/errors.js';
import { ALLOWED_SCOPES, CLOUD_PROVIDERS, CloudError, cloudProvider, isConfigured, normScope, SCOPES, type CloudProviderId, type CloudTokens, type UploadFile, type UploadResult } from './cloudProviders.js';
import { saveError } from './messages.js';
import { requireSave } from './flag.js';

/**
 * Módulo 5 — OAuth com as nuvens do usuário: `connect`, `refresh`, `revoke`.
 * - client_secret e tokens ficam só no servidor; o cliente recebe apenas a URL de autorização e o estado da conexão.
 * - Tokens cifrados em envelope (AES-256-GCM, chave de dados nova por gravação, embrulhada pelo KMS); o AAD amarra cada
 *   texto cifrado ao usuário, ao provedor e ao campo.
 * - Refresh rotativo: o refresh token novo substitui o anterior (Microsoft e o mock giram a cada uso); toda gravação usa
 *   chave de dados nova. Lock no Redis evita dois refresh simultâneos do mesmo token.
 * - Revogar: avisa o provedor (melhor esforço) e APAGA a linha — os tokens deixam de existir no banco. Funciona mesmo
 *   com `ff_save` desligada (LGPD: revogação a qualquer momento).
 */
interface ConnRow { id: string; user_id: string; provider: CloudProviderId; access_token_enc: string; refresh_token_enc: string | null; expires_at: string | null; scopes: string[]; kms_key_id: string; status: string; refresh_count: number; rotated_at: string | null; created_at: string; updated_at: string }
const AAD = (userId: string, p: CloudProviderId, field: 'access' | 'refresh') => `cloud_connections:${userId}:${p}:${field}`;
const CTX = (p: CloudProviderId) => ({ purpose: 'cloud_token', provider: p });
export const redirectUriFor = (p: CloudProviderId) => `${env.PUBLIC_API_URL}/api/v1/cloud/${p}/callback`;
const b64url = (b: Buffer) => b.toString('base64url');

/** Chamada a um provedor de nuvem: breaker por provedor (R14), `ai_usage` ok/erro (R11). Só falha temporária conta no breaker. */
export async function cloudCall<T>(p: CloudProviderId, operation: string, userId: string, fn: () => Promise<T>, projectId?: string): Promise<T> {
  const key = `cloud:${p}`;
  if (await breakerOpen(key)) throw saveError(503, 'cloud_unavailable', { provider: p });
  const t0 = Date.now();
  try {
    const r = await fn(); await recordUsage({ provider: p, operation, costCents: 0, latencyMs: Date.now() - t0, userId, projectId, status: 'ok' }); await recordProviderOk(key); return r;
  } catch (e) {
    await recordUsage({ provider: p, operation, costCents: 0, latencyMs: Date.now() - t0, userId, projectId, status: 'error' }).catch(() => undefined);
    if (!(e instanceof CloudError) || e.retryable) await recordProviderFailure(key);
    logger.warn({ provider: p, operation, code: e instanceof CloudError ? e.code : 'error', retryable: e instanceof CloudError ? e.retryable : true }, 'chamada a nuvem do usuário falhou'); // sem token nem corpo
    throw e;
  }
}
/** CloudError → erro da API (mensagem do catálogo). */
export function cloudToApp(e: unknown, p: CloudProviderId): AppError {
  if (e instanceof AppError) return e;
  if (e instanceof CloudError) {
    if (e.code === 'invalid_grant' || e.code === 'unauthorized') return saveError(409, 'cloud_reauth_required', { provider: p });
    if (e.code === 'too_large') return saveError(413, 'file_too_large', { provider: p });
  }
  return saveError(503, 'cloud_unavailable', { provider: p });
}

async function load(userId: string, p: CloudProviderId): Promise<ConnRow | undefined> {
  return asUser(userId, async (db) => (await db.query<ConnRow>('SELECT * FROM cloud_connections WHERE user_id=$1 AND provider=$2', [userId, p])).rows[0]);
}
const markExpired = (userId: string, id: string) => asUser(userId, (db) => db.query(`UPDATE cloud_connections SET status='expired', updated_at=now() WHERE id=$1`, [id]));

async function store(userId: string, p: CloudProviderId, t: CloudTokens, rotated: boolean, keepRefreshEnc?: string | null): Promise<void> {
  const at = await sealSecret(t.accessToken, AAD(userId, p, 'access'), CTX(p));
  const rt = t.refreshToken ? (await sealSecret(t.refreshToken, AAD(userId, p, 'refresh'), CTX(p))).blob : keepRefreshEnc ?? null;
  const exp = t.expiresInSec ? new Date(Date.now() + t.expiresInSec * 1000) : null;
  await tx({ userId }, (db) => db.query(`INSERT INTO cloud_connections (user_id, provider, access_token_enc, refresh_token_enc, expires_at, scopes, kms_key_id, status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,'connected')
    ON CONFLICT (user_id, provider) DO UPDATE SET access_token_enc=EXCLUDED.access_token_enc, refresh_token_enc=EXCLUDED.refresh_token_enc, expires_at=EXCLUDED.expires_at,
      scopes=EXCLUDED.scopes, kms_key_id=EXCLUDED.kms_key_id, status='connected', updated_at=now(),
      refresh_count = CASE WHEN $8 THEN cloud_connections.refresh_count + 1 ELSE cloud_connections.refresh_count END,
      rotated_at = CASE WHEN $8 THEN now() ELSE cloud_connections.rotated_at END`,
    [userId, p, at.blob, rt, exp, t.scopes.map(normScope), at.keyId, rotated]));
}

export const cloudOAuth = {
  /** Inicia o OAuth (PKCE + state no Redis, 10 min). Devolve só a URL de autorização. */
  async connect(userId: string, p: CloudProviderId) {
    await requireSave(userId);
    if (!isConfigured(p)) throw saveError(503, 'cloud_not_configured', { provider: p });
    const state = randomToken(24), verifier = randomToken(48), challenge = b64url(createHash('sha256').update(verifier).digest());
    await redis.set(`cloudstate:${state}`, JSON.stringify({ userId, provider: p, verifier }), 'EX', 600);
    return { provider: p, url: cloudProvider(p).authUrl(state, challenge, redirectUriFor(p)), expiresInSec: 600, scopes: SCOPES[p] };
  },
  /** Volta do provedor: confere o state, troca o code, recusa escopo maior que o mínimo e grava os tokens cifrados. */
  async callback(p: CloudProviderId, q: { code?: string; state?: string; error?: string }) {
    if (q.error) throw saveError(400, 'oauth_denied');
    if (!q.code || !q.state) throw saveError(400, 'oauth_state_invalid');
    const raw = await redis.getdel(`cloudstate:${q.state}`); if (!raw) throw saveError(401, 'oauth_state_invalid');
    const st = JSON.parse(raw) as { userId: string; provider: CloudProviderId; verifier: string }; if (st.provider !== p) throw saveError(401, 'oauth_state_invalid');
    await requireSave(st.userId);
    const prov = cloudProvider(p);
    let t: CloudTokens;
    try { t = await cloudCall(p, 'cloud_oauth_exchange', st.userId, () => prov.exchange(q.code!, st.verifier, redirectUriFor(p))); } catch (e) { throw cloudToApp(e, p); }
    const granted = t.scopes.map(normScope), allowed = ALLOWED_SCOPES[p].map(normScope);
    const extra = granted.filter((s) => !allowed.includes(s)), missing = normScope(SCOPES[p][0]!);
    if (extra.length || !granted.includes(missing)) {
      await prov.revoke(t.accessToken).catch(() => undefined); // não guarda nada
      logger.warn({ provider: p, extraScopes: extra.length, hasWriteScope: granted.includes(missing) }, 'conexão de nuvem recusada pelo escopo');
      throw extra.length ? saveError(403, 'scope_too_broad', { provider: p }) : saveError(400, 'oauth_denied');
    }
    await store(st.userId, p, t, false);
    await asUser(st.userId, (db) => audit(db, st.userId, 'cloud.connect', 'cloud_provider', p, { scopes: granted }));
    return { userId: st.userId, provider: p };
  },
  /** Conexões do usuário — nunca devolve token, só estado e escopos. */
  async list(userId: string) {
    await requireSave(userId);
    const rows = await asUser(userId, async (db) => (await db.query<ConnRow>('SELECT * FROM cloud_connections WHERE user_id=$1', [userId])).rows);
    return {
      items: CLOUD_PROVIDERS.map((p) => { const r = rows.find((x) => x.provider === p);
        return { provider: p, status: r ? r.status : 'disconnected', scopes: r ? r.scopes : SCOPES[p], connectedAt: r?.created_at ?? null, available: isConfigured(p) }; }),
      icloud: { via: 'device', note: 'ios_share_sheet' },
    };
  },
  /** Token de acesso válido (renova se faltar < 2 min). Só para uso interno do servidor. */
  async accessToken(userId: string, p: CloudProviderId, force = false): Promise<string> {
    const r = await load(userId, p); if (!r) throw saveError(409, 'cloud_not_connected', { provider: p });
    if (r.status === 'expired' && !r.refresh_token_enc) throw saveError(409, 'cloud_reauth_required', { provider: p });
    if (!force && r.status === 'connected' && (!r.expires_at || new Date(r.expires_at).getTime() - Date.now() > 120_000)) return openSecret(r.access_token_enc, AAD(userId, p, 'access'), CTX(p));
    return this.refresh(userId, p);
  },
  /** Refresh rotativo com lock (um refresh por conexão por vez). */
  async refresh(userId: string, p: CloudProviderId, attempt = 0): Promise<string> {
    const r = await load(userId, p); if (!r) throw saveError(409, 'cloud_not_connected', { provider: p });
    if (!r.refresh_token_enc) { await markExpired(userId, r.id); throw saveError(409, 'cloud_reauth_required', { provider: p }); }
    const lock = `lock:cloudrefresh:${r.id}`;
    if (!(await redis.set(lock, '1', 'EX', 30, 'NX'))) {
      if (attempt >= 5) throw saveError(503, 'cloud_unavailable', { provider: p });
      await new Promise((ok) => setTimeout(ok, 400));
      const again = await load(userId, p); // outro worker pode ter acabado de renovar
      if (again && again.updated_at !== r.updated_at && again.status === 'connected') return openSecret(again.access_token_enc, AAD(userId, p, 'access'), CTX(p));
      return this.refresh(userId, p, attempt + 1);
    }
    try {
      const old = await openSecret(r.refresh_token_enc, AAD(userId, p, 'refresh'), CTX(p));
      let t: CloudTokens;
      try { t = await cloudCall(p, 'cloud_oauth_refresh', userId, () => cloudProvider(p).refresh(old)); }
      catch (e) { if (e instanceof CloudError && !e.retryable) await markExpired(userId, r.id); throw cloudToApp(e, p); }
      await store(userId, p, { ...t, scopes: t.scopes.length ? t.scopes : r.scopes }, true, r.refresh_token_enc);
      return t.accessToken;
    } finally { await redis.del(lock); }
  },
  /** Revoga: avisa o provedor (melhor esforço) e apaga a linha com os tokens. Sem exigir `ff_save` (LGPD). */
  async revoke(userId: string, p: CloudProviderId): Promise<{ provider: CloudProviderId; revoked: true; tokensDeleted: boolean }> {
    const r = await load(userId, p); if (!r) throw saveError(404, 'connection_not_found', undefined, 'not_found');
    const prov = cloudProvider(p);
    for (const [enc, field] of [[r.access_token_enc, 'access'], [r.refresh_token_enc, 'refresh']] as const) {
      if (!enc) continue;
      try { const tok = await openSecret(enc, AAD(userId, p, field), CTX(p)); await cloudCall(p, 'cloud_oauth_revoke', userId, () => prov.revoke(tok)); }
      catch { /* segue: a exclusão local é o que garante a revogação do nosso lado */ }
    }
    const n = await tx({ userId }, async (db) => {
      const d = await db.query('DELETE FROM cloud_connections WHERE id=$1', [r.id]);
      await audit(db, userId, 'cloud.revoke', 'cloud_provider', p); return d.rowCount ?? 0;
    });
    await redis.del(`lock:cloudrefresh:${r.id}`);
    return { provider: p, revoked: true, tokensDeleted: n === 1 };
  },
  /** LGPD (exclusão de conta): revoga todas as conexões do usuário. */
  async revokeAll(userId: string): Promise<number> {
    const rows = await asUser(userId, async (db) => (await db.query<{ provider: CloudProviderId }>('SELECT provider FROM cloud_connections WHERE user_id=$1', [userId])).rows);
    for (const r of rows) await this.revoke(userId, r.provider).catch(() => undefined);
    return rows.length;
  },
  /** Upload com o token do usuário; em 401 renova uma vez e tenta de novo. */
  async upload(userId: string, p: CloudProviderId, f: UploadFile, projectId?: string): Promise<UploadResult> {
    const prov = cloudProvider(p);
    const go = (at: string) => cloudCall(p, 'cloud_upload', userId, () => prov.upload(at, f), projectId);
    try { return await go(await this.accessToken(userId, p)); }
    catch (e) {
      if (!(e instanceof CloudError) || e.code !== 'unauthorized') throw e;
      try { return await go(await this.accessToken(userId, p, true)); }
      catch (e2) { if (e2 instanceof CloudError && e2.code === 'unauthorized') { const r = await load(userId, p); if (r) await markExpired(userId, r.id); } throw e2; }
    }
  },
  kmsKeyId: () => kms.keyId(),
};
