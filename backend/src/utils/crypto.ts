import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/** AES-256-GCM. Formato: `v1:<keyId>:<iv b64>:<tag b64>:<ciphertext b64>`. Chave de 32 bytes (KMS/Secrets Manager em prod). */
function key(): Buffer {
  const k = Buffer.from(env.DATA_ENCRYPTION_KEY, 'base64');
  if (k.length !== 32) throw new Error('DATA_ENCRYPTION_KEY deve ter 32 bytes (base64)');
  return k;
}
export function encrypt(plain: string): string {
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', env.DATA_ENCRYPTION_KEY_ID, iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}
export function decrypt(blob: string): string {
  const [v, , iv, tag, ct] = blob.split(':');
  if (v !== 'v1' || !iv || !tag || !ct) throw new Error('formato de ciphertext inválido');
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
}
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const hmacHex = (secret: string, data: string | Buffer) => createHmac('sha256', secret).update(data).digest('hex');
export const hashIp = (ip: string) => createHmac('sha256', env.IP_HASH_SALT).update(ip).digest('hex').slice(0, 32);
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y);
}
/** AES-256-GCM para binários (ex.: amostra de voz do consentimento). Formato: 'NXB1' | iv(12) | tag(16) | ciphertext. */
export function encryptBuffer(plain: Buffer): Buffer {
  const iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([Buffer.from('NXB1'), iv, c.getAuthTag(), ct]);
}
export function decryptBuffer(blob: Buffer): Buffer {
  if (blob.length < 32 || blob.subarray(0, 4).toString() !== 'NXB1') throw new Error('formato de ciphertext inválido');
  const d = createDecipheriv('aes-256-gcm', key(), blob.subarray(4, 16)); d.setAuthTag(blob.subarray(16, 32));
  return Buffer.concat([d.update(blob.subarray(32)), d.final()]);
}
