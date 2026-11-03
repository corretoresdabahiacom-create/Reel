import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, uploadPhoto, waitFor, connectPlatform, pool, type Session } from './helpers.js';
import { parseCsv, sanitizeCell } from '../src/modules/b2b/csv.js';

let s: Session; let catalogId: string; let ref: string;
beforeAll(async () => { await boot(); s = await signup({ plan: 'business', credits: 100 }); ref = await uploadPhoto(s); await connectPlatform(s, 'tiktok'); await connectPlatform(s, 'mercadolivre'); });
afterAll(() => shutdown());

describe('3. B2B: catálogo CSV → lote de geração → lote de publicação', () => {
  it('parser CSV: aspas, vírgulas internas, ponto e vírgula e sanitização de fórmulas', () => {
    expect(parseCsv('a,b\n"x, y","he said ""hi"""\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"']]); expect(parseCsv('a;b\r\n1;2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(sanitizeCell('=HYPERLINK("http://x")')).toBe(`'=HYPERLINK("http://x")`); expect(sanitizeCell('+1')).toBe("'+1"); expect(sanitizeCell('normal')).toBe('normal');
  });
  it('free não faz lote (403 plan_required)', async () => {
    const f = await signup(); const c = await http.post('/api/v1/catalogs').set(auth(f)).send({ name: 'x' }); expect(c.status).toBe(201);
    const r = await http.post(`/api/v1/catalogs/${c.body.id}/batch-generate`).set(auth(f)).send({}); expect(r.status).toBe(403); expect(r.body.code).toBe('plan_required');
  });
  it('importa 5 produtos via CSV (text/csv), reporta linhas inválidas e neutraliza injeção', async () => {
    const c = await http.post('/api/v1/catalogs').set(auth(s)).send({ name: 'Loja Teste', niche: 'moda' }); catalogId = c.body.id;
    const csv = ['sku,name,description,price,category,photo_urls', `SKU1,Camiseta Azul,"Algodão, premium","49,90",moda,${ref}`, `SKU2,Calça Jeans,Corte reto,129.90,moda,${ref}`, `SKU3,=cmd|' /C calc'!A0,Perigo,10,moda,${ref}`, `SKU4,Tênis Branco,Confortável,"R$ 199,00",calçados,${ref}`, `SKU5,Boné Preto,Aba curva,39,acessórios,${ref}`, 'SKU6,,sem nome,10,x,', 'SKU7,Preço ruim,x,abc,x,'].join('\n');
    const r = await http.post(`/api/v1/catalogs/${catalogId}/items`).set(auth(s)).set('content-type', 'text/csv').send(csv); expect(r.status).toBe(201); expect(r.body.imported).toBe(5); expect(r.body.skipped).toBe(2); expect(r.body.errors.map((e: { row: number }) => e.row).sort()).toEqual([7, 8]);
    const names = (await pool.query('SELECT name, price FROM catalog_items WHERE catalog_id=$1 ORDER BY sku', [catalogId])).rows; expect(names[2].name.startsWith("'=")).toBe(true); expect(Number(names[0].price)).toBe(49.9); expect(Number(names[3].price)).toBe(199);
    const again = await http.post(`/api/v1/catalogs/${catalogId}/items`).set(auth(s)).send({ items: [{ sku: 'SKU1', name: 'Camiseta Azul v2', price: 50 }] }); expect(again.body.imported).toBe(1); // upsert por SKU
    expect((await pool.query('SELECT count(*)::int n FROM catalog_items WHERE catalog_id=$1', [catalogId])).rows[0].n).toBe(5);
  });
  it('lote de geração: 5 itens → projetos prontos, contadores e status do batch_job', async () => {
    const r = await http.post(`/api/v1/catalogs/${catalogId}/batch-generate`).set(auth(s)).send({}); expect(r.status).toBe(202); expect(r.body.totalItems).toBe(5);
    expect((await http.post(`/api/v1/catalogs/${catalogId}/batch-generate`).set(auth(s)).send({})).status).toBe(409); // já em andamento (ou nada pendente → 422)
    const b = await waitFor(async () => { const x = (await http.get(`/api/v1/batch-jobs/${r.body.id}`).set(auth(s))).body; return ['completed', 'partial', 'failed'].includes(x.status) ? x : undefined; }, 120_000);
    expect(b.status).toBe('completed'); expect(b.completedItems).toBe(5); expect(b.failedItems).toBe(0);
    const items = (await http.get(`/api/v1/catalogs/${catalogId}`).set(auth(s))).body; expect(items.summary).toEqual({ ready: 5 }); for (const it of items.itemsList) expect(it.projectId).toBeTruthy();
  });
  it('lote de publicação: 5 itens × TikTok + Mercado Livre', async () => {
    const r = await http.post(`/api/v1/catalogs/${catalogId}/batch-publish`).set(auth(s)).send({ platforms: ['tiktok'] }); expect(r.status).toBe(202);
    const b = await waitFor(async () => { const x = (await http.get(`/api/v1/batch-jobs/${r.body.id}`).set(auth(s))).body; return ['completed', 'partial', 'failed'].includes(x.status) ? x : undefined; }, 120_000);
    expect(b).toMatchObject({ status: 'completed', completedItems: 5, failedItems: 0 });
    expect((await pool.query(`SELECT count(*)::int n FROM publications WHERE user_id=$1 AND platform='tiktok' AND status='published'`, [s.id])).rows[0].n).toBe(5);
    const list = await http.get('/api/v1/batch-jobs').set(auth(s)); expect(list.body.items.length).toBe(2);
  });
  it('API key B2B: escopo restringe, revogação invalida', async () => {
    const k = await http.post('/api/v1/api-keys').set(auth(s)).send({ name: 'ERP', scopes: ['catalogs:read'] }); expect(k.status).toBe(201); expect(k.body.key).toMatch(/^nxr_/);
    const H = { authorization: `Bearer ${k.body.key}` };
    expect((await http.get('/api/v1/catalogs').set(H)).status).toBe(200); expect((await http.post('/api/v1/catalogs').set(H).send({ name: 'z' })).status).toBe(403); expect((await http.get('/api/v1/users/me').set(H)).status).toBe(403);
    const stored = (await pool.query('SELECT key_hash FROM api_keys WHERE id=$1', [k.body.id])).rows[0].key_hash as string; expect(stored).not.toContain(k.body.key);
    expect((await http.delete(`/api/v1/api-keys/${k.body.id}`).set(auth(s))).status).toBe(200); expect((await http.get('/api/v1/catalogs').set(H)).status).toBe(401);
  });
  it('lote com falha parcial: item sem créditos vira error e o batch fecha como partial/failed', async () => {
    const u = await signup({ plan: 'pro', credits: 0 }); const c = await http.post('/api/v1/catalogs').set(auth(u)).send({ name: 'Parcial' });
    await http.post(`/api/v1/catalogs/${c.body.id}/items`).set(auth(u)).send({ items: [{ name: 'A', price: 1 }, { name: 'B', price: 2 }] });
    process.env.MOCK_FAIL_SCENE_INDEX = '0'; const r = await http.post(`/api/v1/catalogs/${c.body.id}/batch-generate`).set(auth(u)).send({});
    const b = await waitFor(async () => { const x = (await http.get(`/api/v1/batch-jobs/${r.body.id}`).set(auth(u))).body; return ['completed', 'partial', 'failed'].includes(x.status) ? x : undefined; }, 120_000); delete process.env.MOCK_FAIL_SCENE_INDEX;
    expect(b.status).toBe('failed'); expect(b.failedItems).toBe(2);
  });
});
