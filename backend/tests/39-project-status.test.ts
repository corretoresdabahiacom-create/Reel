import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, uploadPhoto, waitFor, type Session } from './helpers.js';

/**
 * P0-1 etapa 4 — achado no navegador real (Biblioteca): gerar uma cena avulsa deixava o projeto em 'generating'
 * para sempre (só a montagem tirava). Um rascunho com cenas prontas aparecia como "Gerando" e não abria.
 */
let s: Session; let ref: string;
beforeAll(async () => { await boot(); s = await signup({ plan: 'pro', credits: 60 }); ref = await uploadPhoto(s); });
afterAll(async () => { delete process.env.MOCK_FAIL_SCENE_INDEX; await shutdown(); });
const get = async (id: string) => (await http.get(`/api/v1/projects/${id}`).set(auth(s))).body;
async function storyboarded(): Promise<{ id: string; scenes: { id: string; status: string }[] }> {
  const c = await http.post('/api/v1/projects').set(auth(s)).send({ title: 'Status', script: 'Primeira frase do roteiro. Segunda frase do roteiro. Terceira frase do roteiro.', locale: 'pt-BR', photos: [ref] });
  expect(c.status).toBe(201);
  expect((await http.post(`/api/v1/projects/${c.body.id}/storyboard`).set(auth(s)).send({})).status).toBe(202);
  return waitFor(async () => { const x = await get(c.body.id); return x.scenes?.length ? x : undefined; });
}
const generate = (id: string, sceneId: string) => http.post(`/api/v1/projects/${id}/scenes/${sceneId}/generate`).set(auth(s)).send({});

describe('status do projeto acompanha as cenas', () => {
  it('cena avulsa concluída: projeto volta de generating para draft', async () => {
    const p = await storyboarded();
    expect((await generate(p.id, p.scenes[0]!.id)).status).toBe(202);
    expect((await get(p.id)).status).toBe('generating');
    const done = await waitFor(async () => { const x = await get(p.id); return x.scenes[0].status === 'done' && x.status !== 'generating' ? x : undefined; });
    expect(done.status).toBe('draft');
    const listed = (await http.get('/api/v1/projects?status=draft').set(auth(s))).body.items.find((x: { id: string }) => x.id === p.id);
    expect(listed?.status).toBe('draft');
  });

  it('cena que falhou e depois foi refeita com sucesso: projeto sai de failed', async () => {
    const p = await storyboarded();
    process.env.MOCK_FAIL_SCENE_INDEX = '0';
    expect((await generate(p.id, p.scenes[0]!.id)).status).toBe(202);
    try { await waitFor(async () => { const x = await get(p.id); return x.status === 'failed' ? x : undefined; }, 150_000, 500); } finally { delete process.env.MOCK_FAIL_SCENE_INDEX; } // falha só após as novas tentativas do BullMQ
    expect((await http.post(`/api/v1/projects/${p.id}/scenes/${p.scenes[0]!.id}/regenerate`).set(auth(s)).send({})).status).toBe(202);
    const ok = await waitFor(async () => { const x = await get(p.id); return x.scenes[0].status === 'done' && x.status === 'draft' ? x : undefined; }, 60_000);
    expect(ok.status).toBe('draft');
  }, 240_000);

  it('com cadeia (chain) o projeto continua generating até a última cena', async () => {
    delete process.env.MOCK_FAIL_SCENE_INDEX; const p = await storyboarded();
    expect((await http.post(`/api/v1/projects/${p.id}/scenes/${p.scenes[0]!.id}/generate`).set(auth(s)).send({ chain: true })).status).toBe(202);
    await waitFor(async () => { const x = await get(p.id); return x.scenes[0].status === 'done' ? x : undefined; });
    const mid = await get(p.id);
    if (mid.scenes.some((x: { status: string }) => x.status !== 'done')) expect(mid.status).toBe('generating');
    const end = await waitFor(async () => { const x = await get(p.id); return x.scenes.every((y: { status: string }) => y.status === 'done') && x.status !== 'generating' ? x : undefined; }, 60_000);
    expect(end.status).toBe('draft');
  }, 120_000);
});
