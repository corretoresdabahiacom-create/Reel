import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getSignedUrl as cloudFrontSign } from '@aws-sdk/cloudfront-signer'; // signer oficial da AWS (URL canned policy)
import { mkdir, writeFile, readFile, rm, stat, readdir } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { env } from '../config/env.js';
import { hmacHex, safeEqual } from '../utils/crypto.js';

/** `archive` (Módulo 5): Nuvem NexusReel — guarda de longo prazo, separada do storage operacional dos projetos. */
export type Bucket = 'uploads' | 'videos' | 'exports' | 'archive';
export const bucketName = (b: Bucket) => ({ uploads: env.S3_BUCKET_UPLOADS, videos: env.S3_BUCKET_VIDEOS, exports: env.S3_BUCKET_EXPORTS, archive: env.S3_BUCKET_ARCHIVE })[b];

/** Tags S3 do objeto. A regra de ciclo de vida do Terraform expira SÓ o que tem `retention=raw-90d` (cenas brutas);
 *  antes ela usava o prefixo projects/ e apagaria também vídeo final, dublagens e áudio em 90 dias. */
export interface PutOpts { tags?: Record<string, string> }
export const RAW_SCENE: PutOpts = { tags: { retention: 'raw-90d' } };
/** CDN ligado só com a configuração completa; senão, URL pré-assinada do S3 (o app nunca quebra por CDN pela metade). */
export const cdnEnabled = (): boolean => !!(env.CDN_BASE_URL && env.CLOUDFRONT_KEY_PAIR_ID && env.CLOUDFRONT_PRIVATE_KEY);
export const cdnSignedUrl = (key: string, ttlSec: number, now = Date.now()): string => cloudFrontSign({
  url: `${env.CDN_BASE_URL.replace(/\/+$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`,
  keyPairId: env.CLOUDFRONT_KEY_PAIR_ID, privateKey: env.CLOUDFRONT_PRIVATE_KEY.replace(/\\n/g, '\n'), dateLessThan: new Date(now + ttlSec * 1000).toISOString() });

export interface Storage {
  put(b: Bucket, key: string, body: Buffer | string, contentType: string, opts?: PutOpts): Promise<void>;
  get(b: Bucket, key: string): Promise<Buffer>;
  exists(b: Bucket, key: string): Promise<boolean>;
  /** `downloadName`: nome sugerido ao baixar (Content-Disposition: attachment). */
  signedGetUrl(b: Bucket, key: string, ttlSec?: number, opts?: { downloadName?: string }): Promise<string>;
  signedPutUrl(b: Bucket, key: string, contentType: string, ttlSec?: number): Promise<string>;
  delete(b: Bucket, key: string): Promise<void>;
  deletePrefix(b: Bucket, prefix: string): Promise<number>;
}

/** Nome de arquivo seguro para Content-Disposition e para a nuvem do usuário (sem barra, aspas nem controle). */
export const safeFileName = (n: string) => (n.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._ -]+/g, '-').replace(/\s+/g, ' ').replace(/^[.\s-]+/, '').trim().slice(0, 100) || 'video');

/** Driver local (dev/test): arquivos em disco + URLs assinadas por HMAC servidas por GET /storage/... */
class LocalStorage implements Storage {
  private root = resolve(env.LOCAL_STORAGE_DIR);
  private path(b: Bucket, key: string) { const base = resolve(this.root, bucketName(b)); const p = resolve(base, key); if (!p.startsWith(base + sep)) throw new Error('key inválida'); return p; }
  /** Para servir em fluxo com Range (vídeo): caminho e tamanho do arquivo, ou null se não existe. */
  async fileOf(b: Bucket, key: string): Promise<{ path: string; size: number } | null> { const p = this.path(b, key); return stat(p).then((st) => (st.isFile() ? { path: p, size: st.size } : null), () => null); }
  async put(b: Bucket, key: string, body: Buffer | string) { const p = this.path(b, key); await mkdir(dirname(p), { recursive: true }); await writeFile(p, body); }
  async get(b: Bucket, key: string) { return readFile(this.path(b, key)); }
  async exists(b: Bucket, key: string) { return stat(this.path(b, key)).then(() => true, () => false); }
  private sign(b: Bucket, key: string, exp: number, method: string) { return hmacHex(env.JWT_SECRET, `${method}:${b}:${key}:${exp}`); }
  async signedGetUrl(b: Bucket, key: string, ttl = env.SIGNED_URL_TTL_SEC, o?: { downloadName?: string }) { const exp = Math.floor(Date.now() / 1000) + ttl; return `${env.PUBLIC_API_URL}/api/v1/storage/${b}/${key}?exp=${exp}&sig=${this.sign(b, key, exp, 'GET')}${o?.downloadName ? `&dl=${encodeURIComponent(safeFileName(o.downloadName))}` : ''}`; }
  async signedPutUrl(b: Bucket, key: string, _ct: string, ttl = 900) { const exp = Math.floor(Date.now() / 1000) + ttl; return `${env.PUBLIC_API_URL}/api/v1/storage/${b}/${key}?exp=${exp}&sig=${this.sign(b, key, exp, 'PUT')}`; }
  verify(method: string, b: Bucket, key: string, exp: number, sig: string) { return exp > Date.now() / 1000 && safeEqual(sig, this.sign(b, key, exp, method)); }
  async delete(b: Bucket, key: string) { await rm(this.path(b, key), { force: true }); }
  async deletePrefix(b: Bucket, prefix: string) {
    const dir = this.path(b, prefix); let n = 0;
    const walk = async (d: string): Promise<void> => { for (const e of await readdir(d, { withFileTypes: true }).catch(() => [])) { if (e.isDirectory()) await walk(join(d, e.name)); else n++; } };
    await walk(dir); await rm(dir, { recursive: true, force: true }); return n;
  }
}

export class S3Storage implements Storage {
  private c = new S3Client({ region: env.S3_REGION, endpoint: env.S3_ENDPOINT || undefined, forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: env.S3_ACCESS_KEY_ID ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } : undefined });
  async put(b: Bucket, key: string, body: Buffer | string, ct: string, o?: PutOpts) {
    // Sem 'AES256' fixo (forçava SSE-S3 e ignorava a chave KMS do bucket): vale a criptografia padrão do bucket, ou a KMS explícita.
    const sse = env.S3_KMS_KEY_ID ? { ServerSideEncryption: 'aws:kms' as const, SSEKMSKeyId: env.S3_KMS_KEY_ID } : {};
    await this.c.send(new PutObjectCommand({ Bucket: bucketName(b), Key: key, Body: body, ContentType: ct, ...sse, ...(o?.tags ? { Tagging: new URLSearchParams(o.tags).toString() } : {}) }));
  }
  async get(b: Bucket, key: string) { const r = await this.c.send(new GetObjectCommand({ Bucket: bucketName(b), Key: key })); return Buffer.from(await r.Body!.transformToByteArray()); }
  async exists(b: Bucket, key: string) { return this.c.send(new HeadObjectCommand({ Bucket: bucketName(b), Key: key })).then(() => true, () => false); }
  signedGetUrl(b: Bucket, key: string, ttl = env.SIGNED_URL_TTL_SEC, o?: { downloadName?: string }) {
    // Vídeos pelo CDN (URL assinada do CloudFront). Download com nome pede Content-Disposition da origem → fica no S3.
    if (b === 'videos' && !o?.downloadName && cdnEnabled()) return Promise.resolve(cdnSignedUrl(key, ttl));
    return getSignedUrl(this.c, new GetObjectCommand({ Bucket: bucketName(b), Key: key, ResponseContentDisposition: o?.downloadName ? `attachment; filename="${safeFileName(o.downloadName)}"` : undefined }), { expiresIn: ttl }); }
  signedPutUrl(b: Bucket, key: string, ct: string, ttl = 900) { return getSignedUrl(this.c, new PutObjectCommand({ Bucket: bucketName(b), Key: key, ContentType: ct }), { expiresIn: ttl }); }
  async delete(b: Bucket, key: string) { await this.c.send(new DeleteObjectCommand({ Bucket: bucketName(b), Key: key })); }
  async deletePrefix(b: Bucket, prefix: string) {
    let n = 0, token: string | undefined;
    do { const r = await this.c.send(new ListObjectsV2Command({ Bucket: bucketName(b), Prefix: prefix, ContinuationToken: token }));
      for (const o of r.Contents ?? []) { await this.c.send(new DeleteObjectCommand({ Bucket: bucketName(b), Key: o.Key! })); n++; } token = r.NextContinuationToken; } while (token);
    return n;
  }
}
export const storage: Storage & { verify?: LocalStorage['verify']; fileOf?: LocalStorage['fileOf'] } = env.STORAGE_DRIVER === 's3' ? new S3Storage() : new LocalStorage();
/** Magic bytes: valida o tipo REAL do upload (não confia no Content-Type do cliente). */
export function sniffMime(buf: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | 'video/mp4' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.length >= 12 && buf.subarray(4, 8).toString() === 'ftyp') return 'video/mp4';
  return null;
}
/** Referências de arquivo no banco: `uploads/<userId>/<uuid>.jpg` (bucket uploads) ou chave direta no bucket `videos`. */
export const refLocation = (ref: string): { bucket: Bucket; key: string } => (ref.startsWith('uploads/') ? { bucket: 'uploads', key: ref.slice(8) } : { bucket: 'videos', key: ref });
export const signRef = (ref: string, ttl?: number) => { const l = refLocation(ref); return storage.signedGetUrl(l.bucket, l.key, ttl); };
