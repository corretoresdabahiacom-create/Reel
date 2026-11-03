import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, http, signup, auth, png, uploadPhoto, type Session } from './helpers.js';
import { asSystem } from '../src/db/pool.js';

/** P0-1 etapa 4 — achado no navegador real: PNG com magic bytes certos mas corrompido travava o worker (ffmpeg até o timeout). */
const CORRUPT = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAARklEQVR42u3OMQ0AAAgDsJ4R/1PxAYAiaZOBi9mnBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBX0JrvGEAlUsXbPAAAAAAElFTkSuQmCC', 'base64'); // cabeçalho PNG válido, dados zlib inválidos
let s: Session;
beforeAll(async () => { await boot(false); s = await signup(); });
afterAll(async () => { await shutdown(); });
describe('upload: a imagem tem de decodificar', () => {
  it('PNG corrompido → 422 antes de chegar à fila; PNG válido continua aceito', async () => {
    const bad = await http.put('/api/v1/uploads/photo').set(auth(s)).set('content-type', 'image/png').send(CORRUPT);
    expect(bad.status).toBe(422); expect(bad.body.message).toMatch(/corrompida/);
    expect((await http.put('/api/v1/uploads/photo').set(auth(s)).set('content-type', 'image/png').send(png)).status).toBe(201);
  });
});
describe('vídeo final: lista, detalhe e PATCH devolvem URL assinada (achado na tela Criar real)', () => {
  it('nenhuma resposta vaza a referência interna do storage', async () => {
    const ph = await uploadPhoto(s);
    const pr = await http.post('/api/v1/projects').set(auth(s)).send({ title: 'Assinado', script: 'Um roteiro curto para o teste de URL assinada.', photos: [ph, ph, ph], locale: 'pt-BR' });
    expect(pr.status).toBe(201); const id = pr.body.id as string; const ref = `projects/${id}/final-teste.mp4`;
    await asSystem((db) => db.query(`UPDATE projects SET final_video_url=$2, status='ready' WHERE id=$1`, [id, ref]));
    const list = await http.get('/api/v1/projects').set(auth(s)); const item = list.body.items.find((x: { id: string }) => x.id === id);
    const detail = await http.get(`/api/v1/projects/${id}`).set(auth(s));
    const patched = await http.patch(`/api/v1/projects/${id}`).set(auth(s)).send({ title: 'Assinado 2' });
    for (const url of [item.finalVideoUrl, detail.body.finalVideoUrl, patched.body.finalVideoUrl]) { expect(url).toMatch(/^https?:\/\//); expect(url).not.toBe(ref); }
    // Biblioteca: miniatura = 1ª foto assinada, em todas as respostas (inclusive na criação); a foto baixa de verdade.
    for (const b of [pr.body, item, detail.body, patched.body]) { expect(b.thumbnailUrl).toMatch(/^https?:\/\//); }
    expect(detail.body.photoUrls).toHaveLength(3); for (const u of detail.body.photoUrls) expect(u).toMatch(/^https?:\/\/.+[?&]sig=/);
    const thumb = await http.get(new URL(item.thumbnailUrl).pathname + new URL(item.thumbnailUrl).search); expect(thumb.status).toBe(200); expect(thumb.headers['content-type']).toMatch(/image/);
  });
});
