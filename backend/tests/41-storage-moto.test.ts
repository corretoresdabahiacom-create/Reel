import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { S3Client, HeadObjectCommand, GetObjectTaggingCommand, PutBucketLifecycleConfigurationCommand, GetBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';
import { env, type Env } from '../src/config/env.js';
import { S3Storage, RAW_SCENE } from '../src/providers/storage.js';

/**
 * Driver S3 contra o moto com AUTENTICAÇÃO IAM (a assinatura SigV4 de cada chamada é conferida) e buckets no formato
 * da produção (criptografia padrão SSE-KMS). Roda com `bash tools/s3-moto/run.sh` (precisa de python3); sem
 * MOTO_S3_CONFIG o arquivo é pulado. Complementa o tests/40 (s3rver + verificador SigV4 das URLs pré-assinadas).
 */
const cfgPath = process.env.MOTO_S3_CONFIG;
const cfg = cfgPath ? (JSON.parse(readFileSync(cfgPath, 'utf8')) as { endpoint: string; id: string; secret: string; kms: string; buckets: Record<'uploads' | 'videos' | 'exports' | 'archive', string> }) : null;
const saved: Partial<Env> = {};
const set = (o: Partial<Env>) => { for (const [k, v] of Object.entries(o)) { (saved as Record<string, unknown>)[k] ??= (env as Record<string, unknown>)[k]; (env as Record<string, unknown>)[k] = v; } };
let s3: S3Storage; let admin: S3Client;
beforeAll(() => {
  if (!cfg) return;
  set({ S3_ENDPOINT: cfg.endpoint, S3_REGION: 'us-east-1', S3_FORCE_PATH_STYLE: true, S3_ACCESS_KEY_ID: cfg.id, S3_SECRET_ACCESS_KEY: cfg.secret, S3_KMS_KEY_ID: '', CDN_BASE_URL: '',
    S3_BUCKET_UPLOADS: cfg.buckets.uploads, S3_BUCKET_VIDEOS: cfg.buckets.videos, S3_BUCKET_EXPORTS: cfg.buckets.exports, S3_BUCKET_ARCHIVE: cfg.buckets.archive });
  s3 = new S3Storage();
  admin = new S3Client({ region: 'us-east-1', endpoint: cfg.endpoint, forcePathStyle: true, credentials: { accessKeyId: cfg.id, secretAccessKey: cfg.secret } });
});
afterAll(() => { for (const [k, v] of Object.entries(saved)) (env as Record<string, unknown>)[k] = v; });

describe.skipIf(!cfg)('driver S3 contra moto com autenticação IAM (SigV4 conferido)', () => {
  it('com a credencial certa: put/get/exists/deletePrefix funcionam', async () => {
    await s3.put('videos', 'projects/m1/final.mp4', Buffer.from('video'), 'video/mp4');
    expect(await s3.exists('videos', 'projects/m1/final.mp4')).toBe(true);
    expect((await s3.get('videos', 'projects/m1/final.mp4')).toString()).toBe('video');
    expect(await s3.deletePrefix('videos', 'projects/m1/')).toBe(1);
    expect(await s3.exists('videos', 'projects/m1/final.mp4')).toBe(false);
  });

  it('com o segredo errado: o servidor recusa a assinatura (SignatureDoesNotMatch)', async () => {
    set({ S3_SECRET_ACCESS_KEY: 'segredo-errado' }); const wrong = new S3Storage(); set({ S3_SECRET_ACCESS_KEY: cfg!.secret });
    await expect(wrong.put('videos', 'projects/m1/x.mp4', Buffer.from('x'), 'video/mp4')).rejects.toMatchObject({ name: 'SignatureDoesNotMatch' });
  });

  it('criptografia: sem cabeçalho, o objeto sai com a KMS padrão do bucket (antes: AES256 fixo trocava por SSE-S3)', async () => {
    await s3.put('videos', 'projects/m2/final.mp4', Buffer.from('v'), 'video/mp4');
    const h = await admin.send(new HeadObjectCommand({ Bucket: cfg!.buckets.videos, Key: 'projects/m2/final.mp4' }));
    expect(h.ServerSideEncryption).toBe('aws:kms'); expect(h.SSEKMSKeyId).toContain(cfg!.kms.split('/').pop());
  });

  it('S3_KMS_KEY_ID explícita também vale', async () => {
    set({ S3_KMS_KEY_ID: cfg!.kms }); const k = new S3Storage(); set({ S3_KMS_KEY_ID: '' });
    await k.put('uploads', 'u/m.png', Buffer.from('p'), 'image/png');
    const h = await admin.send(new HeadObjectCommand({ Bucket: cfg!.buckets.uploads, Key: 'u/m.png' }));
    expect(h.ServerSideEncryption).toBe('aws:kms'); expect(h.SSEKMSKeyId).toContain(cfg!.kms.split('/').pop());
  });

  it('tags de retenção gravadas no objeto: cena bruta tem retention=raw-90d; vídeo final, nenhuma', async () => {
    await s3.put('videos', 'projects/m3/scenes/s1.mp4', Buffer.from('s'), 'video/mp4', RAW_SCENE);
    await s3.put('videos', 'projects/m3/final.mp4', Buffer.from('f'), 'video/mp4');
    const t1 = await admin.send(new GetObjectTaggingCommand({ Bucket: cfg!.buckets.videos, Key: 'projects/m3/scenes/s1.mp4' }));
    const t2 = await admin.send(new GetObjectTaggingCommand({ Bucket: cfg!.buckets.videos, Key: 'projects/m3/final.mp4' }));
    expect(t1.TagSet).toEqual([{ Key: 'retention', Value: 'raw-90d' }]); expect(t2.TagSet ?? []).toEqual([]);
  });

  it('a regra de ciclo de vida do Terraform (filtro por tag) é aceita pela API do S3', async () => {
    const Rules = [
      { ID: 'raw-scenes-90d', Status: 'Enabled' as const, Filter: { Tag: { Key: 'retention', Value: 'raw-90d' } }, Transitions: [{ Days: 30, StorageClass: 'STANDARD_IA' as const }], Expiration: { Days: 90 } },
      { ID: 'noncurrent-7d', Status: 'Enabled' as const, Filter: { Prefix: '' }, NoncurrentVersionExpiration: { NoncurrentDays: 7 }, AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 } },
    ];
    await admin.send(new PutBucketLifecycleConfigurationCommand({ Bucket: cfg!.buckets.videos, LifecycleConfiguration: { Rules } }));
    const got = await admin.send(new GetBucketLifecycleConfigurationCommand({ Bucket: cfg!.buckets.videos }));
    expect(got.Rules?.find((r) => r.ID === 'raw-scenes-90d')?.Filter).toMatchObject({ Tag: { Key: 'retention', Value: 'raw-90d' } });
  });
});
