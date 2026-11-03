import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateKeyPairSync, createVerify } from 'node:crypto';
// @ts-expect-error s3rver não publica tipos
import S3rver from 's3rver';
import { env, productionProblems, type Env } from '../src/config/env.js';
import { S3Storage, RAW_SCENE, cdnSignedUrl, cdnEnabled } from '../src/providers/storage.js';
import { verifyPresignedV4 } from './sigv4-verify.js';

/**
 * Driver S3 contra um servidor compatível com S3 (s3rver: expiração de URL pré-assinada, Range, Content-Disposition).
 * O s3rver NÃO confere a assinatura SigV4: isso é feito por um verificador independente (tests/sigv4-verify.ts, calibrado no
 * vetor oficial da AWS) e, para chamadas assinadas por cabeçalho, pelo moto com autenticação IAM (tests/41, opcional).
 * Antes deste teste o driver S3 nunca tinha rodado fora da AWS de produção ("não verificável").
 * Limites do emulador: não aplica SSE/KMS nem grava tags vindas no cabeçalho do PUT — por isso esses dois itens
 * são conferidos no que o SDK ENVIA (o comportamento da AWS para esses cabeçalhos é documentado).
 */
const BUCKETS = { S3_BUCKET_UPLOADS: 't-uploads', S3_BUCKET_VIDEOS: 't-videos', S3_BUCKET_EXPORTS: 't-exports', S3_BUCKET_ARCHIVE: 't-archive' } as const;
const saved: Partial<Env> = {}; let server: { run(): Promise<{ port: number }>; close(): Promise<void> }; let dir: string; let s3: S3Storage;
const set = (o: Partial<Env>) => { for (const [k, v] of Object.entries(o)) { (saved as Record<string, unknown>)[k] ??= (env as Record<string, unknown>)[k]; (env as Record<string, unknown>)[k] = v; } };
const sent: Array<Record<string, string>> = [];
beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 's3rver-'));
  server = new S3rver({ port: 0, address: '127.0.0.1', silent: true, directory: dir, configureBuckets: Object.values(BUCKETS).map((name) => ({ name })) });
  const { port } = await server.run();
  set({ ...BUCKETS, S3_ENDPOINT: `http://127.0.0.1:${port}`, S3_REGION: 'us-east-1', S3_FORCE_PATH_STYLE: true, S3_ACCESS_KEY_ID: 'S3RVER', S3_SECRET_ACCESS_KEY: 'S3RVER', S3_KMS_KEY_ID: '', CDN_BASE_URL: '', CLOUDFRONT_KEY_PAIR_ID: '', CLOUDFRONT_PRIVATE_KEY: '' });
  s3 = new S3Storage();
  // captura os cabeçalhos que o SDK manda de verdade (para SSE e tags)
  (s3 as unknown as { c: { middlewareStack: { add: (m: unknown, o: unknown) => void } } }).c.middlewareStack.add((next: (a: unknown) => unknown) => (args: { request: { headers: Record<string, string> } }) => { sent.push({ ...args.request.headers }); return next(args); }, { step: 'finalizeRequest', name: 'capture' });
});
afterAll(async () => { for (const [k, v] of Object.entries(saved)) (env as Record<string, unknown>)[k] = v; await server?.close(); rmSync(dir, { recursive: true, force: true }); });

const video = Buffer.alloc(4096, 0); video.write('ftypisom', 4); for (let i = 0; i < video.length; i++) video[i] ^= i % 251;

describe('driver S3 contra servidor compatível com S3 (s3rver) + verificador SigV4', () => {
  it('put/get/exists e URL pré-assinada baixa sem credenciais, com o Content-Type certo', async () => {
    await s3.put('videos', 'projects/p1/final-1.mp4', video, 'video/mp4');
    expect(await s3.exists('videos', 'projects/p1/final-1.mp4')).toBe(true);
    expect((await s3.get('videos', 'projects/p1/final-1.mp4')).equals(video)).toBe(true);
    const url = await s3.signedGetUrl('videos', 'projects/p1/final-1.mp4', 60);
    expect(url).toMatch(/X-Amz-Signature=/);
    const r = await fetch(url); expect(r.status).toBe(200); expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(Buffer.from(await r.arrayBuffer()).equals(video)).toBe(true);
  });

  it('assinatura SigV4 da URL é válida pela regra da AWS e qualquer adulteração invalida (verificador calibrado no vetor oficial)', async () => {
    // vetor oficial da documentação da AWS: garante que o verificador segue a especificação
    const vec = 'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404';
    expect(verifyPresignedV4(vec, 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', Date.UTC(2013, 4, 24, 1))).toEqual({ signatureValid: true, fresh: true });
    const url = await s3.signedGetUrl('videos', 'projects/p1/final-1.mp4', 60);
    expect(verifyPresignedV4(url, 'S3RVER')).toEqual({ signatureValid: true, fresh: true });
    expect(verifyPresignedV4(url, 'outro-segredo').signatureValid).toBe(false);
    expect(verifyPresignedV4(url.replace('final-1.mp4', 'final-2.mp4'), 'S3RVER').signatureValid).toBe(false);
    expect(verifyPresignedV4(url.replace(/X-Amz-Expires=\d+/, 'X-Amz-Expires=604800'), 'S3RVER').signatureValid).toBe(false);
    expect(verifyPresignedV4(url, 'S3RVER', Date.now() + 61_000).fresh).toBe(false);
  });

  it('URL vencida é recusada pelo servidor', async () => {
    const short = await s3.signedGetUrl('videos', 'projects/p1/final-1.mp4', 1);
    await new Promise((r) => setTimeout(r, 2100));
    const exp = await fetch(short); expect(exp.status).toBe(403); expect(await exp.text()).toMatch(/expired/i);
  });

  it('Range (o <video> pede pedaços para avançar/voltar) → 206 com os bytes certos', async () => {
    const url = await s3.signedGetUrl('videos', 'projects/p1/final-1.mp4', 60);
    const r = await fetch(url, { headers: { Range: 'bytes=100-199' } });
    expect(r.status).toBe(206); expect(r.headers.get('content-range')).toBe(`bytes 100-199/${video.length}`);
    expect(Buffer.from(await r.arrayBuffer()).equals(video.subarray(100, 200))).toBe(true);
  });

  it('download com nome: Content-Disposition attachment vem da origem', async () => {
    const url = await s3.signedGetUrl('videos', 'projects/p1/final-1.mp4', 60, { downloadName: 'Meu vídeo.mp4' });
    const r = await fetch(url); expect(r.status).toBe(200); expect(r.headers.get('content-disposition')).toMatch(/^attachment; filename=/);
  });

  it('criptografia: sem AES256 fixo (vale a KMS do bucket); com S3_KMS_KEY_ID manda aws:kms + a chave', async () => {
    sent.length = 0; await s3.put('uploads', 'u1/a.png', Buffer.from('x'), 'image/png');
    const put1 = sent.find((h) => h['content-type'] === 'image/png')!;
    expect(put1['x-amz-server-side-encryption']).toBeUndefined();
    set({ S3_KMS_KEY_ID: 'arn:aws:kms:sa-east-1:111122223333:key/teste' }); sent.length = 0;
    await s3.put('uploads', 'u1/b.png', Buffer.from('y'), 'image/png');
    const put2 = sent.find((h) => h['content-type'] === 'image/png')!;
    expect(put2['x-amz-server-side-encryption']).toBe('aws:kms'); expect(put2['x-amz-server-side-encryption-aws-kms-key-id']).toBe('arn:aws:kms:sa-east-1:111122223333:key/teste');
    set({ S3_KMS_KEY_ID: '' });
  });

  it('retenção: cena bruta vai com a tag retention=raw-90d; vídeo final vai sem tag (não expira)', async () => {
    sent.length = 0; await s3.put('videos', 'projects/p1/scenes/s1.mp4', video, 'video/mp4', RAW_SCENE);
    expect(sent.find((h) => h['x-amz-tagging'])?.['x-amz-tagging']).toBe('retention=raw-90d');
    sent.length = 0; await s3.put('videos', 'projects/p1/final-9.mp4', video, 'video/mp4');
    expect(sent.some((h) => h['x-amz-tagging'])).toBe(false);
  });

  it('deletePrefix apaga só o projeto pedido', async () => {
    await s3.put('videos', 'projects/p2/final.mp4', video, 'video/mp4'); await s3.put('videos', 'projects/p2/scenes/a.mp4', video, 'video/mp4');
    const before = await s3.exists('videos', 'projects/p1/final-1.mp4');
    expect(await s3.deletePrefix('videos', 'projects/p2/')).toBe(2);
    expect(await s3.exists('videos', 'projects/p2/final.mp4')).toBe(false); expect(await s3.exists('videos', 'projects/p1/final-1.mp4')).toBe(before);
  });
});

describe('CDN (CloudFront com URL assinada)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const fromCf = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/'), 'base64');

  it('desligado sem a configuração completa: vídeo continua por URL pré-assinada do S3', async () => {
    set({ CDN_BASE_URL: 'https://d111.cloudfront.net', CLOUDFRONT_KEY_PAIR_ID: '', CLOUDFRONT_PRIVATE_KEY: '' });
    expect(cdnEnabled()).toBe(false); expect(await s3.signedGetUrl('videos', 'projects/p1/final-1.mp4', 60)).toMatch(/X-Amz-Signature=/);
  });

  it('ligado: vídeos saem pelo CDN com assinatura RSA válida (verificada com a chave pública, formato da AWS) e expiração certa', async () => {
    set({ CDN_BASE_URL: 'https://d111.cloudfront.net/', CLOUDFRONT_KEY_PAIR_ID: 'K2JCJMDEHXQW5F', CLOUDFRONT_PRIVATE_KEY: privateKey.replace(/\n/g, '\\n') /* como vem do Secrets Manager/env */ });
    expect(cdnEnabled()).toBe(true);
    const t0 = Date.now(); const url = await s3.signedGetUrl('videos', 'projects/p1/final 1.mp4', 3600);
    const u = new URL(url); expect(u.origin + u.pathname).toBe('https://d111.cloudfront.net/projects/p1/final%201.mp4');
    expect(u.searchParams.get('Key-Pair-Id')).toBe('K2JCJMDEHXQW5F');
    const expires = Number(u.searchParams.get('Expires')); expect(Math.abs(expires - Math.floor((t0 + 3600_000) / 1000))).toBeLessThanOrEqual(2);
    // política "canned" exatamente como a CloudFront reconstrói na borda (docs AWS: private-content-creating-signed-url-canned-policy)
    const policy = JSON.stringify({ Statement: [{ Resource: 'https://d111.cloudfront.net/projects/p1/final%201.mp4', Condition: { DateLessThan: { 'AWS:EpochTime': expires } } }] });
    expect(createVerify('RSA-SHA1').update(policy).verify(publicKey, fromCf(u.searchParams.get('Signature')!))).toBe(true);
    // adulterar o recurso ou a expiração invalida a assinatura
    expect(createVerify('RSA-SHA1').update(policy.replace('final%201', 'final%202')).verify(publicKey, fromCf(u.searchParams.get('Signature')!))).toBe(false);
    expect(createVerify('RSA-SHA1').update(policy.replace(String(expires), String(expires + 3600))).verify(publicKey, fromCf(u.searchParams.get('Signature')!))).toBe(false);
  });

  it('com CDN ligado: fotos (uploads) e download com nome continuam no S3', async () => {
    expect(await s3.signedGetUrl('uploads', 'u1/a.png', 60)).toMatch(/X-Amz-Signature=/);
    expect(await s3.signedGetUrl('videos', 'projects/p1/final-1.mp4', 60, { downloadName: 'x.mp4' })).toMatch(/X-Amz-Signature=/);
    expect(cdnSignedUrl('projects/p1/a.mp4', 60)).toMatch(/^https:\/\/d111\.cloudfront\.net\/projects\/p1\/a\.mp4\?Expires=\d+&Key-Pair-Id=K2JCJMDEHXQW5F&Signature=/);
  });

  it('produção recusa CDN sem https ou meio configurado', () => {
    const base = { ...env, NODE_ENV: 'production' } as Env;
    expect(productionProblems({ ...base, CDN_BASE_URL: 'http://cdn.x', CLOUDFRONT_KEY_PAIR_ID: 'K', CLOUDFRONT_PRIVATE_KEY: privateKey }).join()).toMatch(/CDN_BASE_URL sem https/);
    expect(productionProblems({ ...base, CDN_BASE_URL: 'https://cdn.x', CLOUDFRONT_KEY_PAIR_ID: 'K', CLOUDFRONT_PRIVATE_KEY: '' }).join()).toMatch(/CDN meio configurado/);
    expect(productionProblems({ ...base, CDN_BASE_URL: 'https://cdn.x', CLOUDFRONT_KEY_PAIR_ID: 'K', CLOUDFRONT_PRIVATE_KEY: privateKey }).join()).not.toMatch(/CDN/);
  });
});
