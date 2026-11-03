import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
/** Cofre de tokens. REGRA: tokens OAuth e credenciais de afiliado NUNCA vão para localStorage/sessionStorage/IndexedDB.
 *  - Web: cookie httpOnly + Secure + SameSite=Lax emitido pelo backend; o JS do navegador não enxerga o token.
 *  - Mobile (Capacitor): Keychain (iOS) / Keystore (Android) via plugin de armazenamento seguro.
 *  - Servidor: AES-256-GCM em repouso, chave no KMS/Secret Manager (TOKEN_ENCRYPTION_KEY, 32 bytes base64). */
export interface TokenVault { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void>; remove(k: string): Promise<void> }
export function encryptToken(plain: string, keyB64: string): string {
  const key = Buffer.from(keyB64, 'base64'); if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY deve ter 32 bytes (base64).');
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key, iv); const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}
export function decryptToken(payload: string, keyB64: string): string {
  const [v, iv, tag, enc] = payload.split('.'); if (v !== 'v1') throw new Error('Formato de token criptografado desconhecido.');
  const d = createDecipheriv('aes-256-gcm', Buffer.from(keyB64, 'base64'), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}
/** Em memória (testes/protótipo). Em produção: adapters KeychainVault (Capacitor SecureStorage) e HttpOnlyCookieVault (backend). */
export class MemoryVault implements TokenVault { private m = new Map<string, string>(); async get(k: string) { return this.m.get(k) ?? null; } async set(k: string, v: string) { this.m.set(k, v); } async remove(k: string) { this.m.delete(k); } }
// TODO: senhas (se houver login próprio): Argon2id (pacote `argon2`, memoryCost ≥ 64 MiB, timeCost ≥ 3). Hoje o login é social (OAuth), sem senha.
