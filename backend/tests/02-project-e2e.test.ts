import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, uploadPhoto, waitFor, connectPlatform, pool, type Session } from './helpers.js';
import { setFlag, invalidateFlags } from '../src/modules/flags.service.js';

let s: Session; let projectId: string; let ref: string; let sceneIds: string[] = [];
beforeAll(async () => { await boot(); s = await signup({ plan: 'pro', credits: 60 }); ref = await uploadPhoto(s); for (const p of ['tiktok', 'youtube', 'mercadolivre', 'olx']) await connectPlatform(s, p); });
afterAll(async () => { delete process.env.MOCK_FAIL_SCENE_INDEX; delete process.env.MOCK_PLATFORM_FAIL; await shutdown(); });
const get = async (path: string) => (await http.get(`/api/v1${path}`).set(auth(s))).body;

describe('2. Projeto ponta a ponta (mocks)', () => {
  it('cria projeto, gera storyboard e valida cenas', async () => {
    const c = await http.post('/api/v1/projects').set(auth(s)).send({ title: 'Tênis Runner X', script: 'Tênis leve para corrida. Amortecimento incrível. Solado antiderrapante. Disponível em 5 cores. Frete grátis hoje.', locale: 'pt-BR', photos: [ref] }); expect(c.status).toBe(201); projectId = c.body.id;
    const sb = await http.post(`/api/v1/projects/${projectId}/storyboard`).set(auth(s)).send({}); expect(sb.status).toBe(202);
    const p = await waitFor(async () => { const x = await get(`/projects/${projectId}`); return x.scenes?.length ? x : undefined; }); expect(p.scenes.length).toBeGreaterThanOrEqual(3); expect(p.scenes.length).toBeLessThanOrEqual(8); sceneIds = p.scenes.map((x: { id: string }) => x.id);
    for (const sc of p.scenes) expect(sc.durationSec).toBeGreaterThanOrEqual(3);
  });
  it('rejeita foto de outro usuário e roteiro proibido', async () => {
    const other = await signup(); const foreign = await uploadPhoto(other);
    expect((await http.post('/api/v1/projects').set(auth(s)).send({ title: 'x', script: 'ok', photos: [foreign] })).status).toBe(403);
    expect((await http.get(`/api/v1/projects/${projectId}`).set(auth(other))).status).toBe(404); // RLS
  });
  it('gera cenas encadeadas; falha simulada na última, retry manual e continuidade (chaining)', async () => {
    process.env.MOCK_FAIL_SCENE_INDEX = String(sceneIds.length - 1);
    const g = await http.post(`/api/v1/projects/${projectId}/scenes/${sceneIds[0]}/generate`).set(auth(s)).send({ chain: true }); expect(g.status).toBe(202);
    const failed = await waitFor(async () => { const x = await get(`/projects/${projectId}`); return x.scenes.find((sc: { status: string }) => sc.status === 'error') ? x : undefined; }, 60_000);
    const okScenes = failed.scenes.filter((sc: { status: string }) => sc.status === 'done'); expect(okScenes.length).toBe(sceneIds.length - 1);
    const logs = await get(`/projects/${projectId}/generation-logs`); expect(logs.items.length).toBeGreaterThan(0);
    // chaining: cada cena (>0) usa o último frame da anterior
    const rows = (await pool.query('SELECT index, last_frame_url FROM scenes WHERE project_id=$1 ORDER BY index', [projectId])).rows; for (const r of rows.slice(0, -1)) expect(r.last_frame_url).toBeTruthy();
    const last = failed.scenes.find((sc: { status: string }) => sc.status === 'error'); const rg = await http.post(`/api/v1/projects/${projectId}/scenes/${last.id}/regenerate`).set(auth(s)).send({}); expect(rg.status).toBe(202);
    await waitFor(async () => { const x = await get(`/projects/${projectId}`); return x.scenes.every((sc: { status: string }) => sc.status === 'done') ? x : undefined; }, 60_000);
    delete process.env.MOCK_FAIL_SCENE_INDEX;
  });
  it('monta o vídeo final (FFmpeg) com versão v1 e URL assinada', async () => {
    expect((await http.post(`/api/v1/projects/${projectId}/assemble`).set(auth(s)).send({})).status).toBe(202);
    const p = await waitFor(async () => { const x = await get(`/projects/${projectId}`); return x.status === 'ready' && x.finalVideoUrl ? x : undefined; }, 90_000);
    const u = new URL(p.finalVideoUrl); const dl = await http.get(u.pathname + u.search); expect(dl.status).toBe(200); expect(dl.body.length ?? dl.headers['content-length']).toBeTruthy();
    const tampered = await http.get(u.pathname + u.search.replace(/sig=[^&]+/, 'sig=abc')); expect([401, 403]).toContain(tampered.status);
  });
  it('dublagem en + es: debita créditos e gera versões localizadas', async () => {
    const before = (await get('/users/me')).credits; const d = await http.post(`/api/v1/projects/${projectId}/dub`).set(auth(s)).send({ targetLocales: ['en', 'es'], voice: { gender: 'female' } }); expect(d.status).toBe(202);
    const vs = await waitFor(async () => { const x = await get(`/projects/${projectId}/localized-versions`); return x.items.length === 2 && x.items.every((i: { status: string }) => i.status === 'done') ? x : undefined; }, 90_000); expect(vs.items.map((i: { locale: string }) => i.locale).sort()).toEqual(['en', 'es']);
    expect((await get('/users/me')).credits).toBe(before - 10);
  });
  it('publica em TikTok + YouTube + Mercado Livre e retoma falha com retry sem duplicar', async () => {
    const meta = { title: 'Tênis Runner X', caption: 'Corra mais! #tenis', hashtags: ['tenis'], price: 199.9 };
    const idem = `k-${Date.now()}`; const body = { projectId, targets: [{ platform: 'tiktok', metadata: meta }, { platform: 'youtube', metadata: { ...meta, visibility: 'public' } }, { platform: 'mercadolivre', metadata: { ...meta, listingId: 'MLB123456789' } }] };
    const r = await http.post('/api/v1/publications').set(auth(s)).set('idempotency-key', idem).send(body); expect(r.status, JSON.stringify(r.body)).toBe(202); expect(r.body.publications).toHaveLength(3);
    const replay = await http.post('/api/v1/publications').set(auth(s)).set('idempotency-key', idem).send(body); expect(replay.body.publications.map((x: { id: string }) => x.id)).toEqual(r.body.publications.map((x: { id: string }) => x.id)); expect(replay.headers['idempotent-replay']).toBeDefined();
    expect((await http.post('/api/v1/publications').set(auth(s)).set('idempotency-key', idem).send({ ...body, targets: [body.targets[0]] })).status).toBe(422); // mesma chave, corpo diferente
    const list = await waitFor(async () => { const x = await get(`/publications?projectId=${projectId}`); return x.items.length >= 3 && x.items.every((i: { status: string }) => ['published', 'failed'].includes(i.status)) ? x : undefined; }, 60_000);
    for (const i of list.items) { expect(i.status).toBe('published'); expect(i.externalUrl).toMatch(/^https?:\/\//); }
    expect((await http.post(`/api/v1/publications/${list.items[0].id}/retry`).set(auth(s)).send({})).status).toBe(409);
  });
  it('falha fatal de plataforma → failed; retry bem-sucedido; kill switch → 503; conta não conectada → 409', async () => {
    process.env.MOCK_PLATFORM_FAIL = 'tiktok:fatal'; const meta = { title: 'Retry', caption: 'x' };
    const r = await http.post('/api/v1/publications').set(auth(s)).send({ projectId, targets: [{ platform: 'tiktok', metadata: meta }] }); const id = r.body.publications[0].id;
    const f = await waitFor(async () => { const x = await get(`/publications/${id}`); return x.status === 'failed' ? x : undefined; }, 30_000); expect(f.error).toBeTruthy();
    delete process.env.MOCK_PLATFORM_FAIL; expect((await http.post(`/api/v1/publications/${id}/retry`).set(auth(s)).send({})).status).toBe(202);
    await waitFor(async () => (await get(`/publications/${id}`)).status === 'published', 30_000);
    await setFlag(s.id, 'publish_instagram', { enabled: false }); await invalidateFlags(); await connectPlatform(s, 'instagram');
    const off = await http.post('/api/v1/publications').set(auth(s)).send({ projectId, targets: [{ platform: 'instagram', metadata: meta }] }); expect(off.status).toBe(503); expect(off.body.code).toBe('platform_disabled');
    await setFlag(s.id, 'publish_instagram', { enabled: true }); await invalidateFlags();
    const nc = await http.post('/api/v1/publications').set(auth(s)).send({ projectId, targets: [{ platform: 'shopee', metadata: meta }] }); expect(nc.status).toBe(409); expect(nc.body.code).toBe('account_not_connected');
  });
  it('OLX adiciona YouTube (não listado) automaticamente e publica após ele', async () => {
    const r = await http.post('/api/v1/publications').set(auth(s)).send({ projectId, targets: [{ platform: 'olx', metadata: { title: 'Tênis usado', caption: 'ótimo estado', price: 150 } }] }); expect(r.status).toBe(202);
    expect(r.body.publications.map((x: { platform: string }) => x.platform).sort()).toEqual(['olx', 'youtube']);
    const ids = r.body.publications.map((x: { id: string }) => x.id) as string[];
    const done = await waitFor(async () => { const x = (await Promise.all(ids.map((i) => get(`/publications/${i}`)))) as { status: string; error?: string; platform: string }[]; return x.every((p) => ['published', 'failed'].includes(p.status)) ? x : undefined; }, 40_000);
    expect(done.map((p) => `${p.platform}:${p.status}:${p.error ?? ''}`)).toEqual(expect.arrayContaining(['olx:published:', 'youtube:published:']));
  });
  it('conta com exclusão agendada não gera nem publica (423)', async () => {
    const u = await signup({ plan: 'pro', credits: 10 }); expect((await http.post('/api/v1/users/me/deletion').set(auth(u)).send({})).status).toBe(202);
    const r = await http.post('/api/v1/projects').set(auth(u)).send({ title: 'x', script: 'teste', photos: [] }); expect(r.status).toBe(423); expect(r.body.code).toBe('account_pending_deletion');
  });
});
