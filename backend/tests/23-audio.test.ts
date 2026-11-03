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
import { detectVoice, measureLufs, rmsFrames, hasAudioStream, duration } from '../src/modules/audio/analysis.js';
import { presetFromPrompt, speechExpr, MUSIC_PRESETS } from '../src/modules/audio/presets.js';
import { audioService } from '../src/modules/audio/audio.service.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';

/**
 * Módulo 1 — Áudio. Provedores mock (FFmpeg), Postgres e Redis reais.
 * Cobre: flag OFF idêntico; biblioteca por região; geração com Idempotency-Key e ai_usage; SFX por corte de cena;
 * mixagem com ducking, -14 LUFS, stems separados com URL assinada e vídeo original intacto; reverter/ativar;
 * voz clonada só com consentimento verificado (403 sem); revogação; isolamento entre usuários (HTTP e RLS);
 * circuit breaker; publicação usando o áudio mixado só com a flag ligada; retenção.
 */
const SPEECH_UNTIL = 3, DUR = 6;
let a: Session; let b: Session; let projectId: string; let originalKey: string; let originalHash: string; let rls: RlsPool;
const setFlag = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key='ff_audio'`, [on, on ? 100 : 0])); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `t-${randomUUID()}` });
const fetchSigned = async (url: string) => { const u = new URL(url); return http.get(u.pathname + u.search); };
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');
const ffBuf = (args: (dir: string) => string[], name: string) => withTmp(async (dir) => { await ffmpeg(args(dir)); return readFile(join(dir, name)); });
/** Vídeo final de teste: 3 trechos de cor (2 cortes de cena) e "fala" sintética só nos primeiros 3 s. */
const testVideo = (withSpeech: boolean) => ffBuf((d) => [...['0x6d28d9', '0x059669', '0xf59e0b'].flatMap((c) => ['-f', 'lavfi', '-i', `color=c=${c}:s=360x640:r=12:d=${DUR / 3}`]), '-f', 'lavfi', '-i',
  withSpeech ? `aevalsrc='${speechExpr('fixture', 0, SPEECH_UNTIL)}':s=44100:d=${DUR}` : `sine=frequency=110:sample_rate=44100:d=${DUR}`,
  '-filter_complex', '[0:v][1:v][2:v]concat=n=3:v=1:a=0,format=yuv420p[v]', '-map', '[v]', '-map', '3:a', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', join(d, 'v.mp4')], 'v.mp4');
const speechSample = (secs: number) => ffBuf((d) => ['-f', 'lavfi', '-i', `aevalsrc='${speechExpr('dono', 0, secs)}':s=44100:d=${secs}`, '-ac', '1', join(d, 's.wav')], 's.wav');
const toneSample = () => ffBuf((d) => ['-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:d=8', join(d, 't.wav')], 't.wav');
async function setFinalVideo(pid: string, withSpeech: boolean): Promise<string> {
  const key = `projects/${pid}/final-test-${randomUUID().slice(0, 6)}.mp4`; await storage.put('videos', key, await testVideo(withSpeech), 'video/mp4');
  await asSystem((db) => db.query(`UPDATE projects SET final_video_url=$2, status='ready' WHERE id=$1`, [pid, key])); return key;
}
async function newProject(s: Session): Promise<string> {
  const photo = await uploadPhoto(s); // (antes de criar a próxima requisição: supertest abre um listen por requisição pendente)
  const r = await http.post('/api/v1/projects').set(auth(s)).send({ title: 'Áudio', script: 'Cena um. Cena dois. Cena três.', photos: [photo] }); expect(r.status).toBe(201); return r.body.id;
}
async function mixAndWait(s: Session, pid: string, body: object) {
  const r = await http.post(`/api/v1/projects/${pid}/audio/mix`).set(auth(s)).set(idem()).send(body); expect(r.status, JSON.stringify(r.body)).toBe(202);
  const id = r.body.audioVersionId as string;
  const v = await waitFor(async () => { const l = await http.get(`/api/v1/projects/${pid}/audio/versions`).set(auth(s)); const it = l.body.items?.find((x: { id: string }) => x.id === id); return it && ['done', 'failed'].includes(it.status) ? it : undefined; }, 60_000, 250);
  return v as { id: string; status: string; errorCode: string | null; active: boolean; loudnessLufs: number; videoUrl: string; mixedUrl: string; stems: { voiceUrl: string | null; musicUrl: string; sfxUrl: string } };
}
async function libraryTrack(s: Session, mood = 'upbeat'): Promise<string> { const r = await http.get(`/api/v1/audio/tracks?mood=${mood}`).set(auth(s)); expect(r.status).toBe(200); return r.body.items[0].id; }

beforeAll(async () => {
  await boot(); rls = createRlsPool(env.DATABASE_URL);
  a = await signup({ plan: 'pro', credits: 100 }); b = await signup({ plan: 'pro', credits: 100 });
  projectId = await newProject(a); originalKey = await setFinalVideo(projectId, true);
  originalHash = sha(await storage.get('videos', originalKey));
}, 120_000);
afterAll(async () => { await setFlag(false); await rls.end(); await shutdown(); });

describe('Módulo 1 — unidade (sem banco)', () => {
  it('VAD separa fala de trilha/tom contínuo', async () => {
    await withTmp(async (d) => {
      await writeFile(join(d, 's.wav'), await speechSample(8)); await writeFile(join(d, 't.wav'), await toneSample());
      expect((await detectVoice(join(d, 's.wav'))).hasVoice).toBe(true); expect((await detectVoice(join(d, 't.wav'))).hasVoice).toBe(false);
    });
  });
  it('prompt define o humor da trilha gerada, com variação determinística', () => {
    expect(presetFromPrompt('trilha calma para spa').mood).toBe('calm'); expect(presetFromPrompt('energético para academia').mood).toBe('energetic');
    expect(presetFromPrompt('qualquer coisa').mood).toBe('upbeat'); expect(presetFromPrompt('x y').preset).toEqual(presetFromPrompt('x y').preset);
    expect(Object.keys(MUSIC_PRESETS)).toHaveLength(8);
  });
});

describe('Módulo 1 — com ff_audio DESLIGADA o app é idêntico', () => {
  it('todas as rotas de áudio respondem 404 e o projeto não ganha campos', async () => {
    await setFlag(false);
    const calls = [() => http.get('/api/v1/audio/config'), () => http.get('/api/v1/audio/tracks'), () => http.post('/api/v1/audio/tracks/generate').set(idem()).send({ prompt: 'calma' }),
      () => http.post(`/api/v1/projects/${projectId}/audio/mix`).set(idem()).send({ musicTrackId: randomUUID() }), () => http.get(`/api/v1/projects/${projectId}/audio/versions`),
      () => http.post(`/api/v1/projects/${projectId}/audio/sfx-suggestions`), () => http.post('/api/v1/audio/voice/consents').set(idem()), () => http.post(`/api/v1/projects/${projectId}/audio/revert`)];
    for (const c of calls) { const r = await c().set(auth(a)); expect(r.status).toBe(404); }
    const p = await http.get(`/api/v1/projects/${projectId}`).set(auth(a)); expect(p.status).toBe(200);
    expect(Object.keys(p.body).some((k) => /audio/i.test(k))).toBe(false);
    expect((await pool.query(`SELECT count(*)::int n FROM audio_versions`)).rows[0].n).toBe(0);
  });
});

describe('Módulo 1 — com ff_audio LIGADA', () => {
  beforeAll(() => setFlag(true));

  it('banner do provedor e biblioteca licenciada por região', async () => {
    const c = await http.get('/api/v1/audio/config').set(auth(a)); expect(c.status).toBe(200);
    expect(c.body.providers).toMatchObject({ music: 'mock', voice: 'mock' }); expect(c.body.notice).toMatch(/processado/); expect(c.body.targetLufs).toBe(-14);
    const t = await http.get('/api/v1/audio/tracks').set(auth(a)); expect(t.status).toBe(200);
    const titles = t.body.items.map((x: { title: string }) => x.title);
    expect(titles).toContain('Estúdio Lo-fi (demo)'); expect(titles).not.toContain('Grande Final (demo)'); // usuário LATAM: só US/EU
    const f = await http.get('/api/v1/audio/tracks?mood=calm&bpmMax=80').set(auth(a)); expect(f.body.items.every((x: { mood: string; bpm: number }) => x.mood === 'calm' && x.bpm <= 80)).toBe(true);
    const epic = (await pool.query(`SELECT id FROM music_tracks WHERE file_url='builtin:epic'`)).rows[0].id;
    expect((await http.get(`/api/v1/audio/tracks/${epic}/preview`).set(auth(a))).status).toBe(404);
    const pv = await http.get(`/api/v1/audio/tracks/${await libraryTrack(a)}/preview`).set(auth(a)); expect(pv.status).toBe(200);
    expect(new URL(pv.body.url).searchParams.get('exp')).toBeTruthy(); expect((await fetchSigned(pv.body.url)).status).toBe(200);
  }, 60_000);

  it('gerar trilha exige Idempotency-Key, repete a mesma resposta e grava ai_usage', async () => {
    expect((await http.post('/api/v1/audio/tracks/generate').set(auth(a)).send({ prompt: 'trilha calma para spa', durationSec: 8 })).status).toBe(400);
    const k = idem(); const r1 = await http.post('/api/v1/audio/tracks/generate').set(auth(a)).set(k).send({ prompt: 'trilha calma para spa', durationSec: 8 });
    expect(r1.status).toBe(201); expect(r1.body).toMatchObject({ mood: 'calm', source: 'generated', durationSec: 8 });
    const r2 = await http.post('/api/v1/audio/tracks/generate').set(auth(a)).set(k).send({ prompt: 'trilha calma para spa', durationSec: 8 });
    expect(r2.headers['idempotent-replay']).toBe('true'); expect(r2.body.id).toBe(r1.body.id);
    expect((await pool.query(`SELECT count(*)::int n FROM music_tracks WHERE owner_user_id=$1`, [a.id])).rows[0].n).toBe(1);
    expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='music_generate' AND status='ok'`, [a.id])).rows[0].n).toBe(1);
    // a trilha gerada de A não aparece para B
    const bt = await http.get('/api/v1/audio/tracks').set(auth(b)); expect(bt.body.items.map((x: { id: string }) => x.id)).not.toContain(r1.body.id);
    expect((await http.get(`/api/v1/audio/tracks/${r1.body.id}/preview`).set(auth(b))).status).toBe(404);
  }, 60_000);

  it('SFX sugeridos nos cortes de cena, na abertura e no fechamento (ai_usage gravado)', async () => {
    const r = await http.post(`/api/v1/projects/${projectId}/audio/sfx-suggestions`).set(auth(a)); expect(r.status).toBe(200);
    const items = r.body.items as { timestampSec: number; sfxId: string; reason: string }[];
    expect(items[0]!.sfxId).toBe('sparkle'); expect(items.at(-1)!.sfxId).toBe('impact');
    const whoosh = items.filter((x) => x.sfxId === 'whoosh').map((x) => x.timestampSec);
    expect(whoosh.length).toBe(2); expect(Math.abs(whoosh[0]! - 1.75)).toBeLessThan(0.3); expect(Math.abs(whoosh[1]! - 3.75)).toBeLessThan(0.3);
    expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='sfx_suggest'`, [a.id])).rows[0].n).toBe(1);
  }, 60_000);

  let firstVersion: string;
  it('mixagem: Idempotency-Key obrigatória e respeitada; ducking; -14 LUFS; stems com URL assinada; original intacto', async () => {
    const track = await libraryTrack(a);
    const body = { musicTrackId: track, sfxEvents: [{ timestampSec: 1.75, sfxId: 'whoosh' }, { timestampSec: 5.1, sfxId: 'impact' }], gains: { voice: 1, music: 0.8, sfx: 0.8 }, ducking: true };
    expect((await http.post(`/api/v1/projects/${projectId}/audio/mix`).set(auth(a)).send(body)).status).toBe(400);
    const k = idem();
    const r1 = await http.post(`/api/v1/projects/${projectId}/audio/mix`).set(auth(a)).set(k).send(body); expect(r1.status).toBe(202);
    const r2 = await http.post(`/api/v1/projects/${projectId}/audio/mix`).set(auth(a)).set(k).send(body);
    expect(r2.body.audioVersionId).toBe(r1.body.audioVersionId); expect(r2.headers['idempotent-replay']).toBe('true');
    expect((await http.post(`/api/v1/projects/${projectId}/audio/mix`).set(auth(a)).set(k).send({ ...body, ducking: false })).status).toBe(422); // mesma chave, outro corpo
    const v = await waitFor(async () => { const l = await http.get(`/api/v1/projects/${projectId}/audio/versions`).set(auth(a)); const it = l.body.items?.[0]; return it?.status === 'done' || it?.status === 'failed' ? l.body : undefined; }, 60_000, 250);
    expect((await pool.query(`SELECT count(*)::int n FROM audio_versions WHERE project_id=$1`, [projectId])).rows[0].n).toBe(1);
    const it = v.items[0]; firstVersion = it.id;
    expect(it.status).toBe('done'); expect(it.active).toBe(true); expect(v.activeVersionId).toBe(it.id);
    expect(Math.abs(it.loudnessLufs - -14)).toBeLessThanOrEqual(1);
    for (const u of [it.videoUrl, it.mixedUrl, it.stems.voiceUrl, it.stems.musicUrl, it.stems.sfxUrl]) {
      expect(u).toBeTruthy(); const url = new URL(u); expect(Number(url.searchParams.get('exp')) - Date.now() / 1000).toBeGreaterThan(86_000); // ~24 h
      expect((await fetchSigned(u)).status).toBe(200);
    }
    // arquivos: vídeo novo tem áudio e a mesma duração; mix em -14 LUFS medido de novo; ducking na trilha
    await withTmp(async (d) => {
      const get = async (u: string, n: string) => { const l = refLocation(new URL(u).pathname.split('/storage/')[1]!.replace(/^videos\//, '')); await writeFile(join(d, n), await storage.get('videos', l.key)); return join(d, n); };
      const vid = await get(it.videoUrl, 'v.mp4'); expect(await hasAudioStream(vid)).toBe(true); expect(Math.abs((await duration(vid)) - DUR)).toBeLessThan(0.3);
      expect(Math.abs((await measureLufs(await get(it.mixedUrl, 'm.m4a'))) - -14)).toBeLessThanOrEqual(1);
      const music = await rmsFrames(await get(it.stems.musicUrl, 'mu.m4a')); const fps = 20; // janelas de 50 ms
      const avg = (from: number, to: number) => { const s = music.slice(from * fps, to * fps); return s.reduce((x, y) => x + y, 0) / s.length; };
      expect(avg(3.6, 5.2) - avg(0.4, 2.6)).toBeGreaterThan(4); // trilha ≥ 4 dB mais baixa enquanto a voz fala
    });
    expect(sha(await storage.get('videos', originalKey))).toBe(originalHash); // MP4 original nunca é sobrescrito
    expect((await pool.query(`SELECT final_video_url FROM projects WHERE id=$1`, [projectId])).rows[0].final_video_url).toBe(originalKey);
  }, 120_000);

  it('sem voz detectável no vídeo, o stem de voz fica null; "sem voz" também', async () => {
    const pid = await newProject(a); await setFinalVideo(pid, false);
    const v = await mixAndWait(a, pid, { musicTrackId: await libraryTrack(a), voice: { source: 'original' } });
    expect(v.status).toBe('done'); expect(v.stems.voiceUrl).toBeNull(); expect(v.stems.musicUrl).toBeTruthy();
    const n = await mixAndWait(a, projectId, { musicTrackId: await libraryTrack(a, 'calm'), voice: { source: 'none' }, ducking: false });
    expect(n.status).toBe('done'); expect(n.stems.voiceUrl).toBeNull();
  }, 120_000);

  it('reverter para o áudio original e ativar de novo uma versão', async () => {
    const r = await http.post(`/api/v1/projects/${projectId}/audio/revert`).set(auth(a)); expect(r.status).toBe(200);
    expect(r.body.activeVersionId).toBeNull(); expect(r.body.items.every((x: { active: boolean }) => !x.active)).toBe(true);
    const ac = await http.post(`/api/v1/projects/${projectId}/audio/versions/${firstVersion}/activate`).set(auth(a)); expect(ac.status).toBe(200); expect(ac.body.activeVersionId).toBe(firstVersion);
  });

  it('publicação usa o vídeo mixado só com a flag ligada e a versão da montagem atual', async () => {
    const proj = (await pool.query(`SELECT id, final_video_url, active_audio_version_id FROM projects WHERE id=$1`, [projectId])).rows[0];
    const u = { id: a.id, region: 'LATAM', plan: 'pro' };
    const mixed = (await pool.query(`SELECT video_url FROM audio_versions WHERE id=$1`, [firstVersion])).rows[0].video_url;
    expect(await audioService.effectiveVideoRef(proj, u)).toBe(mixed);
    await setFlag(false); expect(await audioService.effectiveVideoRef(proj, u)).toBe(originalKey); await setFlag(true);
    expect(await audioService.effectiveVideoRef({ ...proj, final_video_url: 'projects/x/remontado.mp4' }, u)).toBe('projects/x/remontado.mp4'); // remontou: versão antiga não vale
  });

  it('voz clonada: 403 sem consentimento verificado; amostra ruim é recusada; fluxo completo; revogar bloqueia o uso', async () => {
    const c = await http.post('/api/v1/audio/voice/consents').set(auth(a)).set(idem()); expect(c.status).toBe(201);
    expect(c.body.phrase).toMatch(/Código \d{6}/); const cid = c.body.consentId as string;
    const stored = (await pool.query(`SELECT challenge_hash, audio_sample_url, verified_at FROM consents WHERE id=$1`, [cid])).rows[0];
    expect(stored.challenge_hash).toMatch(/^[0-9a-f]{64}$/); expect(JSON.stringify(stored)).not.toContain('Código'); // frase só em hash
    expect((await http.post('/api/v1/audio/voice/clone').set(auth(a)).set(idem()).send({ consentId: cid })).status).toBe(403);
    // amostra só com tom → recusada (sem fala) e apagada, para regravar no mesmo consentimento
    const put = (buf: Buffer) => http.put(`/api/v1/audio/voice/consents/${cid}/sample`).set(auth(a)).set('content-type', 'audio/wav').send(buf);
    expect((await put(await toneSample())).status).toBe(201);
    expect((await put(await toneSample())).status).toBe(409); // uma amostra por vez
    const bad = await http.post(`/api/v1/audio/voice/consents/${cid}/verify`).set(auth(a)); expect(bad.status).toBe(422); expect(bad.body.details.reasons).toContain('no_speech');
    expect((await pool.query(`SELECT audio_sample_url FROM consents WHERE id=$1`, [cid])).rows[0].audio_sample_url).toBeNull();
    expect((await put(await speechSample(8))).status).toBe(201);
    // no storage a amostra está criptografada (não é um WAV legível)
    const enc = await storage.get('uploads', `${a.id}/voice/${cid}.enc`); expect(enc.subarray(0, 4).toString()).toBe('NXB1'); expect(enc.includes(Buffer.from('RIFF'))).toBe(false);
    // outro usuário não enxerga nem mexe no consentimento
    expect((await http.post(`/api/v1/audio/voice/consents/${cid}/verify`).set(auth(b))).status).toBe(404);
    expect((await http.post('/api/v1/audio/voice/clone').set(auth(b)).set(idem()).send({ consentId: cid })).status).toBe(404);
    const ok = await http.post(`/api/v1/audio/voice/consents/${cid}/verify`).set(auth(a)); expect(ok.status).toBe(200); expect(ok.body.verifiedAt).toBeTruthy();
    const cl = await http.post('/api/v1/audio/voice/clone').set(auth(a)).set(idem()).send({ consentId: cid }); expect(cl.status).toBe(201);
    const voiceModelId = cl.body.voiceModelId as string;
    expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='voice_clone_create'`, [a.id])).rows[0].n).toBe(1);
    // B não usa a voz de A
    const pb = await newProject(b); await setFinalVideo(pb, true);
    const tb = await libraryTrack(b);
    expect((await http.post(`/api/v1/projects/${pb}/audio/mix`).set(auth(b)).set(idem()).send({ musicTrackId: tb, voice: { source: 'clone', voiceModelId } })).status).toBe(403);
    // mixagem com a voz clonada
    const v = await mixAndWait(a, projectId, { musicTrackId: await libraryTrack(a), voice: { source: 'clone', voiceModelId } });
    expect(v.status).toBe('done'); expect(v.stems.voiceUrl).toBeTruthy();
    expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='voice_clone_tts'`, [a.id])).rows[0].n).toBe(1);
    // revogar: amostra apagada, modelo desativado, uso bloqueado
    expect((await http.delete(`/api/v1/audio/voice/consents/${cid}`).set(auth(a))).status).toBe(200);
    expect(await storage.exists('uploads', `${a.id}/voice/${cid}.enc`)).toBe(false);
    expect((await pool.query(`SELECT status FROM voice_models WHERE id=$1`, [voiceModelId])).rows[0].status).toBe('deleted');
    const ta = await libraryTrack(a);
    expect((await http.post(`/api/v1/projects/${projectId}/audio/mix`).set(auth(a)).set(idem()).send({ musicTrackId: ta, voice: { source: 'clone', voiceModelId } })).status).toBe(403);
    const list = await http.get('/api/v1/audio/voice/consents').set(auth(a)); expect(list.body.items.find((x: { consentId: string }) => x.consentId === cid).status).toBe('revoked');
  }, 180_000);

  it('isolamento: B não vê versões de áudio de A (HTTP) e o RLS esconde as tabelas novas', async () => {
    expect((await http.get(`/api/v1/projects/${projectId}/audio/versions`).set(auth(b))).status).toBe(404);
    expect((await http.post(`/api/v1/projects/${projectId}/audio/revert`).set(auth(b))).status).toBe(404);
    const q = (sql: string, p: unknown[], ctx: object) => runWithDbCtx(ctx, () => rls.query(sql, p)).then((r) => r.rowCount);
    expect(await q(`SELECT 1 FROM audio_versions WHERE project_id=$1`, [projectId], { userId: a.id })).toBeGreaterThan(0);
    for (const ctx of [{ userId: b.id }, {}]) {
      expect(await q(`SELECT 1 FROM audio_versions WHERE project_id=$1`, [projectId], ctx)).toBe(0);
      expect(await q(`SELECT 1 FROM voice_models WHERE user_id=$1`, [a.id], ctx)).toBe(0);
      expect(await q(`SELECT 1 FROM music_tracks WHERE owner_user_id=$1`, [a.id], ctx)).toBe(0);
    }
    expect(await q(`SELECT 1 FROM music_tracks WHERE owner_user_id IS NULL`, [], {})).toBe(8); // biblioteca é leitura pública
    await expect(runWithDbCtx({ userId: a.id }, () => rls.query(`INSERT INTO music_tracks (title,mood,genre,bpm,duration,file_url) VALUES ('x','x','x',100,10,'builtin:x')`))).rejects.toThrow(/row-level security/);
  });

  it('circuit breaker: 3 falhas do provedor de música abrem o circuito; o usuário recebe 503 com mensagem clara; ai_usage registra o erro', async () => {
    process.env.MOCK_FAIL_MUSIC = '1';
    try {
      for (let i = 0; i < 3; i++) {
        const r = await http.post('/api/v1/audio/tracks/generate').set(auth(a)).set(idem()).send({ prompt: `falha ${i}`, durationSec: 5 });
        expect(r.status).toBe(503); expect(r.body.code).toBe('audio_provider_unavailable'); expect(r.body.message).toMatch(/biblioteca/);
      }
      expect(await redis.exists('cb:open:music:mock')).toBe(1); expect(await redis.exists('cb:open:mock')).toBe(0); // não contamina o breaker do vídeo
      expect((await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND operation='music_generate' AND status='error'`, [a.id])).rows[0].n).toBe(3);
    } finally { delete process.env.MOCK_FAIL_MUSIC; await redis.del('cb:open:music:mock', 'cb:fail:music:mock'); }
  }, 60_000);

  it('retenção: versões não ativas antigas são apagadas (linha e arquivos); a ativa fica', async () => {
    const active = (await pool.query(`SELECT active_audio_version_id a FROM projects WHERE id=$1`, [projectId])).rows[0].a as string; expect(active).toBeTruthy();
    const old = (await pool.query(`SELECT id FROM audio_versions WHERE project_id=$1 AND id<>$2 AND status='done' LIMIT 1`, [projectId, active])).rows[0].id as string;
    await asSystem((db) => db.query(`UPDATE audio_versions SET created_at=now()-interval '400 days' WHERE project_id=$1`, [projectId]));
    const prefix = `projects/${projectId}/audio/${old}/`; expect(await storage.exists('videos', `${prefix}mix.m4a`)).toBe(true);
    const r = await audioService.purgeExpired(); expect(r.deleted).toBeGreaterThan(0);
    expect(await storage.exists('videos', `${prefix}mix.m4a`)).toBe(false);
    expect((await pool.query(`SELECT count(*)::int n FROM audio_versions WHERE id=$1`, [active])).rows[0].n).toBe(1);
    expect(await storage.exists('videos', `projects/${projectId}/audio/${active}/mix.m4a`)).toBe(true);
  });

  it('LGPD: a exportação de dados inclui versões de áudio, vozes clonadas e trilhas geradas (sem URLs assinadas)', async () => {
    const id = (await asSystem((db) => db.query(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id`, [a.id]))).rows[0].id as string;
    await complianceService.buildExport(id, a.id);
    const data = JSON.parse((await storage.get('exports', `${a.id}/${id}.json`)).toString());
    expect(data.audio.versions.length).toBeGreaterThan(0); expect(data.audio.voiceModels.length).toBe(1); expect(data.audio.generatedTracks.length).toBe(1);
    expect(data.consents.some((c: { type: string; verified_at: string | null }) => c.type === 'voice_clone' && c.verified_at)).toBe(true);
    expect(JSON.stringify(data.audio)).not.toMatch(/sig=|provider_voice_id|challenge_hash/);
  });
});
