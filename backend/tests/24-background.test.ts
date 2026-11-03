import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { boot, shutdown, http, signup, auth, uploadPhoto, waitFor, pool, redis, type Session } from './helpers.js';
import { asSystem, createRlsPool, type RlsPool } from '../src/db/pool.js';
import { runWithDbCtx } from '../src/db/context.js';
import { env } from '../src/config/env.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { storage, refLocation } from '../src/providers/storage.js';
import { ffmpeg, withTmp } from '../src/utils/ffmpeg.js';
import { framePixels, outpaintSize, paletteFor, probe, removeBg } from '../src/modules/background/engine.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';

/**
 * Módulo 2 — Edição de fundo (motor FFmpeg local, Postgres/Redis reais).
 * Cobre: flag OFF idêntico; remover fundo de vídeo e de foto (alfa com borda suave); trocar por prompt e por upload;
 * expandir 9:16 → 16:9 sem cortar; cada edição vira nova linha em scenes (version+1, derived_from); original intacto
 * (hash no storage antes/depois); seletor de versões e reverter; Idempotency-Key; isolamento (HTTP + RLS);
 * ai_usage; circuit breaker; consentimento external_provider; exportação LGPD.
 */
const W = 360, H = 640, BG = '0x2a9d8f', SUBJ = [240, 140, 40];
let a: Session; let b: Session; let projectId: string; let s1: string; let rls: RlsPool;
let videoKey: string; let photoRef: string; let videoHash: string; let photoHash: string;
const setFlag = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key='ff_background'`, [on, on ? 100 : 0])); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `bg-${randomUUID()}` });
const sha = (x: Buffer) => createHash('sha256').update(x).digest('hex');
const getRef = async (ref: string) => { const l = refLocation(ref); return storage.get(l.bucket, l.key); };
const keyFromSigned = (u: string) => { const path = decodeURIComponent(new URL(u).pathname.split('/storage/')[1]!); const [bucket, ...rest] = path.split('/'); return bucket === 'uploads' ? `uploads/${rest.join('/')}` : rest.join('/'); };
// sujeito laranja com "fios" finos na borda (testam o alfa parcial), sobre fundo liso; no vídeo ele se move
const subjectGeq = (move: string) => `format=rgb24,geq=r='if(lt(hypot(X-${move},Y-320),100),240,if(lt(hypot(X-${move},Y-320),112)*lt(mod(X,6),2),150,42))':g='if(lt(hypot(X-${move},Y-320),100),140,if(lt(hypot(X-${move},Y-320),112)*lt(mod(X,6),2),140,157))':b='if(lt(hypot(X-${move},Y-320),100),40,if(lt(hypot(X-${move},Y-320),112)*lt(mod(X,6),2),100,143))'`;
const mkPhoto = () => withTmp(async (d) => { await ffmpeg(['-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:d=1`, '-vf', subjectGeq('180'), '-frames:v', '1', join(d, 'p.png')]); return readFile(join(d, 'p.png')); });
const mkVideo = () => withTmp(async (d) => { await ffmpeg(['-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=12:d=2`, '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:d=2', '-vf', `${subjectGeq('(180+20*sin(T*3))')},format=yuv420p`, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', join(d, 'v.mp4')]); return readFile(join(d, 'v.mp4')); });
const px = (buf: Buffer, x: number, y: number, w: number) => [...buf.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];
const near = (c: number[], t: number[], tol = 40) => t.every((v, i) => Math.abs(c[i]! - v) <= tol);
async function edit(s: Session, sceneId: string, body: object, key = idem()) {
  return http.patch(`/api/v1/projects/${projectId}/scenes/${sceneId}/background`).set(auth(s)).set(key).send(body);
}
type Versions = { currentSceneId: string; versions: Array<{ sceneId: string; version: number; derivedFromSceneId: string | null; current: boolean; original: boolean; videoUrl: string | null; photoUrls: string[]; edit: null | { id: string; operation: string; alphaUrl: string | null; aspect: string | null } }>; pending: Array<{ id: string; status: string; errorCode: string | null }> };
const versions = async (sceneId: string, s = a) => (await http.get(`/api/v1/projects/${projectId}/scenes/${sceneId}/versions`).set(auth(s))).body as Versions;
async function editAndWait(sceneId: string, body: object): Promise<Versions['versions'][number]> {
  const r = await edit(a, sceneId, body); expect(r.status, JSON.stringify(r.body)).toBe(202);
  const v = await waitFor(async () => { const x = await versions(sceneId); return x.versions.find((y) => y.edit?.id === r.body.editId) ?? (x.pending.find((p) => p.id === r.body.editId && p.status === 'failed') ? 'failed' : undefined); }, 60_000, 200);
  if (v === 'failed') throw new Error('edição falhou'); return v as Versions['versions'][number];
}
async function withLocal<T>(ref: string, ext: string, fn: (f: string) => Promise<T>): Promise<T> { return withTmp(async (d) => { const f = join(d, 'x' + ext); await writeFile(f, await getRef(ref)); return fn(f); }); }

beforeAll(async () => {
  await boot(); rls = createRlsPool(env.DATABASE_URL);
  a = await signup({ plan: 'pro', credits: 100 }); b = await signup({ plan: 'pro', credits: 100 });
  const photo = await uploadPhoto(a);
  const r = await http.post('/api/v1/projects').set(auth(a)).send({ title: 'Fundo', script: 'Cena um. Cena dois.', photos: [photo] }); projectId = r.body.id;
  photoRef = `uploads/${a.id}/bg-fixture.png`; await storage.put('uploads', `${a.id}/bg-fixture.png`, await mkPhoto(), 'image/png');
  videoKey = `projects/${projectId}/scenes/fixture.mp4`; await storage.put('videos', videoKey, await mkVideo(), 'video/mp4');
  s1 = (await asSystem((db) => db.query(`INSERT INTO scenes (project_id, index, text, video_url, reference_images, status) VALUES ($1, 0, 'Cena um', $2, $3, 'done') RETURNING id`, [projectId, videoKey, [photoRef]]))).rows[0].id;
  videoHash = sha(await getRef(videoKey)); photoHash = sha(await getRef(photoRef));
}, 120_000);
afterAll(async () => { await setFlag(false); await rls.end(); await shutdown(); });

describe('Módulo 2 — unidade', () => {
  it('outpainting só acrescenta área ao redor do original (lado maior até 1920)', () => {
    expect(outpaintSize(360, 640, '16:9')).toEqual({ W: 1138, H: 640 }); expect(outpaintSize(1920, 1080, '9:16')).toEqual({ W: 1080, H: 1920 }); expect(outpaintSize(1080, 1920, '16:9')).toEqual({ W: 1920, H: 1080 }); // lado maior limitado a 1920
    expect(outpaintSize(360, 640, '1:1')).toEqual({ W: 640, H: 640 });
  });
  it('fundo por texto: paleta por tema e determinística', () => {
    expect(paletteFor('cozinha moderna')).toEqual(paletteFor('Cozinha moderna clara')); expect(paletteFor('escritório')).not.toEqual(paletteFor('cozinha'));
    expect(paletteFor('algo inédito')).toEqual(paletteFor('algo inédito'));
  });
  it('remoção na foto: fundo transparente, sujeito opaco e borda fina com alfa parcial (fios preservados)', async () => {
    await withTmp(async (d) => {
      await writeFile(join(d, 'p.png'), await mkPhoto()); const r = await removeBg(join(d, 'p.png'), d); const p = await framePixels(r.alpha, W, H);
      expect(px(p, 5, 5, W)[3]).toBe(0); expect(px(p, 180, 320, W)[3]).toBe(255);
      const ring = [...Array(12).keys()].map((i) => px(p, 280 + i, 320, W)[3]!); expect(ring.some((x) => x > 0 && x < 255)).toBe(true);
    });
  });
});

describe('Módulo 2 — com ff_background DESLIGADA o app é idêntico', () => {
  it('rotas respondem 404; cenas e projeto inalterados', async () => {
    await setFlag(false);
    const calls = [() => http.patch(`/api/v1/projects/${projectId}/scenes/${s1}/background`).set(idem()).send({ operation: 'remove' }), () => http.get(`/api/v1/projects/${projectId}/scenes/${s1}/versions`), () => http.put(`/api/v1/projects/${projectId}/scenes/${s1}/current`),
      () => http.get('/api/v1/background/config'), () => http.get('/api/v1/consents/external-provider'), () => http.post('/api/v1/consents/external-provider').set(idem())];
    for (const c of calls) expect((await c().set(auth(a))).status).toBe(404);
    const p = await http.get(`/api/v1/projects/${projectId}`).set(auth(a)); expect(p.status).toBe(200);
    expect(p.body.scenes.map((x: { id: string }) => x.id)).toEqual([s1]); expect(Object.keys(p.body.scenes[0])).not.toContain('version');
    expect((await pool.query('SELECT count(*)::int n FROM background_edits')).rows[0].n).toBe(0);
  });
});

describe('Módulo 2 — com ff_background LIGADA', () => {
  beforeAll(() => setFlag(true));
  let vRemove: string, vPhoto: string, vReplace: string, vOutpaint: string;

  it('remover fundo do VÍDEO: Idempotency-Key obrigatória e respeitada; nova linha em scenes; alfa em WebM; original intacto', async () => {
    expect((await http.patch(`/api/v1/projects/${projectId}/scenes/${s1}/background`).set(auth(a)).send({ operation: 'remove' })).status).toBe(400);
    expect((await edit(a, s1, { operation: 'apagar' })).status).toBe(400);
    const k = idem(); const r1 = await edit(a, s1, { operation: 'remove', target: 'video' }, k); expect(r1.status).toBe(202);
    const r2 = await edit(a, s1, { operation: 'remove', target: 'video' }, k); expect(r2.body.editId).toBe(r1.body.editId); expect(r2.headers['idempotent-replay']).toBe('true');
    const v = await waitFor(async () => (await versions(s1)).versions.find((x) => x.edit?.id === r1.body.editId), 60_000, 200);
    vRemove = v.sceneId;
    expect(v).toMatchObject({ version: 2, derivedFromSceneId: s1, current: true, original: false });
    expect((await pool.query('SELECT count(*)::int n FROM background_edits WHERE project_id=$1', [projectId])).rows[0].n).toBe(1);
    expect(new URL(v.videoUrl!).searchParams.get('exp')).toBeTruthy(); expect((await http.get(new URL(v.videoUrl!).pathname + new URL(v.videoUrl!).search)).status).toBe(200);
    expect(v.edit!.alphaUrl).toMatch(/alpha\.webm/);
    await withLocal(keyFromSigned(v.videoUrl!), '.mp4', async (f) => { const fr = await framePixels(f, W, H, 0.5);
      expect(near(px(fr, 5, 5, W), [255, 255, 255])).toBe(true); expect(near(px(fr, 180, 320, W), SUBJ, 60)).toBe(true); });
    expect(sha(await getRef(videoKey))).toBe(videoHash); expect(sha(await getRef(photoRef))).toBe(photoHash);
    expect((await pool.query(`SELECT video_url FROM scenes WHERE id=$1`, [s1])).rows[0].video_url).toBe(videoKey);
    expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='bg_remove' AND status='ok'`, [a.id])).rows[0].n).toBe(1);
    const p = await http.get(`/api/v1/projects/${projectId}`).set(auth(a)); expect(p.body.scenes.map((x: { id: string }) => x.id)).toEqual([vRemove]); // a atual aparece no projeto, sem duplicar
  }, 90_000);

  it('remover fundo da FOTO: PNG com transparência na nova versão; a foto original fica', async () => {
    const v = await editAndWait(vRemove, { operation: 'remove', target: 'photo', photoIndex: 0 }); vPhoto = v.sceneId;
    expect(v.version).toBe(3); expect(v.derivedFromSceneId).toBe(vRemove);
    await withLocal(keyFromSigned(v.edit!.alphaUrl!), '.png', async (f) => { const p = await framePixels(f, W, H); expect(px(p, 5, 5, W)[3]).toBe(0); expect(px(p, 180, 320, W)[3]).toBe(255); });
    expect((await pool.query(`SELECT reference_images FROM scenes WHERE id=$1`, [s1])).rows[0].reference_images).toEqual([photoRef]);
    expect(sha(await getRef(photoRef))).toBe(photoHash);
  }, 90_000);

  it('trocar o fundo por prompt ("cozinha moderna"): o fundo deixa de ser o original e o sujeito fica', async () => {
    const v = await editAndWait(s1, { operation: 'replace', target: 'video', prompt: 'cozinha moderna' }); vReplace = v.sceneId;
    expect(v.version).toBe(4); expect(v.derivedFromSceneId).toBe(s1); // editar a partir da original: versão = maior + 1
    await withLocal(keyFromSigned(v.videoUrl!), '.mp4', async (f) => { const fr = await framePixels(f, W, H, 0.5);
      expect(near(px(fr, 5, 5, W), [42, 157, 143], 25)).toBe(false); expect(near(px(fr, 180, 320, W), SUBJ, 60)).toBe(true); });
    for (const op of ['bg_generate', 'bg_replace']) expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation=$2`, [a.id, op])).rows[0].n).toBeGreaterThan(0);
  }, 90_000);

  it('trocar o fundo por imagem enviada: só aceita upload do próprio usuário e imagem válida', async () => {
    const other = await uploadPhoto(b);
    expect((await edit(a, s1, { operation: 'replace', backgroundRef: other })).status).toBe(422);
    expect((await edit(a, s1, { operation: 'replace' })).status).toBe(400);
    const mine = await uploadPhoto(a); const v = await editAndWait(s1, { operation: 'replace', backgroundRef: mine });
    expect(v.version).toBe(5);
  }, 90_000);

  it('expandir 9:16 → 16:9 sem cortar o sujeito: 1138x640, centro igual ao original, laterais preenchidas', async () => {
    const v = await editAndWait(vRemove, { operation: 'outpaint', target: 'video', aspect: '16:9' }); vOutpaint = v.sceneId;
    expect(v.edit!.aspect).toBe('16:9');
    await withLocal(keyFromSigned(v.videoUrl!), '.mp4', async (f) => {
      const info = await probe(f); expect([info.width, info.height]).toEqual([1138, 640]);
      const fr = await framePixels(f, 1138, 640, 0.5);
      expect(near(px(fr, 569, 320, 1138), SUBJ, 60)).toBe(true);           // sujeito inteiro no centro
      expect(near(px(fr, 569, 10, 1138), [255, 255, 255], 40)).toBe(true); // o quadro original (fundo branco) não foi cortado em cima
      expect(px(fr, 20, 320, 1138).slice(0, 3).some((c) => c > 20)).toBe(true); // lateral preenchida (não é barra preta)
    });
    expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='bg_outpaint'`, [a.id])).rows[0].n).toBe(1);
  }, 90_000);

  it('seletor de versões: reverter para a original e voltar; o projeto (e a montagem) usa a versão escolhida', async () => {
    let v = await versions(s1); expect(v.versions.map((x) => x.version)).toEqual([6, 5, 4, 3, 2, 1]); expect(v.currentSceneId).toBe(vOutpaint);
    const r = await http.put(`/api/v1/projects/${projectId}/scenes/${s1}/current`).set(auth(a)); expect(r.status).toBe(200);
    expect(r.body.currentSceneId).toBe(s1);
    let p = await http.get(`/api/v1/projects/${projectId}`).set(auth(a)); expect(p.body.scenes.map((x: { id: string }) => x.id)).toEqual([s1]);
    expect((await pool.query(`SELECT count(*)::int n FROM scenes WHERE project_id=$1`, [projectId])).rows[0].n).toBe(6); // nada apagado
    await http.put(`/api/v1/projects/${projectId}/scenes/${vPhoto}/current`).set(auth(a));
    p = await http.get(`/api/v1/projects/${projectId}`).set(auth(a)); expect(p.body.scenes.map((x: { id: string }) => x.id)).toEqual([vPhoto]);
    v = await versions(s1); expect(v.versions.filter((x) => x.current).map((x) => x.sceneId)).toEqual([vPhoto]);
    // uma edição nova vira a atual (a escolha manual anterior é liberada)
    const n = await editAndWait(vReplace, { operation: 'outpaint', aspect: '1:1' }); expect(n.current).toBe(true); expect(n.version).toBe(7);
    expect(sha(await getRef(videoKey))).toBe(videoHash); expect(sha(await getRef(photoRef))).toBe(photoHash); // original intacto depois de 6 edições
  }, 120_000);

  it('isolamento: B não edita nem vê versões de A; RLS esconde background_edits', async () => {
    expect((await edit(b, s1, { operation: 'remove' })).status).toBe(404);
    expect((await http.get(`/api/v1/projects/${projectId}/scenes/${s1}/versions`).set(auth(b))).status).toBe(404);
    expect((await http.put(`/api/v1/projects/${projectId}/scenes/${s1}/current`).set(auth(b))).status).toBe(404);
    const q = (ctx: object) => runWithDbCtx(ctx, () => rls.query('SELECT 1 FROM background_edits WHERE project_id=$1', [projectId])).then((r) => r.rowCount);
    expect(await q({ userId: a.id })).toBeGreaterThan(0); expect(await q({ userId: b.id })).toBe(0); expect(await q({})).toBe(0);
    await expect(runWithDbCtx({ userId: b.id }, () => rls.query(`INSERT INTO background_edits (project_id, operation, source_media_url) VALUES ($1,'remove','x')`, [projectId]))).rejects.toThrow(/row-level security/);
  });

  it('circuit breaker: o provedor falhando marca a edição como falha com mensagem clara e abre o circuito só do fundo', async () => {
    process.env.MOCK_FAIL_BACKGROUND = '1';
    try {
      const r = await edit(a, s1, { operation: 'remove' }); expect(r.status).toBe(202);
      const f = await waitFor(async () => (await versions(s1)).pending.find((x) => x.id === r.body.editId && x.status === 'failed'), 60_000, 250);
      expect(f!.errorCode).toBe('background_unavailable');
      expect(await redis.exists('cb:open:background:mock')).toBe(1); expect(await redis.exists('cb:open:mock')).toBe(0);
      expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='bg_remove' AND status='error'`, [a.id])).rows[0].n).toBeGreaterThanOrEqual(3);
      expect(sha(await getRef(videoKey))).toBe(videoHash);
    } finally { delete process.env.MOCK_FAIL_BACKGROUND; await redis.del('cb:open:background:mock', 'cb:fail:background:mock'); }
  }, 90_000);

  it('consentimento external_provider: registrar, consultar e revogar (com Idempotency-Key)', async () => {
    expect((await http.get('/api/v1/consents/external-provider').set(auth(a))).body.granted).toBe(false);
    expect((await http.post('/api/v1/consents/external-provider').set(auth(a))).status).toBe(400);
    const g = await http.post('/api/v1/consents/external-provider').set(auth(a)).set(idem()); expect(g.status).toBe(201); expect(g.body.granted).toBe(true);
    const row = (await pool.query(`SELECT version, ip_hash, proof_hash, verified_at FROM consents WHERE user_id=$1 AND type='external_provider' AND revoked_at IS NULL`, [a.id])).rows[0];
    expect(row.version).toBe('ext-v1'); expect(row.ip_hash).toMatch(/^[0-9a-f]{32}$/); expect(row.proof_hash).toMatch(/^[0-9a-f]{64}$/); expect(row.verified_at).toBeTruthy();
    expect((await http.delete('/api/v1/consents/external-provider').set(auth(a))).body.granted).toBe(false);
  });

  it('LGPD: a exportação inclui as edições de fundo', async () => {
    const id = (await asSystem((db) => db.query(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id`, [a.id]))).rows[0].id as string;
    await complianceService.buildExport(id, a.id);
    const data = JSON.parse((await storage.get('exports', `${a.id}/${id}.json`)).toString());
    expect(data.backgroundEdits.length).toBeGreaterThanOrEqual(6); expect(data.scenes.length).toBeGreaterThanOrEqual(7);
  });
});
