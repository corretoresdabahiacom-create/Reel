import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
import { getQueue, Q } from '../src/queues/index.js';
import { framePixels } from '../src/modules/background/engine.js';
import { boxPx } from '../src/modules/elements/engine.js';
import { providerCalls, PROVIDER_CALL_LOG } from '../src/modules/elements/providers.js';
import { logger } from '../src/observability/logger.js';
import { elementInserter } from '../src/modules/elements/elementInserter.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';

/**
 * Módulo 3 — Inserção de elementos (motor FFmpeg local, Postgres/Redis reais).
 * Ponto central do Checkpoint 3: inserir PESSOA sem consentimento verificado → 403 e NENHUMA chamada ao provedor
 * (contador do provedor, ai_usage, fila e tabela de inserções inalterados).
 */
const W = 360, H = 640, BG = '0x2a9d8f', SUBJ = [240, 140, 40];
let a: Session; let b: Session; let projectId: string; let s1: string; let rls: RlsPool;
let videoKey: string; let photoRef: string; let refPet: string; let refPerson: string; let videoHash: string; let photoHash: string;
const setFlags = async (el: boolean, bg = false) => { await asSystem(async (db) => {
  await db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key='ff_elements'`, [el, el ? 100 : 0]);
  await db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key='ff_background'`, [bg, bg ? 100 : 0]); }); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `el-${randomUUID()}` });
const sha = (x: Buffer) => createHash('sha256').update(x).digest('hex');
const getRef = async (ref: string) => { const l = refLocation(ref); return storage.get(l.bucket, l.key); };
const px = (buf: Buffer, x: number, y: number, w = W) => [...buf.subarray((y * w + x) * 4, (y * w + x) * 4 + 3)];
const near = (c: number[], t: number[], tol = 45) => t.every((v, i) => Math.abs(c[i]! - v) <= tol);
const img = (vf: string, w = W, h = H, bg = BG) => withTmp(async (d) => { await ffmpeg(['-f', 'lavfi', '-i', `color=c=${bg}:s=${w}x${h}:d=1`, '-vf', vf, '-frames:v', '1', join(d, 'i.png')]); return readFile(join(d, 'i.png')); });
const mkVideo = () => withTmp(async (d) => { await ffmpeg(['-f', 'lavfi', '-i', `color=c=${BG}:s=${W}x${H}:r=12:d=2`, '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100:d=2', '-vf', 'drawbox=x=130:y=270:w=100:h=100:color=0xf08c28:t=fill,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', join(d, 'v.mp4')]); return readFile(join(d, 'v.mp4')); });
const post = (s: Session, sceneId: string, body: object, key: Record<string, string> = idem()) => http.post(`/api/v1/projects/${projectId}/scenes/${sceneId}/elements`).set(auth(s)).set(key).send(body);
type Ver = { sceneId: string; version: number; current: boolean; videoUrl: string | null; photoUrls: string[]; elements: Array<{ type: string; action: string; description: string; resultUrl: string | null }> };
const versions = async (sceneId: string) => (await http.get(`/api/v1/projects/${projectId}/scenes/${sceneId}/versions`).set(auth(a))).body as { currentSceneId: string; versions: Ver[] };
async function insertAndWait(body: object, sceneId = s1): Promise<string> {
  const r = await post(a, sceneId, body); expect(r.status, JSON.stringify(r.body)).toBe(202);
  const row = await waitFor(async () => (await pool.query(`SELECT status, derived_scene_id, error_code FROM element_insertions WHERE id=$1`, [r.body.insertionId])).rows.find((x) => x.status === 'done' || x.status === 'failed'), 60_000, 200);
  expect(row.status, row.error_code).toBe('done'); return row.derived_scene_id as string;
}
const withLocal = <T>(ref: string, ext: string, fn: (f: string) => Promise<T>) => withTmp(async (d) => { const f = join(d, 'x' + ext); await writeFile(f, await getRef(ref)); return fn(f); });
const sceneRow = async (id: string) => (await pool.query(`SELECT video_url, reference_images, inserted_elements, version, derived_from_scene_id FROM scenes WHERE id=$1`, [id])).rows[0];
const counts = async () => ({ calls: providerCalls.count, usage: (await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation LIKE 'element_%'`, [a.id])).rows[0].n as number,
  rows: (await pool.query(`SELECT count(*)::int n FROM element_insertions WHERE project_id=$1`, [projectId])).rows[0].n as number, jobs: (await getQueue(Q.elementsInsert).getJobCountByTypes('waiting', 'active', 'delayed', 'completed', 'failed')) });

beforeAll(async () => {
  await boot(); rls = createRlsPool(env.DATABASE_URL);
  a = await signup({ plan: 'pro', credits: 100 }); b = await signup({ plan: 'pro', credits: 100 });
  const ph = await uploadPhoto(a);
  projectId = (await http.post('/api/v1/projects').set(auth(a)).send({ title: 'Elementos', script: 'Cena um.', photos: [ph] })).body.id;
  photoRef = `uploads/${a.id}/el-scene.png`; await storage.put('uploads', `${a.id}/el-scene.png`, await img('drawbox=x=130:y=270:w=100:h=100:color=0xf08c28:t=fill'), 'image/png');
  refPet = `uploads/${a.id}/el-pet.png`; await storage.put('uploads', `${a.id}/el-pet.png`, await img('drawbox=x=75:y=60:w=150:h=180:color=0x2850d0:t=fill', 300, 300, 'white'), 'image/png');
  refPerson = `uploads/${a.id}/el-person.png`; await storage.put('uploads', `${a.id}/el-person.png`, await img('drawbox=x=100:y=40:w=100:h=220:color=0xc0306a:t=fill', 300, 300, 'white'), 'image/png');
  videoKey = `projects/${projectId}/scenes/el-fixture.mp4`; await storage.put('videos', videoKey, await mkVideo(), 'video/mp4');
  s1 = (await asSystem((db) => db.query(`INSERT INTO scenes (project_id, index, text, video_url, reference_images, status) VALUES ($1, 0, 'Cena um', $2, $3, 'done') RETURNING id`, [projectId, videoKey, [photoRef]]))).rows[0].id;
  videoHash = sha(await getRef(videoKey)); photoHash = sha(await getRef(photoRef));
}, 120_000);
afterAll(async () => { await setFlags(false, false); await rls.end(); await shutdown(); });

describe('Módulo 3 — unidade', () => {
  it('região em pixels fica dentro do quadro (margem de 1 px)', () => {
    expect(boxPx({ x: 0, y: 0, w: 1, h: 1 }, 360, 640)).toEqual({ x: 1, y: 1, w: 358, h: 638 });
    expect(boxPx({ x: 0.5, y: 0.5, w: 0.25, h: 0.1 }, 360, 640)).toEqual({ x: 180, y: 320, w: 90, h: 64 });
  });
});

describe('Módulo 3 — com ff_elements DESLIGADA o app é idêntico', () => {
  it('rotas 404; cenas antigas sem insertedElements; banco com lista vazia', async () => {
    await setFlags(false, false);
    const calls = [() => http.post(`/api/v1/projects/${projectId}/scenes/${s1}/elements`).set(idem()).send({ action: 'insert', type: 'object', referenceRef: refPet }),
      () => http.get(`/api/v1/projects/${projectId}/scenes/${s1}/elements`), () => http.get('/api/v1/elements/config'), () => http.get('/api/v1/elements/person-consents'),
      () => http.post('/api/v1/elements/person-consents').set(idem()), () => http.get(`/api/v1/projects/${projectId}/scenes/${s1}/versions`)];
    for (const c of calls) expect((await c().set(auth(a))).status).toBe(404);
    const p = await http.get(`/api/v1/projects/${projectId}`).set(auth(a)); expect(Object.keys(p.body.scenes[0])).not.toContain('insertedElements');
    expect((await sceneRow(s1)).inserted_elements).toEqual([]);
  });
});

describe('Módulo 3 — com ff_elements LIGADA (ff_background desligada)', () => {
  beforeAll(() => setFlags(true, false));
  let vPet: string;

  it('inserir ANIMAL no vídeo: Idempotency-Key; nova versão com insertedElements; elemento visível; original intacto', async () => {
    const body = { action: 'insert', type: 'animal', referenceRef: refPet, description: 'pet ao lado do produto', position: { x: 0.75, y: 0.8 }, scale: 0.25 };
    expect((await http.post(`/api/v1/projects/${projectId}/scenes/${s1}/elements`).set(auth(a)).send(body)).status).toBe(400);
    const k = idem(); const r1 = await post(a, s1, body, k); expect(r1.status).toBe(202);
    const r2 = await post(a, s1, body, k); expect(r2.body.insertionId).toBe(r1.body.insertionId); expect(r2.headers['idempotent-replay']).toBe('true');
    vPet = await waitFor(async () => (await pool.query(`SELECT derived_scene_id FROM element_insertions WHERE id=$1 AND status='done'`, [r1.body.insertionId])).rows[0]?.derived_scene_id, 60_000, 200);
    const row = await sceneRow(vPet); expect(row.version).toBe(2); expect(row.derived_from_scene_id).toBe(s1);
    expect(row.inserted_elements).toHaveLength(1); expect(row.inserted_elements[0]).toMatchObject({ type: 'animal', action: 'insert', description: 'pet ao lado do produto', status: 'done', referenceImageUrl: refPet });
    await withLocal(row.video_url, '.mp4', async (f) => { const fr = await framePixels(f, W, H, 0.5);
      expect(near(px(fr, 270, 512), [40, 80, 208])).toBe(true); expect(near(px(fr, 180, 320), SUBJ)).toBe(true); });
    const p = await http.get(`/api/v1/projects/${projectId}`).set(auth(a));
    expect(p.body.scenes[0].id).toBe(vPet); expect(p.body.scenes[0].insertedElements).toEqual([{ type: 'animal', action: 'insert', description: 'pet ao lado do produto', status: 'done' }]);
    expect(JSON.stringify(p.body.scenes[0].insertedElements)).not.toContain('uploads/'); // sem referência crua na API do projeto
    expect(sha(await getRef(videoKey))).toBe(videoHash); expect((await sceneRow(s1)).inserted_elements).toEqual([]);
    expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='element_insert' AND status='ok'`, [a.id])).rows[0].n).toBe(1);
  }, 90_000);

  it('inserir OBJETO na foto: a nova versão acumula os elementos da origem', async () => {
    const v = await insertAndWait({ action: 'insert', type: 'object', target: 'photo', referenceRef: refPet, description: 'celular na mão', position: { x: 0.3, y: 0.3 }, scale: 0.2 }, vPet);
    const row = await sceneRow(v); expect(row.inserted_elements.map((e: { description: string }) => e.description)).toEqual(['pet ao lado do produto', 'celular na mão']);
    await withLocal(row.reference_images[0], '.png', async (f) => { const fr = await framePixels(f, W, H); expect(near(px(fr, 108, 192), [40, 80, 208])).toBe(true); });
    expect(sha(await getRef(photoRef))).toBe(photoHash);
  }, 90_000);

  it('PESSOA sem consentimento: 403 e NENHUMA chamada ao provedor (contador, ai_usage, fila e registros inalterados)', async () => {
    const before = await counts();
    const tries: object[] = [{ action: 'insert', type: 'person', referenceRef: refPerson }, { action: 'insert', type: 'person', referenceRef: refPerson, consentId: randomUUID() as string }];
    // consentimento pedido mas não confirmado, e consentimento de OUTRO usuário (confirmado), também não valem
    const pending = (await http.post('/api/v1/elements/person-consents').set(auth(a)).set(idem())).body.consentId as string;
    const cb = await http.post('/api/v1/elements/person-consents').set(auth(b)).set(idem());
    expect((await http.post(`/api/v1/elements/person-consents/${cb.body.consentId}/confirm`).set(auth(b)).send({ phrase: cb.body.phrase })).status).toBe(200);
    tries.push({ action: 'insert', type: 'person', referenceRef: refPerson, consentId: pending }, { action: 'insert', type: 'person', referenceRef: refPerson, consentId: cb.body.consentId });
    const spy = vi.spyOn(logger, 'info');
    try {
      for (const t of tries) { const r = await post(a, s1, t); expect(r.status).toBe(403); expect(r.body.code).toBe('person_consent_required'); }
      await new Promise((r) => setTimeout(r, 300)); // dá tempo a qualquer worker que (indevidamente) tivesse sido acionado
      expect(spy.mock.calls.filter((c) => c[1] === PROVIDER_CALL_LOG)).toHaveLength(0); // log: nenhuma chamada ao provedor
    } finally { spy.mockRestore(); }
    expect(await counts()).toEqual(before);
  });

  let personConsentId: string;
  it('consentimento person_image: frase única, frase errada recusada, evidência só própria; com ele a pessoa é inserida', async () => {
    const c = await http.post('/api/v1/elements/person-consents').set(auth(a)).set(idem()); expect(c.status).toBe(201); personConsentId = c.body.consentId;
    expect(c.body.phrase).toMatch(/Código \d{6}/);
    const row = (await pool.query(`SELECT type, version, ip_hash, proof_hash, challenge_hash, verified_at FROM consents WHERE id=$1`, [personConsentId])).rows[0];
    expect(row).toMatchObject({ type: 'person_image', version: 'person-v1', verified_at: null }); expect(row.challenge_hash).toMatch(/^[0-9a-f]{64}$/); expect(JSON.stringify(row)).not.toContain('Código');
    const confirm = (body: object) => http.post(`/api/v1/elements/person-consents/${personConsentId}/confirm`).set(auth(a)).send(body);
    expect((await confirm({ phrase: 'qualquer coisa diferente da frase' })).status).toBe(422);
    expect((await confirm({ phrase: c.body.phrase, evidenceRef: await uploadPhoto(b) })).status).toBe(422);
    expect((await http.post(`/api/v1/elements/person-consents/${personConsentId}/confirm`).set(auth(b)).send({ phrase: c.body.phrase })).status).toBe(404);
    const ok = await confirm({ phrase: c.body.phrase.toUpperCase(), evidenceRef: await uploadPhoto(a) }); expect(ok.status).toBe(200); expect(ok.body.status).toBe('verified');
    const before = providerCalls.count; const spy = vi.spyOn(logger, 'info');
    const v = await insertAndWait({ action: 'insert', type: 'person', referenceRef: refPerson, consentId: personConsentId, description: 'eu segurando o produto', position: { x: 0.3, y: 0.7 }, scale: 0.4 });
    expect(providerCalls.count).toBe(before + 1); expect(spy.mock.calls.filter((c) => c[1] === PROVIDER_CALL_LOG)).toHaveLength(1); spy.mockRestore(); // com consentimento: exatamente 1 envio
    expect((await sceneRow(v)).inserted_elements.at(-1)).toMatchObject({ type: 'person', description: 'eu segurando o produto' });
    expect((await pool.query(`SELECT consent_id FROM element_insertions WHERE derived_scene_id=$1`, [v])).rows[0].consent_id).toBe(personConsentId);
  }, 90_000);

  it('consentimento revogado depois de enfileirar: o worker recusa SEM chamar o provedor', async () => {
    const id = (await asSystem((db) => db.query(`INSERT INTO element_insertions (project_id, source_scene_id, action, type, reference_url, params, consent_id, provider)
      VALUES ($1,$2,'insert','person',$3,$4,$5,'mock') RETURNING id`, [projectId, s1, refPerson, { action: 'insert', type: 'person', target: 'video', photoIndex: 0, position: { x: 0.5, y: 0.5 }, scale: 0.3, description: '' }, personConsentId]))).rows[0].id as string;
    expect((await http.delete(`/api/v1/elements/person-consents/${personConsentId}`).set(auth(a))).body.status).toBe('revoked');
    const before = providerCalls.count; const r = await elementInserter.process({ insertionId: id, userId: a.id }, false);
    expect(r).toMatchObject({ ok: false, code: 'person_consent_required' }); expect(providerCalls.count).toBe(before);
    expect((await pool.query(`SELECT status, error_code, derived_scene_id FROM element_insertions WHERE id=$1`, [id])).rows[0]).toEqual({ status: 'failed', error_code: 'person_consent_required', derived_scene_id: null });
    expect((await post(a, s1, { action: 'insert', type: 'person', referenceRef: refPerson, consentId: personConsentId })).status).toBe(403);
  });

  it('substituir: recolorir a roupa (só a região muda) e remover objeto do fundo', async () => {
    expect((await post(a, s1, { action: 'replace', mode: 'recolor' })).status).toBe(400);
    const rc = await insertAndWait({ action: 'replace', type: 'person', mode: 'recolor', region: { x: 0.36, y: 0.42, w: 0.28, h: 0.16 }, hue: 180, description: 'roupa azul' });
    await withLocal((await sceneRow(rc)).video_url, '.mp4', async (f) => { const fr = await framePixels(f, W, H, 0.5);
      expect(near(px(fr, 180, 320), SUBJ)).toBe(false); expect(near(px(fr, 20, 20), [42, 157, 143], 20)).toBe(true); });
    const er = await insertAndWait({ action: 'replace', type: 'object', mode: 'remove', region: { x: 0.33, y: 0.4, w: 0.34, h: 0.2 }, description: 'tirar a caixa do fundo' });
    await withLocal((await sceneRow(er)).video_url, '.mp4', async (f) => { const fr = await framePixels(f, W, H, 0.5); expect(near(px(fr, 180, 320), [42, 157, 143], 30)).toBe(true); });
    expect((await sceneRow(er)).inserted_elements.at(-1)).toMatchObject({ action: 'replace', mode: 'remove', type: 'object' });
    for (const op of ['element_recolor', 'element_remove']) expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation=$2`, [a.id, op])).rows[0].n).toBe(1);
    expect(sha(await getRef(videoKey))).toBe(videoHash);
  }, 120_000);

  it('referência inválida: sem referência 400; de outro usuário 422', async () => {
    expect((await post(a, s1, { action: 'insert', type: 'animal' })).status).toBe(400);
    expect((await post(a, s1, { action: 'insert', type: 'animal', referenceRef: await uploadPhoto(b) })).status).toBe(422);
  });

  it('versões e seletor (endpoints do Módulo 2) valem com ff_elements: elementos com URL assinada; reverter para a original', async () => {
    const v = await versions(s1); expect(v.versions.length).toBeGreaterThanOrEqual(6);
    const withEl = v.versions.find((x) => x.elements.length); expect(new URL(withEl!.elements[0]!.resultUrl!).searchParams.get('exp')).toBeTruthy();
    const r = await http.put(`/api/v1/projects/${projectId}/scenes/${s1}/current`).set(auth(a)); expect(r.status).toBe(200); expect(r.body.currentSceneId).toBe(s1);
    const p = await http.get(`/api/v1/projects/${projectId}`).set(auth(a)); expect(p.body.scenes[0].id).toBe(s1); expect(p.body.scenes[0]).not.toHaveProperty('insertedElements');
    expect((await http.patch(`/api/v1/projects/${projectId}/scenes/${s1}/background`).set(auth(a)).set(idem()).send({ operation: 'remove' })).status).toBe(404); // fundo segue atrás de ff_background
  });

  it('isolamento: B não insere nem lista; RLS esconde element_insertions', async () => {
    expect((await post(b, s1, { action: 'insert', type: 'animal', referenceRef: refPet })).status).toBe(404);
    expect((await http.get(`/api/v1/projects/${projectId}/scenes/${s1}/elements`).set(auth(b))).status).toBe(404);
    const l = await http.get(`/api/v1/projects/${projectId}/scenes/${s1}/elements`).set(auth(a)); expect(l.body.items.length).toBeGreaterThanOrEqual(5);
    const q = (ctx: object) => runWithDbCtx(ctx, () => rls.query('SELECT 1 FROM element_insertions WHERE project_id=$1', [projectId])).then((x) => x.rowCount);
    expect(await q({ userId: a.id })).toBeGreaterThan(0); expect(await q({ userId: b.id })).toBe(0); expect(await q({})).toBe(0);
  });

  it('circuit breaker próprio; falha marcada com mensagem clara; original intacto', async () => {
    process.env.MOCK_FAIL_ELEMENTS = '1';
    try {
      const r = await post(a, s1, { action: 'replace', mode: 'remove', region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } }); expect(r.status).toBe(202);
      const row = await waitFor(async () => (await pool.query(`SELECT status, error_code FROM element_insertions WHERE id=$1 AND status='failed'`, [r.body.insertionId])).rows[0], 60_000, 200);
      expect(row.error_code).toBe('elements_unavailable');
      expect(await redis.exists('cb:open:elements:mock')).toBe(1); expect(await redis.exists('cb:open:background:mock')).toBe(0);
      expect(sha(await getRef(videoKey))).toBe(videoHash);
    } finally { delete process.env.MOCK_FAIL_ELEMENTS; await redis.del('cb:open:elements:mock', 'cb:fail:elements:mock'); }
  }, 90_000);

  it('LGPD: exportação inclui as inserções e indica evidência sem expor o arquivo', async () => {
    const id = (await asSystem((db) => db.query(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id`, [a.id]))).rows[0].id as string;
    await complianceService.buildExport(id, a.id); const data = JSON.parse((await storage.get('exports', `${a.id}/${id}.json`)).toString());
    expect(data.elementInsertions.length).toBeGreaterThanOrEqual(5);
    expect(data.consents.some((c: { type: string; has_evidence: boolean }) => c.type === 'person_image' && c.has_evidence)).toBe(true);
    expect(JSON.stringify(data.consents)).not.toContain('uploads/');
  });
});
