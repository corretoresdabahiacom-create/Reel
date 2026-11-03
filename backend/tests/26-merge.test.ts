import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { app, boot, shutdown, http, signup, auth, waitFor, pool, type Session } from './helpers.js';
import { asSystem, createRlsPool, type RlsPool } from '../src/db/pool.js';
import { runWithDbCtx } from '../src/db/context.js';
import { env } from '../src/config/env.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { storage, refLocation } from '../src/providers/storage.js';
import { ffmpeg, withTmp } from '../src/utils/ffmpeg.js';
import { ffmpegCapture } from '../src/modules/audio/analysis.js';
import { probeMedia, chooseTransition, targetFor } from '../src/modules/merge/engine.js';
import { mergeService } from '../src/modules/merge/mergeService.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';

/**
 * Módulo 4 — União de vídeos (FFmpeg local, Postgres/Redis reais).
 * Checkpoint 4: rota /projects/:projectId/merge resolvida sem colidir com /projects/:id; projeto de outro usuário → 403.
 */
let a: Session; let b: Session; let rls: RlsPool;
const P: Record<string, { id: string; key: string; hash: string }> = {};
const setFlag = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key='ff_merge'`, [on, on ? 100 : 0])); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `mg-${randomUUID()}` });
const sha = (x: Buffer) => createHash('sha256').update(x).digest('hex');
const getRef = async (ref: string) => { const l = refLocation(ref); return storage.get(l.bucket, l.key); };
const video = (o: { color: string; size: string; fps: number; dur: number; audio: 'loud' | 'quiet' | 'none' }) => withTmp(async (d) => {
  const aIn = o.audio === 'none' ? [] : ['-f', 'lavfi', '-i', `sine=frequency=${o.audio === 'loud' ? 330 : 440}:sample_rate=${o.audio === 'loud' ? 22050 : 48000}:d=${o.dur}`];
  const af = o.audio === 'none' ? [] : ['-af', o.audio === 'loud' ? 'volume=0.9' : 'volume=0.02', '-c:a', 'aac'];
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=${o.color}:s=${o.size}:r=${o.fps}:d=${o.dur}`, ...aIn, ...af, '-c:v', 'libx264', '-preset', 'ultrafast', '-shortest', join(d, 'v.mp4')], 300_000);
  return readFile(join(d, 'v.mp4'));
});
async function project(s: Session, name: string, buf: Buffer, dur: number, status = 'ready') {
  const id = (await asSystem((db) => db.query(`INSERT INTO projects (user_id, title, script, status, duration_sec) VALUES ($1,$2,$3,$4,$5) RETURNING id`, [s.id, name, `Roteiro ${name}.`, status, dur]))).rows[0].id as string;
  const key = `projects/${id}/final.mp4`; await storage.put('videos', key, buf, 'video/mp4'); await asSystem((db) => db.query('UPDATE projects SET final_video_url=$2 WHERE id=$1', [id, key]));
  P[name] = { id, key, hash: sha(buf) }; return id;
}
const merge = (s: Session, pid: string, body: object, key = idem()) => http.post(`/api/v1/projects/${pid}/merge`).set(auth(s)).set(key).send(body);
async function waitMerge(pid: string, mergeId: string, s: Session = a) {
  const seen = new Set<string>();
  const st = await waitFor(async () => { const r = await http.get(`/api/v1/projects/${pid}/merge/${mergeId}`).set(auth(s)); seen.add(r.body.stage); return ['done', 'failed'].includes(r.body.status) ? r.body : undefined; }, 240_000, 150);
  return { st, seen };
}
const lufsOf = async (file: string, ss: number, t: number) => { const log = await ffmpegCapture(['-ss', String(ss), '-t', String(t), '-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']); return Number([...log.matchAll(/\bI:\s+(-?[\d.]+) LUFS/g)].pop()![1]); };

beforeAll(async () => {
  await boot(); rls = createRlsPool(env.DATABASE_URL);
  a = await signup({ plan: 'pro', credits: 100 }); b = await signup({ plan: 'pro', credits: 100 });
  await project(a, 'claro', await video({ color: '0xf0e0c0', size: '360x640', fps: 12, dur: 6, audio: 'loud' }), 6);
  await project(a, 'escuro', await video({ color: '0x101830', size: '720x1280', fps: 30, dur: 6, audio: 'quiet' }), 6);
  await project(a, 'mudo', await video({ color: '0xe8d8b8', size: '360x640', fps: 24, dur: 5, audio: 'none' }), 5);
  await project(a, 'rascunho', await video({ color: '0x808080', size: '360x640', fps: 12, dur: 2, audio: 'none' }), 2, 'draft');
  await project(b, 'alheio', await video({ color: '0x204020', size: '360x640', fps: 12, dur: 4, audio: 'loud' }), 4);
}, 180_000);
afterAll(async () => { await setFlag(false); await rls.end(); await shutdown(); });

describe('Módulo 4 — unidade', () => {
  it('alvo comum: proporção do 1º, maior resolução (lado ≤1920) e maior FPS (≤30)', () => {
    const i = (w: number, h: number, fps: number) => ({ width: w, height: h, fps, duration: 1, hasAudio: true, sampleRate: 44100, channels: 2, vcodec: 'h264', acodec: 'aac' });
    expect(targetFor(i(360, 640, 12), i(720, 1280, 30))).toEqual({ width: 720, height: 1280, fps: 30 });
    expect(targetFor(i(1080, 1920, 60), i(1080, 1920, 24))).toEqual({ width: 1080, height: 1920, fps: 30 });
  });
  it('transição pela emenda: luz → fadeblack; movimento → slideleft; cor → dissolve; parecidas → fade', () => {
    const base = { endA: { y: 0, rgb: [0, 0, 0] }, startB: { y: 0, rgb: [0, 0, 0] } };
    expect(chooseTransition({ ...base, lumaDiff: 120, colorDist: 200, motion: 0 }).type).toBe('fadeblack');
    expect(chooseTransition({ ...base, lumaDiff: 10, colorDist: 10, motion: 20 }).type).toBe('slideleft');
    expect(chooseTransition({ ...base, lumaDiff: 10, colorDist: 120, motion: 1 }).type).toBe('dissolve');
    expect(chooseTransition({ ...base, lumaDiff: 5, colorDist: 5, motion: 1 }).type).toBe('fade');
  });
});

describe('Módulo 4 — roteamento: /projects/:projectId/merge não colide com /projects/:id', () => {
  it('merge é registrada antes de projects e as duas rotas convivem', async () => {
    const routes = app.printRoutes({ commonPrefix: false });
    expect(routes).toMatch(/merge/); // a rota existe no roteador
    await setFlag(false);
    // sem a flag, POST .../merge chega na rota de união (404 do requireMerge com código not_found) e não em /projects/:id
    const r = await merge(a, P.claro!.id, { otherProjectId: P.escuro!.id }); expect(r.status).toBe(404); expect(r.body.code).toBe('not_found');
    // /projects/:id continua respondendo; "merge" como id é só um id inválido (400), nunca a união
    expect((await http.get(`/api/v1/projects/${P.claro!.id}`).set(auth(a))).status).toBe(200);
    expect((await http.get('/api/v1/projects/merge').set(auth(a))).status).toBe(400);
    expect((await http.patch('/api/v1/projects/merge').set(auth(a)).send({ title: 'x' })).status).toBe(400);
    expect((await http.delete('/api/v1/projects/merge').set(auth(a))).status).toBe(400);
    expect((await pool.query('SELECT count(*)::int n FROM project_merges')).rows[0].n).toBe(0);
  });
});

describe('Módulo 4 — com ff_merge DESLIGADA o app é idêntico', () => {
  it('rotas 404; projetos sem campo novo', async () => {
    for (const c of [() => http.get('/api/v1/merges'), () => http.get('/api/v1/merges/config'), () => http.get(`/api/v1/projects/${P.claro!.id}/merge/${randomUUID()}`)]) expect((await c().set(auth(a))).status).toBe(404);
    const p = await http.get(`/api/v1/projects/${P.claro!.id}`).set(auth(a)); expect(Object.keys(p.body).some((k) => /merge/i.test(k))).toBe(false);
  });
});

describe('Módulo 4 — com ff_merge LIGADA', () => {
  beforeAll(() => setFlag(true));
  let resultId: string; let resultKey: string;

  it('projeto de OUTRO usuário → 403 (nos dois sentidos) e nada é criado', async () => {
    const r1 = await merge(a, P.claro!.id, { otherProjectId: P.alheio!.id }); expect(r1.status).toBe(403); expect(r1.body.code).toBe('merge_forbidden');
    const r2 = await merge(a, P.alheio!.id, { otherProjectId: P.claro!.id }); expect(r2.status).toBe(403);
    expect((await merge(a, P.claro!.id, { otherProjectId: randomUUID() })).status).toBe(404);
    expect((await pool.query('SELECT count(*)::int n FROM project_merges')).rows[0].n).toBe(0);
  });

  it('validações: Idempotency-Key obrigatória, mesmo projeto, projeto não montado', async () => {
    expect((await http.post(`/api/v1/projects/${P.claro!.id}/merge`).set(auth(a)).send({ otherProjectId: P.escuro!.id })).status).toBe(400);
    expect((await merge(a, P.claro!.id, { otherProjectId: P.claro!.id })).status).toBe(400);
    expect((await merge(a, P.claro!.id, { otherProjectId: P.rascunho!.id })).status).toBe(409);
  });

  it('une claro (360x640@12, alto) + escuro (720x1280@30, baixo): normaliza, nivela o áudio, fadeblack, novo projeto; originais intactos', async () => {
    const k = idem(); const r = await merge(a, P.claro!.id, { otherProjectId: P.escuro!.id }, k); expect(r.status).toBe(202);
    const replay = await merge(a, P.claro!.id, { otherProjectId: P.escuro!.id }, k); expect(replay.body.mergeId).toBe(r.body.mergeId); expect(replay.headers['idempotent-replay']).toBe('true');
    const { st, seen } = await waitMerge(P.claro!.id, r.body.mergeId);
    expect(st.status).toBe('done'); expect(st.progress).toBe(100);
    expect([...seen].filter((x) => ['normalize', 'analyze', 'transition', 'audio', 'finalize'].includes(x)).length).toBeGreaterThanOrEqual(2); // progresso por etapa visível
    expect(st.transition).toBe('fadeblack'); expect(st.reason).toMatch(/luz/); expect(st.measures.lumaDiff).toBeGreaterThan(60);
    expect(Math.abs(st.durationSec - 11)).toBeLessThan(0.3); expect(Math.abs(st.loudnessLufs - -14)).toBeLessThanOrEqual(1);
    resultId = st.resultProjectId; const u = new URL(st.resultVideoUrl); expect(Number(u.searchParams.get('exp')) - Date.now() / 1000).toBeGreaterThan(86_000);
    const proj = (await pool.query('SELECT user_id, status, final_video_url, duration_sec, versions FROM projects WHERE id=$1', [resultId])).rows[0];
    expect(proj).toMatchObject({ user_id: a.id, status: 'ready', duration_sec: 11, versions: ['merge'] }); resultKey = proj.final_video_url;
    await withTmp(async (d) => { const f = join(d, 'm.mp4'); await writeFile(f, await getRef(resultKey)); const i = await probeMedia(f);
      expect(i).toMatchObject({ width: 720, height: 1280, fps: 30, sampleRate: 44100, channels: 2, vcodec: 'h264', acodec: 'aac', hasAudio: true });
      const l1 = await lufsOf(f, 0.5, 4), l2 = await lufsOf(f, 6.5, 4); expect(Math.abs(l1 - l2)).toBeLessThanOrEqual(1.5); // entradas diferiam ~30 dB
    });
    for (const n of ['claro', 'escuro']) expect(sha(await getRef(P[n]!.key))).toBe(P[n]!.hash);
    expect((await pool.query('SELECT final_video_url, duration_sec FROM projects WHERE id=$1', [P.claro!.id])).rows[0]).toEqual({ final_video_url: P.claro!.key, duration_sec: 6 });
    for (const op of ['merge_transition', 'merge_render']) expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation=$2`, [a.id, op])).rows[0].n).toBe(1);
    // fonte de verdade da origem: project_merges.result_project_id (não há mergedFrom em projects)
    const p = await http.get(`/api/v1/projects/${resultId}`).set(auth(a)); expect(p.status).toBe(200); expect(Object.keys(p.body)).not.toContain('mergedFrom');
    expect((await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='projects' AND column_name ILIKE '%merge%'`)).rowCount).toBe(0);
    const l = await http.get('/api/v1/merges').set(auth(a)); expect(l.body.items[0]).toMatchObject({ resultProjectId: resultId, projectAId: P.claro!.id, projectBId: P.escuro!.id });
    expect(await mergeService.mergeProjects({ mergeId: r.body.mergeId, userId: a.id }, false)).toEqual({ skipped: true }); // worker idempotente
  }, 300_000);

  it('vídeo sem áudio entra com silêncio; ordem invertida e transição escolhida pelo usuário', async () => {
    const r = await merge(a, P.mudo!.id, { otherProjectId: P.claro!.id, order: 'other_first', transition: 'circleopen' }); expect(r.status).toBe(202);
    expect(r.body.projectAId).toBe(P.claro!.id);
    const { st } = await waitMerge(P.mudo!.id, r.body.mergeId); expect(st.status).toBe('done'); expect(st.transition).toBe('circleopen'); expect(Math.abs(st.durationSec - 10.2)).toBeLessThan(0.3);
  }, 300_000);

  it('dois vídeos de 60 s viram um de ~120 s (≤ MERGE_MAX_SEC)', async () => {
    // outro usuário: o limite de 10 uniões/hora por usuário (R13) já foi consumido pelos testes acima — e isso também é verificado
    expect((await merge(a, P.claro!.id, { otherProjectId: P.escuro!.id })).status).toBe(429);
    const c = await signup({ plan: 'pro', credits: 100 });
    const x = await project(c, 'longo1', await video({ color: '0xc08040', size: '360x640', fps: 12, dur: 60, audio: 'loud' }), 60);
    const y = await project(c, 'longo2', await video({ color: '0xc08844', size: '360x640', fps: 12, dur: 60, audio: 'quiet' }), 60);
    const r = await merge(c, x, { otherProjectId: y }); expect(r.status).toBe(202); const { st } = await waitMerge(x, r.body.mergeId, c);
    expect(st.status).toBe('done'); expect(st.durationSec).toBeGreaterThan(118.5); expect(st.durationSec).toBeLessThanOrEqual(env.MERGE_MAX_SEC); expect(st.transition).toBe('fade');
  }, 300_000);

  it('isolamento: B não vê a união de A; RLS esconde project_merges', async () => {
    const id = (await pool.query('SELECT id FROM project_merges WHERE user_id=$1 LIMIT 1', [a.id])).rows[0].id;
    expect((await http.get(`/api/v1/projects/${P.claro!.id}/merge/${id}`).set(auth(b))).status).toBe(404);
    expect((await http.get('/api/v1/merges').set(auth(b))).body.items).toEqual([]);
    const q = (ctx: object) => runWithDbCtx(ctx, () => rls.query('SELECT 1 FROM project_merges WHERE user_id=$1', [a.id])).then((x) => x.rowCount);
    expect(await q({ userId: a.id })).toBeGreaterThan(0); expect(await q({ userId: b.id })).toBe(0); expect(await q({})).toBe(0);
    expect((await http.get(`/api/v1/projects/${resultId}`).set(auth(b))).status).toBe(404);
  });

  it('LGPD: exportação inclui as uniões', async () => {
    const id = (await asSystem((db) => db.query(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id`, [a.id]))).rows[0].id as string;
    await complianceService.buildExport(id, a.id); const data = JSON.parse((await storage.get('exports', `${a.id}/${id}.json`)).toString());
    expect(data.projectMerges.length).toBe(2); expect(data.projectMerges[0].result_project_id).toBeTruthy();
  });
});
