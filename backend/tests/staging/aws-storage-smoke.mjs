// Teste de fumaça do STORAGE NA AWS REAL (staging), para rodar no CD logo depois do deploy em staging.
// Fecha o que não dá para verificar fora da AWS: CloudFront de verdade exigindo assinatura, S3 recusando SigV4
// adulterado, criptografia KMS aplicada, tags/ciclo de vida reais e exclusão apagando o objeto no bucket.
//
// Uso (no CI, com a role da AWS já assumida):  node tests/staging/aws-storage-smoke.mjs
//   STAGING_API_URL      (padrão https://api.staging.nexusreel.app)
//   STAGING_NAME         (padrão nexusreel-staging → buckets <nome>-videos / <nome>-uploads)
//   STAGING_KMS_KEY_ARN  (opcional: confere que os objetos usam exatamente essa chave)
//   SMOKE_TARGET=local   (ensaio local contra a API + s3rver: pula o que só a AWS faz — CDN, SigV4, KMS, lifecycle)
// Permissões da role: s3:GetObject/HeadObject/GetObjectTagging/GetLifecycleConfiguration nos buckets do ambiente.
/* global process, console, setTimeout, fetch, crypto, Buffer, URL */
import { S3Client, HeadObjectCommand, GetObjectTaggingCommand, GetBucketLifecycleConfigurationCommand } from '@aws-sdk/client-s3';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const API = (process.env.STAGING_API_URL ?? 'https://api.staging.nexusreel.app').replace(/\/$/, '');
const NAME = process.env.STAGING_NAME ?? 'nexusreel-staging';
const AWS = (process.env.SMOKE_TARGET ?? 'aws') === 'aws';
const BUCKET = { videos: process.env.STAGING_BUCKET_VIDEOS ?? `${NAME}-videos`, uploads: process.env.STAGING_BUCKET_UPLOADS ?? `${NAME}-uploads` };
const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'sa-east-1', ...(process.env.SMOKE_S3_ENDPOINT ? { endpoint: process.env.SMOKE_S3_ENDPOINT, forcePathStyle: true } : {}) });
const res = []; const ok = (n, c, x = '') => { res.push(!!c); console.log(`${c ? 'OK  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };
const skip = (n) => console.log(`--   ${n} (só na AWS)`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let token = '';
async function api(method, path, body, raw) {
  const r = await fetch(API + '/api/v1' + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(raw ? { 'content-type': 'image/png' } : body ? { 'content-type': 'application/json' } : {}), 'idempotency-key': crypto.randomUUID() }, body: raw ?? (body ? JSON.stringify(body) : undefined) });
  const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch { /* corpo não-JSON */ }
  if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${t.slice(0, 200)}`); return j;
}
const poll = async (fn, ms = 300_000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('tempo esgotado'); await sleep(1500); } };
/** Chave do objeto a partir da URL (CloudFront, S3 virtual-hosted ou path-style). */
const keyOf = (url, bucket) => { const u = new URL(url); let p = decodeURIComponent(u.pathname.slice(1)); if (p.startsWith(bucket + '/')) p = p.slice(bucket.length + 1); return p; };
const status = (u, init) => fetch(u, init).then((r) => r.status).catch(() => 0);
const head = (Bucket, Key) => s3.send(new HeadObjectCommand({ Bucket, Key })).then((h) => h, (e) => ({ missing: e?.$metadata?.httpStatusCode === 404 || e?.name === 'NotFound', e }));

try {
  // ---- 1. fluxo real pela API: usuário, 3 fotos, projeto, cenas e montagem (IA simulada em staging) ----
  const email = `smoke-storage-${Date.now()}@test.dev`;
  token = (await api('POST', '/auth/register', { email, password: `Sm0ke!${crypto.randomUUID()}`, name: 'Smoke', birthDate: '1990-01-01' })).accessToken;
  const dir = mkdtempSync(join(tmpdir(), 'smoke-')); const refs = [];
  for (const c of ['red', 'green', 'blue']) {
    const f = join(dir, `${c}.png`); spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `color=c=${c}:s=96x128`, '-frames:v', '1', '-y', f]);
    refs.push((await api('PUT', '/uploads/photo', null, readFileSync(f))).ref);
  }
  const pr = await api('POST', '/projects', { title: 'Smoke storage', script: 'Primeira frase do teste. Segunda frase do teste.', photos: refs, locale: 'pt-BR' });
  await api('POST', `/projects/${pr.id}/storyboard`, {});
  const sb = await poll(async () => { const x = await api('GET', `/projects/${pr.id}`); return x.scenes?.length ? x : null; });
  await api('POST', `/projects/${pr.id}/scenes/${sb.scenes[0].id}/generate`, { chain: true });
  await poll(async () => { const x = await api('GET', `/projects/${pr.id}`); return x.scenes.every((s) => s.status === 'done') ? x : null; });
  await api('POST', `/projects/${pr.id}/assemble`, {});
  const p = await poll(async () => { const x = await api('GET', `/projects/${pr.id}`); return x.status === 'ready' && x.finalVideoUrl ? x : x.status === 'failed' ? x : null; });
  ok('fluxo real: projeto pronto com vídeo final', p.status === 'ready', p.status);
  const finalKey = keyOf(p.finalVideoUrl, BUCKET.videos); const sceneKey = keyOf(p.scenes[0].videoUrl, BUCKET.videos); const photoKey = keyOf(p.thumbnailUrl, BUCKET.uploads);

  // ---- 2. vídeo final: CDN com URL assinada ----
  const v = new URL(p.finalVideoUrl);
  if (AWS) {
    ok('vídeo sai pelo CloudFront com URL assinada', /cloudfront\.net$|^cdn\./.test(v.hostname) && v.searchParams.has('Signature') && v.searchParams.has('Key-Pair-Id'), v.hostname);
    const unsigned = `${v.origin}${v.pathname}`;
    ok('CloudFront recusa a mesma URL sem assinatura (403)', (await status(unsigned)) === 403);
    const tampered = new URL(p.finalVideoUrl); tampered.searchParams.set('Expires', String(Number(v.searchParams.get('Expires')) + 3600));
    ok('CloudFront recusa URL com expiração adulterada (403)', (await status(tampered.toString())) === 403);
  } else skip('CDN assinado, sem assinatura → 403, adulterada → 403');
  const g = await fetch(p.finalVideoUrl); const buf = Buffer.from(await g.arrayBuffer());
  ok('vídeo baixa pela URL assinada (200, video/mp4)', g.status === 200 && /video\/mp4/.test(g.headers.get('content-type') ?? ''), `${g.status} ${g.headers.get('content-type')} ${buf.length} bytes`);
  const rg = await fetch(p.finalVideoUrl, { headers: { Range: 'bytes=0-1023' } });
  ok('Range funciona (206) — o player avança e volta', rg.status === 206 && (await rg.arrayBuffer()).byteLength === 1024, String(rg.status));
  const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', '-i', 'pipe:0'], { input: buf, encoding: 'utf8' });
  ok('o arquivo é H.264 decodificável', probe.status === 0 && /^h264,\d+,\d+/.test(probe.stdout.trim()), probe.stdout.trim());

  // ---- 3. bucket privado e SigV4 conferido pela AWS ----
  if (AWS) {
    ok('S3 recusa acesso direto sem assinatura (403)', (await status(`https://${BUCKET.videos}.s3.${process.env.AWS_REGION ?? 'sa-east-1'}.amazonaws.com/${finalKey}`)) === 403);
    const t = new URL(p.thumbnailUrl); const sig = t.searchParams.get('X-Amz-Signature'); t.searchParams.set('X-Amz-Signature', (sig[0] === '0' ? '1' : '0') + sig.slice(1));
    ok('S3 recusa URL pré-assinada com assinatura adulterada (403)', (await status(t.toString())) === 403);
  } else skip('S3 privado (403 sem assinatura) e SigV4 adulterado → 403');
  ok('miniatura (S3 pré-assinada) abre (200, imagem)', await fetch(p.thumbnailUrl).then((r) => r.status === 200 && /image/.test(r.headers.get('content-type') ?? '')));

  // ---- 4. criptografia, tags e ciclo de vida reais ----
  if (AWS) {
    const h = await s3.send(new HeadObjectCommand({ Bucket: BUCKET.videos, Key: finalKey }));
    ok('vídeo final criptografado com KMS (não AES256)', h.ServerSideEncryption === 'aws:kms' && (!process.env.STAGING_KMS_KEY_ARN || h.SSEKMSKeyId === process.env.STAGING_KMS_KEY_ARN), `${h.ServerSideEncryption} ${h.SSEKMSKeyId ?? ''}`);
    const hp = await s3.send(new HeadObjectCommand({ Bucket: BUCKET.uploads, Key: photoKey }));
    ok('foto criptografada com KMS', hp.ServerSideEncryption === 'aws:kms', hp.ServerSideEncryption);
    const lc = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: BUCKET.videos }));
    const raw = lc.Rules?.find((r) => r.ID === 'raw-scenes-90d');
    ok('ciclo de vida expira só o que tem a tag retention=raw-90d', raw?.Filter?.Tag?.Key === 'retention' && raw?.Filter?.Tag?.Value === 'raw-90d' && !lc.Rules?.some((r) => r.Expiration && (r.Filter?.Prefix ?? '').startsWith('projects')), JSON.stringify(raw?.Filter));
  } else skip('KMS nos objetos e ciclo de vida do bucket');
  const ts = await s3.send(new GetObjectTaggingCommand({ Bucket: BUCKET.videos, Key: sceneKey })).catch((e) => ({ e }));
  const tf = await s3.send(new GetObjectTaggingCommand({ Bucket: BUCKET.videos, Key: finalKey })).catch((e) => ({ e }));
  if (AWS) ok('cena bruta tem retention=raw-90d; vídeo final não tem tag (não expira)', ts.TagSet?.some((t) => t.Key === 'retention' && t.Value === 'raw-90d') && !(tf.TagSet ?? []).length, JSON.stringify({ cena: ts.TagSet, final: tf.TagSet }));
  else skip('tags dos objetos (o s3rver não grava tags do PUT)');

  // ---- 5. excluir projeto apaga do bucket ----
  ok('antes de excluir: vídeo, cena e fotos existem no bucket', !(await head(BUCKET.videos, finalKey)).missing && !(await head(BUCKET.videos, sceneKey)).missing && !(await head(BUCKET.uploads, photoKey)).missing);
  await api('DELETE', `/projects/${pr.id}`);
  let gone = false; try { await poll(async () => (await head(BUCKET.videos, finalKey)).missing && (await head(BUCKET.videos, sceneKey)).missing && (await head(BUCKET.uploads, photoKey)).missing, 120_000); gone = true; } catch { /* reportado abaixo */ }
  ok('excluir projeto: vídeo, cena e foto somem do bucket (versão atual)', gone);
  const after = await fetch(`${API}/api/v1/projects/${pr.id}`, { headers: { authorization: `Bearer ${token}` } });
  ok('a API não emite mais links do projeto excluído (404)', after.status === 404, String(after.status));
  if (AWS) console.log('     obs.: um link do CDN emitido ANTES da exclusão pode seguir servindo o cache da borda até expirar (SIGNED_URL_TTL_SEC).');
} catch (e) { ok('fluxo', false, String(e).slice(0, 400)); }
const f = res.filter((x) => !x).length; console.log(`\nstorage ${AWS ? 'AWS (staging)' : 'local (ensaio)'}: ${res.length - f} OK, ${f} falha(s)`); process.exit(f ? 1 : 0);
