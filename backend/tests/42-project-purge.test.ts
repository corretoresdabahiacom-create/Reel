import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, uploadPhoto, waitFor, pool, type Session } from './helpers.js';
import { asSystem } from '../src/db/pool.js';
import { storage, refLocation } from '../src/providers/storage.js';
import { purgeProjectFiles, purgeDueProjects } from '../src/modules/projects/projects.purge.js';

/**
 * P0-1 etapa 4 — "Excluir projeto" apaga os arquivos de verdade. Antes, DELETE /projects/:id só marcava deleted_at:
 * vídeo, cenas e fotos ficavam no storage para sempre.
 */
let s: Session; let other: Session;
beforeAll(async () => { await boot(); s = await signup({ plan: 'pro', credits: 60 }); other = await signup(); });
afterAll(async () => { await shutdown(); });
const has = (ref: string) => { const l = refLocation(ref); return storage.exists(l.bucket, l.key); };
async function projectWithScene(title: string, photos: string[]): Promise<{ id: string; sceneKey: string; frameKey: string }> {
  const c = await http.post('/api/v1/projects').set(auth(s)).send({ title, script: 'Primeira frase. Segunda frase. Terceira frase.', locale: 'pt-BR', photos }); expect(c.status).toBe(201);
  await http.post(`/api/v1/projects/${c.body.id}/storyboard`).set(auth(s)).send({});
  const p = await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.scenes?.length ? x : undefined; });
  await http.post(`/api/v1/projects/${c.body.id}/scenes/${p.scenes[0].id}/generate`).set(auth(s)).send({});
  await waitFor(async () => (await pool.query<{ status: string }>('SELECT status FROM scenes WHERE id=$1', [p.scenes[0].id])).rows[0]?.status === 'done');
  const row = (await pool.query<{ video_url: string; last_frame_url: string }>('SELECT video_url, last_frame_url FROM scenes WHERE id=$1', [p.scenes[0].id])).rows[0]!;
  return { id: c.body.id, sceneKey: row.video_url, frameKey: row.last_frame_url };
}

describe('excluir projeto apaga os arquivos', () => {
  it('DELETE → vídeo/cenas, assets derivados e fotos só dele saem do storage; foto usada por outro projeto fica; cache limpo; auditado', async () => {
    const [r1, r2, r3] = [await uploadPhoto(s), await uploadPhoto(s), await uploadPhoto(s)];
    const a = await projectWithScene('A excluir', [r1, r2, r3]);
    const b = await projectWithScene('Fica', [r1]); // reaproveita a 1ª foto
    await storage.put('videos', `projects/${a.id}/final-x.mp4`, Buffer.from('final'), 'video/mp4');
    await storage.put('videos', `derived/${s.id}/sticker-a.webp`, Buffer.from('d'), 'image/webp');
    await asSystem(async (db) => {
      await db.query(`INSERT INTO derived_assets (user_id, source_project_id, type, file_url, status) VALUES ($1,$2,'sticker',$3,'done')`, [s.id, a.id, `derived/${s.id}/sticker-a.webp`]);
      await db.query(`INSERT INTO ai_scene_cache (cache_key, provider, video_key, last_frame_key, duration_sec) VALUES ($1,'kling',$2,$3,5)`, [`k-${a.id}`, a.sceneKey, a.frameKey]);
    });
    for (const k of [a.sceneKey, a.frameKey, `projects/${a.id}/final-x.mp4`, r1, r2, r3, b.sceneKey]) expect(await has(k)).toBe(true);

    expect((await http.delete(`/api/v1/projects/${a.id}`).set(auth(other))).status).toBe(404); // outro usuário: nada acontece
    expect(await has(a.sceneKey)).toBe(true);

    expect((await http.delete(`/api/v1/projects/${a.id}`).set(auth(s))).status).toBe(204);
    await waitFor(async () => (await pool.query<{ files_purged_at: Date | null }>('SELECT files_purged_at FROM projects WHERE id=$1', [a.id])).rows[0]?.files_purged_at, 30_000);
    for (const k of [a.sceneKey, a.frameKey, `projects/${a.id}/final-x.mp4`, r2, r3]) expect(await has(k), k).toBe(false);
    expect(await storage.exists('videos', `derived/${s.id}/sticker-a.webp`)).toBe(false);
    expect(await has(r1)).toBe(true); expect(await has(b.sceneKey)).toBe(true); // o outro projeto continua inteiro
    expect((await pool.query('SELECT 1 FROM ai_scene_cache WHERE cache_key=$1', [`k-${a.id}`])).rowCount).toBe(0);
    const log = (await pool.query<{ metadata: { files: number } }>(`SELECT metadata FROM audit_logs WHERE action='project.files_purged' AND target_id=$1`, [a.id])).rows[0];
    expect(log?.metadata.files).toBeGreaterThanOrEqual(6);
    expect((await http.get(`/api/v1/projects/${a.id}`).set(auth(s))).status).toBe(404);
  });

  it('idempotente e seguro: não roda duas vezes nem em projeto que não foi excluído', async () => {
    const b = (await pool.query<{ id: string }>(`SELECT id FROM projects WHERE user_id=$1 AND title='Fica'`, [s.id])).rows[0]!;
    expect(await purgeProjectFiles(b.id)).toEqual({ files: 0, skipped: 'not_deleted' });
    const a = (await pool.query<{ id: string }>(`SELECT id FROM projects WHERE user_id=$1 AND title='A excluir'`, [s.id])).rows[0]!;
    expect(await purgeProjectFiles(a.id)).toEqual({ files: 0, skipped: 'already_purged' });
  });

  it('rede de segurança: excluído sem job (Redis limpo) é apagado na varredura diária', async () => {
    const r = await uploadPhoto(s); const c = await projectWithScene('Sem job', [r]);
    await asSystem((db) => db.query('UPDATE projects SET deleted_at=now() - interval \'1 minute\' WHERE id=$1', [c.id])); // excluído sem enfileirar
    expect(await has(c.sceneKey)).toBe(true);
    const out = await purgeDueProjects();
    expect(out.projects).toBeGreaterThanOrEqual(1);
    expect(await has(c.sceneKey)).toBe(false); expect(await has(r)).toBe(false);
  });
});

describe('corrida: projeto excluído enquanto algo ainda está sendo gerado', () => {
  it('cena: o projeto é excluído DURANTE a geração → nada fica gravado, cena não vira done e nenhum crédito é cobrado', async () => {
    const { aiProvider } = await import('../src/providers/ai/router.js');
    const { generationService } = await import('../src/modules/generation/generation.service.js');
    const free = await signup({ credits: 5 }); const ref = await uploadPhoto(free);
    const c = await http.post('/api/v1/projects').set(auth(free)).send({ title: 'Corrida', script: 'Primeira frase. Segunda frase.', locale: 'pt-BR', photos: [ref] });
    await http.post(`/api/v1/projects/${c.body.id}/storyboard`).set(auth(free)).send({});
    const p = await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(free))).body; return x.scenes?.length ? x : undefined; });
    const orig = aiProvider.generateScene.bind(aiProvider);
    aiProvider.generateScene = async (...a: Parameters<typeof orig>) => { const r = await orig(...a); await asSystem((db) => db.query('UPDATE projects SET deleted_at=now() WHERE id=$1', [c.body.id])); return r; }; // exclusão chega no meio
    try { await generationService.processScene({ projectId: c.body.id, sceneId: p.scenes[0].id, userId: free.id }, true); } finally { aiProvider.generateScene = orig; }
    const scene = (await pool.query<{ status: string; video_url: string | null }>('SELECT status, video_url FROM scenes WHERE id=$1', [p.scenes[0].id])).rows[0]!;
    expect(scene.status).not.toBe('done'); expect(scene.video_url).toBeNull();
    expect(await storage.deletePrefix('videos', `projects/${c.body.id}/`)).toBe(0); // nada sobrou no storage
    expect((await pool.query<{ credits: number }>('SELECT credits FROM users WHERE id=$1', [free.id])).rows[0]!.credits).toBe(5);
  });

  it('2ª passada: arquivo gravado DEPOIS da 1ª limpeza (ex.: dublagem em andamento) é apagado; auditado', async () => {
    const r = await uploadPhoto(s); const c = await projectWithScene('Gravação tardia', [r]);
    expect((await http.delete(`/api/v1/projects/${c.id}`).set(auth(s))).status).toBe(204);
    await waitFor(async () => (await pool.query<{ files_purged_at: Date | null }>('SELECT files_purged_at FROM projects WHERE id=$1', [c.id])).rows[0]?.files_purged_at, 30_000);
    await storage.put('videos', `projects/${c.id}/dub-es-tardio.mp4`, Buffer.from('tarde'), 'video/mp4'); // um job que ainda rodava
    expect(await purgeProjectFiles(c.id)).toEqual({ files: 0, skipped: 'already_purged' }); // a 1ª passada não repete
    const again = await purgeProjectFiles(c.id, 'system', { force: true });
    expect(again).toEqual({ files: 1, recheck: true });
    expect(await storage.exists('videos', `projects/${c.id}/dub-es-tardio.mp4`)).toBe(false);
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE action='project.files_repurged' AND target_id=$1`, [c.id])).rowCount).toBe(1);
  });

  it('a exclusão agenda a 2ª passada para depois do job mais longo (PROJECT_PURGE_RECHECK_SEC)', async () => {
    const { getQueue, Q } = await import('../src/queues/index.js'); const { env } = await import('../src/config/env.js');
    const r = await uploadPhoto(s); const c = await projectWithScene('Agenda', [r]);
    await http.delete(`/api/v1/projects/${c.id}`).set(auth(s));
    const job = await getQueue(Q.maintenance).getJob(`purge-recheck-${c.id}`);
    expect(job?.name).toBe('project-purge-recheck'); expect(job?.opts.delay).toBe((env.PROJECT_PURGE_DELAY_SEC + env.PROJECT_PURGE_RECHECK_SEC) * 1000);
    expect(env.PROJECT_PURGE_RECHECK_SEC).toBeGreaterThanOrEqual(1800);
  });

  it('varredura diária refaz a 2ª passada se o job de recheck se perdeu (Redis limpo)', async () => {
    const { env } = await import('../src/config/env.js');
    const r = await uploadPhoto(s); const c = await projectWithScene('Recheck perdido', [r]);
    await http.delete(`/api/v1/projects/${c.id}`).set(auth(s));
    await waitFor(async () => (await pool.query<{ files_purged_at: Date | null }>('SELECT files_purged_at FROM projects WHERE id=$1', [c.id])).rows[0]?.files_purged_at, 30_000);
    await storage.put('videos', `projects/${c.id}/audio/tardio.wav`, Buffer.from('a'), 'audio/wav');
    await asSystem((db) => db.query(`UPDATE projects SET deleted_at = now() - make_interval(secs => $2) WHERE id=$1`, [c.id, env.PROJECT_PURGE_RECHECK_SEC + 60])); // passou do prazo do recheck
    await purgeDueProjects();
    expect(await storage.exists('videos', `projects/${c.id}/audio/tardio.wav`)).toBe(false);
  });
});
