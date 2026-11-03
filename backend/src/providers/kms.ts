import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * KMS (Módulo 5): envelope encryption. Cada segredo é cifrado com uma CHAVE DE DADOS nova (AES-256), e essa chave é
 * embrulhada pela chave mestra do KMS. O banco só guarda o texto cifrado + a chave de dados embrulhada; a chave mestra
 * nunca sai do KMS.
 * - `aws`: AWS KMS (GenerateDataKey/Decrypt) com `EncryptionContext`. A role da task já tem kms:GenerateDataKey/Decrypt na
 *   chave do stack (infra/terraform/modules/app).
 * - `local` (dev/test): chave mestra derivada (HKDF) de DATA_ENCRYPTION_KEY. Em produção conta como stub (env.ts recusa
 *   sem ALLOW_STUBS_IN_PRODUCTION).
 */
export interface DataKey { plain: Buffer; wrapped: string }
interface KmsDriver { keyId(): string; generate(ctx: Record<string, string>): Promise<DataKey>; unwrap(wrapped: string, ctx: Record<string, string>, keyId: string): Promise<Buffer> }

const ctxAad = (ctx: Record<string, string>) => Buffer.from(JSON.stringify(Object.keys(ctx).sort().map((k) => [k, ctx[k]])));
class LocalKms implements KmsDriver {
  private kek = Buffer.from(hkdfSync('sha256', Buffer.from(env.DATA_ENCRYPTION_KEY, 'utf8'), 'nexus-kms-local', 'kek-v1', 32));
  keyId() { return 'local-kek-v1'; }
  async generate(ctx: Record<string, string>): Promise<DataKey> {
    const plain = randomBytes(32), iv = randomBytes(12); const c = createCipheriv('aes-256-gcm', this.kek, iv); c.setAAD(ctxAad(ctx));
    const ct = Buffer.concat([c.update(plain), c.final()]); return { plain, wrapped: Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64') };
  }
  async unwrap(wrapped: string, ctx: Record<string, string>): Promise<Buffer> {
    const b = Buffer.from(wrapped, 'base64'); const d = createDecipheriv('aes-256-gcm', this.kek, b.subarray(0, 12)); d.setAAD(ctxAad(ctx)); d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]);
  }
}
class AwsKms implements KmsDriver {
  private client: Promise<{ send: (c: unknown) => Promise<any>; GenerateDataKeyCommand: any; DecryptCommand: any }> | undefined;
  private c() {
    this.client ??= import('@aws-sdk/client-kms').then((m) => { const k = new m.KMSClient({ region: env.S3_REGION }); return { send: (x: unknown) => k.send(x as never), GenerateDataKeyCommand: m.GenerateDataKeyCommand, DecryptCommand: m.DecryptCommand }; });
    return this.client;
  }
  keyId() { return env.KMS_KEY_ID; }
  async generate(ctx: Record<string, string>): Promise<DataKey> {
    const k = await this.c(); const r = await k.send(new k.GenerateDataKeyCommand({ KeyId: env.KMS_KEY_ID, KeySpec: 'AES_256', EncryptionContext: ctx }));
    return { plain: Buffer.from(r.Plaintext as Uint8Array), wrapped: Buffer.from(r.CiphertextBlob as Uint8Array).toString('base64') };
  }
  async unwrap(wrapped: string, ctx: Record<string, string>, keyId: string): Promise<Buffer> {
    const k = await this.c(); const r = await k.send(new k.DecryptCommand({ CiphertextBlob: Buffer.from(wrapped, 'base64'), EncryptionContext: ctx, KeyId: keyId }));
    return Buffer.from(r.Plaintext as Uint8Array);
  }
}
export const kms: KmsDriver = env.KMS_DRIVER === 'aws' ? new AwsKms() : new LocalKms();

/**
 * Cifra `plain` com AES-256-GCM e uma chave de dados nova. `aad` amarra o texto cifrado à linha/campo (trocar o token de
 * uma linha para outra falha na abertura). Formato: `k1:<keyId b64url>:<chave embrulhada b64>:<iv b64>:<tag b64>:<ct b64>`.
 */
export async function sealSecret(plain: string, aad: string, ctx: Record<string, string>): Promise<{ blob: string; keyId: string }> {
  const dk = await kms.generate(ctx); const iv = randomBytes(12);
  try {
    const c = createCipheriv('aes-256-gcm', dk.plain, iv); c.setAAD(Buffer.from(aad)); const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    const keyId = kms.keyId(); return { blob: ['k1', Buffer.from(keyId).toString('base64url'), dk.wrapped, iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':'), keyId };
  } finally { dk.plain.fill(0); }
}
export async function openSecret(blob: string, aad: string, ctx: Record<string, string>): Promise<string> {
  const [v, kid, wrapped, iv, tag, ct] = blob.split(':');
  if (v !== 'k1' || !kid || !wrapped || !iv || !tag || !ct) throw new Error('formato de segredo inválido');
  const key = await kms.unwrap(wrapped, ctx, Buffer.from(kid, 'base64url').toString());
  try {
    const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64')); d.setAAD(Buffer.from(aad)); d.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8');
  } finally { key.fill(0); }
}
