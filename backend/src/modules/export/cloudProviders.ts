import { createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { redis } from '../../db/redis.js';

/**
 * Nuvens do usuário (Módulo 5). Escopo MÍNIMO, nunca o drive inteiro:
 * - Google Drive: `drive.file` (só os arquivos que o próprio NexusReel criou);
 * - Dropbox: `files.content.write` (app com acesso só à pasta do app);
 * - OneDrive: `Files.ReadWrite.AppFolder` (só a pasta do app) + `offline_access` (refresh token).
 * iCloud não tem OAuth/API pública para gravar no iCloud Drive a partir de um servidor: no iPhone o arquivo vai pelo
 * menu Compartilhar → "Salvar em Arquivos" → iCloud Drive (fluxo do aparelho, ver storageExportService.saveToDevice).
 *
 * `CLOUD_MODE=real` chama as APIs oficiais (não verificável neste ambiente: sem rede externa nem credenciais);
 * `CLOUD_MODE=mock` (padrão de dev/test) simula o provedor com tokens de verdade guardados no Redis — dá para provar
 * rotação de refresh, revogação e upload sem rede.
 */
export const CLOUD_PROVIDERS = ['google_drive', 'dropbox', 'onedrive'] as const;
export type CloudProviderId = (typeof CLOUD_PROVIDERS)[number];
export const SCOPES: Record<CloudProviderId, string[]> = {
  google_drive: ['https://www.googleapis.com/auth/drive.file'],
  dropbox: ['files.content.write'],
  onedrive: ['Files.ReadWrite.AppFolder', 'offline_access'],
};
/** Escopos aceitos na resposta do provedor (alguns devolvem extras de identidade). Qualquer outro = conexão recusada. */
export const ALLOWED_SCOPES: Record<CloudProviderId, string[]> = {
  google_drive: [...SCOPES.google_drive],
  dropbox: [...SCOPES.dropbox, 'account_info.read'], // o Dropbox sempre inclui account_info.read em apps com escopo
  onedrive: [...SCOPES.onedrive],
};
/** Compara escopos sem caixa e sem o prefixo de recurso do Graph (`https://graph.microsoft.com/Files...`). */
export const normScope = (s: string) => s.replace(/^https:\/\/graph\.microsoft\.com\//i, '').toLowerCase();
export const MAX_UPLOAD_BYTES: Record<CloudProviderId, number> = { google_drive: 5 * 1024 ** 3, dropbox: 150 * 1024 ** 2, onedrive: 4 * 1024 ** 3 };
export const FOLDER = 'NexusReel';

export interface CloudTokens { accessToken: string; refreshToken?: string; expiresInSec?: number; scopes: string[] }
export interface UploadFile { name: string; mime: string; body: Buffer }
export interface UploadResult { externalId: string; externalUrl: string }
export class CloudError extends Error {
  constructor(public provider: CloudProviderId, message: string, public retryable: boolean, public code: 'unauthorized' | 'invalid_grant' | 'network' | 'http' | 'too_large') { super(message); }
}
export interface CloudProvider {
  id: CloudProviderId;
  authUrl(state: string, codeChallenge: string, redirectUri: string): string;
  exchange(code: string, verifier: string, redirectUri: string): Promise<CloudTokens>;
  refresh(refreshToken: string): Promise<CloudTokens>;
  revoke(token: string): Promise<void>;
  upload(accessToken: string, f: UploadFile): Promise<UploadResult>;
}

/* ------------------------------------------------ real ------------------------------------------------ */
async function call<T>(p: CloudProviderId, url: string, init: RequestInit = {}, timeoutMs = 120_000): Promise<{ status: number; body: T; headers: Headers }> {
  let r: Response;
  try { r = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) }); } catch (e) { throw new CloudError(p, `rede: ${(e as Error).name}`, true, 'network'); }
  const text = await r.text(); let body: unknown; try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!r.ok) {
    const err = (body as { error?: string | { '.tag'?: string } }).error; const tag = typeof err === 'string' ? err : err?.['.tag'];
    if (tag === 'invalid_grant') throw new CloudError(p, `${p} invalid_grant`, false, 'invalid_grant');
    throw new CloudError(p, `${p} HTTP ${r.status}`, r.status === 429 || r.status >= 500, r.status === 401 ? 'unauthorized' : 'http'); // corpo nunca no log (pode ter dados)
  }
  return { status: r.status, body: body as T, headers: r.headers };
}
/** Buffer → corpo do fetch sem copiar os bytes. */
const bin = (b: Buffer): BodyInit => new Uint8Array(b.buffer, b.byteOffset, b.length) as unknown as BodyInit;
const form = (o: Record<string, string>) => ({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(o).toString() });
type TokenResp = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };
const toTokens = (t: TokenResp, fallbackScopes: string[]): CloudTokens => ({ accessToken: t.access_token, refreshToken: t.refresh_token, expiresInSec: t.expires_in, scopes: t.scope ? t.scope.split(/[ ,]+/).filter(Boolean) : fallbackScopes });
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();

const google: CloudProvider = {
  id: 'google_drive',
  authUrl: (state, cc, redirect_uri) => `https://accounts.google.com/o/oauth2/v2/auth?${qs({ client_id: env.GOOGLE_DRIVE_CLIENT_ID, redirect_uri, response_type: 'code', scope: SCOPES.google_drive.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state, code_challenge: cc, code_challenge_method: 'S256' })}`,
  exchange: async (code, code_verifier, redirect_uri) => toTokens((await call<TokenResp>('google_drive', 'https://oauth2.googleapis.com/token', form({ code, code_verifier, redirect_uri, grant_type: 'authorization_code', client_id: env.GOOGLE_DRIVE_CLIENT_ID, client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET }))).body, SCOPES.google_drive),
  refresh: async (refresh_token) => toTokens((await call<TokenResp>('google_drive', 'https://oauth2.googleapis.com/token', form({ refresh_token, grant_type: 'refresh_token', client_id: env.GOOGLE_DRIVE_CLIENT_ID, client_secret: env.GOOGLE_DRIVE_CLIENT_SECRET }))).body, SCOPES.google_drive),
  revoke: async (token) => { await call('google_drive', 'https://oauth2.googleapis.com/revoke', form({ token })); },
  async upload(at, f) {
    const auth = { authorization: `Bearer ${at}` };
    // pasta "NexusReel" criada pelo app (drive.file só enxerga o que o app criou)
    const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const found = await call<{ files: { id: string }[] }>('google_drive', `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&spaces=drive`, { headers: auth });
    const folderId = found.body.files[0]?.id ?? (await call<{ id: string }>('google_drive', 'https://www.googleapis.com/drive/v3/files?fields=id', { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) })).body.id;
    // upload resumível (multipart só serve até 5 MB)
    const start = await call('google_drive', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink', { method: 'POST', headers: { ...auth, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': f.mime, 'x-upload-content-length': String(f.body.length) }, body: JSON.stringify({ name: f.name, parents: [folderId] }) });
    const loc = start.headers.get('location'); if (!loc) throw new CloudError('google_drive', 'google_drive sem sessão de upload', true, 'http');
    const r = await call<{ id: string; webViewLink?: string }>('google_drive', loc, { method: 'PUT', headers: { 'content-type': f.mime }, body: bin(f.body) }, 600_000);
    return { externalId: r.body.id, externalUrl: r.body.webViewLink ?? `https://drive.google.com/file/d/${r.body.id}/view` };
  },
};
const dropbox: CloudProvider = {
  id: 'dropbox',
  authUrl: (state, cc, redirect_uri) => `https://www.dropbox.com/oauth2/authorize?${qs({ client_id: env.DROPBOX_APP_KEY, redirect_uri, response_type: 'code', token_access_type: 'offline', scope: SCOPES.dropbox.join(' '), state, code_challenge: cc, code_challenge_method: 'S256' })}`,
  exchange: async (code, code_verifier, redirect_uri) => toTokens((await call<TokenResp>('dropbox', 'https://api.dropboxapi.com/oauth2/token', form({ code, code_verifier, redirect_uri, grant_type: 'authorization_code', client_id: env.DROPBOX_APP_KEY, client_secret: env.DROPBOX_APP_SECRET }))).body, SCOPES.dropbox),
  refresh: async (refresh_token) => toTokens((await call<TokenResp>('dropbox', 'https://api.dropboxapi.com/oauth2/token', form({ refresh_token, grant_type: 'refresh_token', client_id: env.DROPBOX_APP_KEY, client_secret: env.DROPBOX_APP_SECRET }))).body, SCOPES.dropbox),
  revoke: async (token) => { await call('dropbox', 'https://api.dropboxapi.com/2/auth/token/revoke', { method: 'POST', headers: { authorization: `Bearer ${token}` } }); },
  async upload(at, f) {
    if (f.body.length > MAX_UPLOAD_BYTES.dropbox) throw new CloudError('dropbox', 'dropbox: arquivo acima de 150 MB', false, 'too_large');
    const arg = JSON.stringify({ path: `/${FOLDER}/${f.name}`, mode: 'add', autorename: true, mute: false }).replace(/[\u007f-￿]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')); // header só ASCII
    const r = await call<{ id: string; path_display?: string }>('dropbox', 'https://content.dropboxapi.com/2/files/upload', { method: 'POST', headers: { authorization: `Bearer ${at}`, 'content-type': 'application/octet-stream', 'dropbox-api-arg': arg }, body: bin(f.body) }, 600_000);
    // Sem escopo de compartilhamento (mínimo) não há link direto: abre a pasta do app no Dropbox.
    return { externalId: r.body.id, externalUrl: 'https://www.dropbox.com/home/Apps' };
  },
};
const MS = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const onedrive: CloudProvider = {
  id: 'onedrive',
  authUrl: (state, cc, redirect_uri) => `${MS}/authorize?${qs({ client_id: env.ONEDRIVE_CLIENT_ID, redirect_uri, response_type: 'code', response_mode: 'query', scope: SCOPES.onedrive.join(' '), state, code_challenge: cc, code_challenge_method: 'S256' })}`,
  exchange: async (code, code_verifier, redirect_uri) => toTokens((await call<TokenResp>('onedrive', `${MS}/token`, form({ code, code_verifier, redirect_uri, grant_type: 'authorization_code', client_id: env.ONEDRIVE_CLIENT_ID, client_secret: env.ONEDRIVE_CLIENT_SECRET, scope: SCOPES.onedrive.join(' ') }))).body, SCOPES.onedrive),
  refresh: async (refresh_token) => toTokens((await call<TokenResp>('onedrive', `${MS}/token`, form({ refresh_token, grant_type: 'refresh_token', client_id: env.ONEDRIVE_CLIENT_ID, client_secret: env.ONEDRIVE_CLIENT_SECRET, scope: SCOPES.onedrive.join(' ') }))).body, SCOPES.onedrive),
  // A Microsoft não tem endpoint para revogar um token avulso de conta pessoal: a revogação é a exclusão local + o
  // usuário pode remover o app em account.live.com/consent/Manage (dito na tela). O refresh token roda a cada uso.
  revoke: async () => undefined,
  async upload(at, f) {
    const auth = { authorization: `Bearer ${at}` };
    const s = await call<{ uploadUrl: string }>('onedrive', `https://graph.microsoft.com/v1.0/me/drive/special/approot:/${FOLDER}/${encodeURIComponent(f.name)}:/createUploadSession`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }) });
    const CHUNK = 32 * 320 * 1024; let last: { id?: string; webUrl?: string } = {}; // múltiplo de 320 KiB (exigência da API)
    for (let o = 0; o < f.body.length; o += CHUNK) {
      const part = f.body.subarray(o, Math.min(o + CHUNK, f.body.length));
      last = (await call<{ id?: string; webUrl?: string }>('onedrive', s.body.uploadUrl, { method: 'PUT', headers: { 'content-length': String(part.length), 'content-range': `bytes ${o}-${o + part.length - 1}/${f.body.length}` }, body: bin(part) }, 600_000)).body;
    }
    if (!last.id) throw new CloudError('onedrive', 'onedrive: upload incompleto', true, 'http');
    return { externalId: last.id, externalUrl: last.webUrl ?? 'https://onedrive.live.com/' };
  },
};

/* ------------------------------------------------ mock ------------------------------------------------ */
const h = (t: string) => createHash('sha256').update(t).digest('hex');
const TOK_TTL = 3600, RT_TTL = 30 * 86400;
async function issue(p: CloudProviderId): Promise<CloudTokens> {
  const at = `mock-at-${p}-${randomBytes(18).toString('base64url')}`, rt = `mock-rt-${p}-${randomBytes(18).toString('base64url')}`;
  await redis.multi().set(`mockcloud:at:${h(at)}`, p, 'EX', TOK_TTL).set(`mockcloud:rt:${h(rt)}`, p, 'EX', RT_TTL).set(`mockcloud:pair:${h(at)}`, h(rt), 'EX', RT_TTL).exec();
  return { accessToken: at, refreshToken: rt, expiresInSec: TOK_TTL, scopes: [...SCOPES[p]] };
}
/** Falha injetável nos testes: MOCK_CLOUD_FAIL=google_drive (temporária) ou google_drive:fatal. */
function fault(p: CloudProviderId) { const f = process.env.MOCK_CLOUD_FAIL; if (!f) return; const [x, mode] = f.split(':'); if (x === p) throw new CloudError(p, `${p} falha simulada`, mode !== 'fatal', 'http'); }
const mock = (p: CloudProviderId): CloudProvider => ({
  id: p,
  authUrl: (state, _cc, redirectUri) => `${redirectUri}?${qs({ code: `mock-code-${randomBytes(6).toString('hex')}`, state })}`,
  exchange: async (code) => {
    if (!code.startsWith('mock-code-')) throw new CloudError(p, `${p} invalid_grant`, false, 'invalid_grant'); fault(p);
    const t = await issue(p); const extra = process.env.MOCK_CLOUD_GRANT; // testes: provedor que concede escopo a mais (ex.: drive inteiro)
    return extra ? { ...t, scopes: [...t.scopes, ...extra.split(' ')] } : t;
  },
  async refresh(rt) {
    fault(p);
    const k = `mockcloud:rt:${h(rt)}`; if ((await redis.getdel(k)) !== p) throw new CloudError(p, `${p} invalid_grant`, false, 'invalid_grant'); // rotação: refresh de uso único
    return issue(p);
  },
  async revoke(token) {
    const pair = await redis.getdel(`mockcloud:pair:${h(token)}`);
    await redis.del(`mockcloud:at:${h(token)}`, `mockcloud:rt:${h(token)}`, ...(pair ? [`mockcloud:rt:${pair}`] : []));
  },
  async upload(at, f) {
    if ((await redis.get(`mockcloud:at:${h(at)}`)) !== p) throw new CloudError(p, `${p} HTTP 401`, false, 'unauthorized');
    fault(p);
    if (f.body.length > MAX_UPLOAD_BYTES[p]) throw new CloudError(p, `${p}: arquivo grande demais`, false, 'too_large');
    const id = randomBytes(8).toString('hex');
    await redis.rpush(`mockcloud:files:${p}`, JSON.stringify({ id, path: `/${FOLDER}/${f.name}`, mime: f.mime, bytes: f.body.length, sha256: createHash('sha256').update(f.body).digest('hex') }));
    return { externalId: id, externalUrl: `https://mock.${p}.example/${FOLDER}/${id}` };
  },
});
/** Inspeção do mock (testes): arquivos recebidos e validade de um token no "provedor". */
export const mockCloud = {
  files: async (p: CloudProviderId) => (await redis.lrange(`mockcloud:files:${p}`, 0, -1)).map((x) => JSON.parse(x) as { id: string; path: string; mime: string; bytes: number; sha256: string }),
  accessValid: async (token: string) => (await redis.exists(`mockcloud:at:${h(token)}`)) === 1,
  refreshValid: async (token: string) => (await redis.exists(`mockcloud:rt:${h(token)}`)) === 1,
};

const REAL: Record<CloudProviderId, CloudProvider> = { google_drive: google, dropbox, onedrive };
const configured: Record<CloudProviderId, () => boolean> = {
  google_drive: () => !!env.GOOGLE_DRIVE_CLIENT_ID && !!env.GOOGLE_DRIVE_CLIENT_SECRET,
  dropbox: () => !!env.DROPBOX_APP_KEY && !!env.DROPBOX_APP_SECRET,
  onedrive: () => !!env.ONEDRIVE_CLIENT_ID && !!env.ONEDRIVE_CLIENT_SECRET,
};
/**
 * Em produção, nuvem simulada ou KMS local não sobem conexão nenhuma (503 "ainda não disponível") sem
 * ALLOW_STUBS_IN_PRODUCTION — sem travar o boot de quem não usa o Módulo 5 (a flag nasce desligada).
 */
export const stubBlocked = () => env.NODE_ENV === 'production' && !env.ALLOW_STUBS_IN_PRODUCTION && (env.CLOUD_MODE === 'mock' || env.KMS_DRIVER === 'local');
export const isConfigured = (p: CloudProviderId) => !stubBlocked() && (env.CLOUD_MODE === 'mock' || configured[p]());
export const cloudProvider = (p: CloudProviderId): CloudProvider => (env.CLOUD_MODE === 'mock' ? mock(p) : REAL[p]);
