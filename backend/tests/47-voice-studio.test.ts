import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { boot, shutdown, http, signup, auth, uploadPhoto, waitFor, pool, type Session } from './helpers.js';
import { env, type Env } from '../src/config/env.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { storage, refLocation } from '../src/providers/storage.js';
import { detectVoice, looksLikeSpeech } from '../src/modules/audio/analysis.js';
import { alignScenes, wordsToCues } from '../src/providers/ai/narration.js';
import { compose, COMPOSER_MOODS, composerAvailable } from '../src/modules/audio/composer.js';
import { resolveVoice, OPEN_VOICES } from '../src/providers/ai/voices.js';

/**
 * Estúdio de voz (ff_voice_studio): vozes abertas reais, texto → voz, gravação da narração, música composta/enviada
 * e a montagem usando tudo isso. As partes com modelos de voz de verdade rodam quando OPEN_VOICE_MODELS aponta para a
 * pasta com os modelos (piper/, kokoro/, whisper-base/) e PIPER_TEST_BIN / KOKORO_TEST_PYTHON / WHISPER_TEST_PYTHON
 * apontam para os programas — sem isso (ex.: CI sem os ~800 MB de modelos), esses testes ficam marcados como pulados.
 */
const MODELS = process.env.OPEN_VOICE_MODELS; const REAL = !!(MODELS && process.env.PIPER_TEST_BIN && process.env.KOKORO_TEST_PYTHON && process.env.WHISPER_TEST_PYTHON);
const saved: Partial<Env> = {};
const set = (o: Partial<Env>) => { for (const [k, v] of Object.entries(o)) { (saved as Record<string, unknown>)[k] ??= (env as Record<string, unknown>)[k]; (env as Record<string, unknown>)[k] = v; } };
const flag = async (on: boolean) => { await pool.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key='ff_voice_studio'`, [on, on ? 100 : 0]); await invalidateFlags(); };
let s: Session; let other: Session; let dir: string;
const ff = (args: string[]) => { const r = spawnSync('ffmpeg', ['-v', 'error', '-y', ...args]); if (r.status !== 0) throw new Error(String(r.stderr)); };
const fetchBuf = async (url: string) => { const u = new URL(url); const r = await http.get(u.pathname + u.search).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }); expect(r.status).toBe(200); return r.body as Buffer; };
const probeDur = (f: string) => Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.toString());
const whisper = (wav: string, lang = 'pt') => JSON.parse(spawnSync(process.env.WHISPER_TEST_PYTHON!, ['tools/whisper/transcribe.py', wav, join(MODELS!, 'whisper-base'), lang]).stdout.toString()) as { words: { w: string; start: number; end: number }[] };
const norm = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'studio-'));
  if (REAL) set({ PIPER_VOICES_DIR: join(MODELS!, 'piper'), PIPER_BIN: process.env.PIPER_TEST_BIN!, KOKORO_PYTHON: process.env.KOKORO_TEST_PYTHON!, KOKORO_MODEL: join(MODELS!, 'kokoro/kokoro-v1.0.int8.onnx'), KOKORO_VOICES: join(MODELS!, 'kokoro/voices-v1.0.bin'),
    WHISPER_PYTHON: process.env.WHISPER_TEST_PYTHON!, WHISPER_MODEL: join(MODELS!, 'whisper-base'), AI_TTS_PROVIDER: 'open', AI_TTS_FALLBACK: 'espeak', AI_STT_PROVIDER: 'whisper' });
  set({ AI_MUSIC_PROVIDER: 'composer' });
  await boot(); s = await signup({ plan: 'pro', credits: 80 }); other = await signup();
});
afterAll(async () => { await flag(false); for (const [k, v] of Object.entries(saved)) (env as Record<string, unknown>)[k] = v; await shutdown(); rmSync(dir, { recursive: true, force: true }); });

describe('unidades', () => {
  it('compositor: MIDI válido, determinístico, com partes por humor e notas no intervalo MIDI', () => {
    for (const m of COMPOSER_MOODS) {
      const a = compose(m, 30, 7), b = compose(m, 30, 7), c = compose(m, 30, 8);
      expect(a.midi.subarray(0, 4).toString()).toBe('MThd'); expect(a.midi.equals(b.midi)).toBe(true); expect(a.midi.equals(c.midi)).toBe(false);
      expect(a.bars * a.barSec).toBeGreaterThanOrEqual(30);
      const all = Object.values(a.channels).flat(); expect(all.length).toBeGreaterThan(50); for (const n of all) { expect(n.p).toBeGreaterThanOrEqual(0); expect(n.p).toBeLessThanOrEqual(127); }
      expect(a.channels.bass!.length).toBeGreaterThan(0); expect(a.channels.chords!.length).toBeGreaterThan(0);
    }
    expect(compose('calm', 30, 1).channels.drums!.length).toBe(0); expect(compose('energetic', 30, 1).channels.drums!.length).toBeGreaterThan(50);
  });
  it('narração gravada: cenas alinhadas pelas palavras; sem transcrição, divisão proporcional; legendas ≤ 42 caracteres', () => {
    const words = 'conheça a bicicleta elétrica . a bateria dura o dia todo . peça já a sua'.split(' ').filter((w) => w !== '.').map((w, i) => ({ w, start: i * 0.4, end: i * 0.4 + 0.3 }));
    const st = alignScenes(words, ['Conheça a bicicleta elétrica.', 'A bateria dura o dia todo.', 'Peça já a sua!'], 6);
    expect(st).toEqual([0, 1.6, 4]);
    const prop = alignScenes([], ['aaaa', 'aaaa'], 8); expect(prop).toEqual([0, 4]);
    const cues = wordsToCues(words); for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(42);
    expect(cues[0]!.start).toBe(0); expect(cues.at(-1)!.end).toBeCloseTo(words.at(-1)!.end, 5);
  });
  it('catálogo: sem vozes com licença NÃO comercial; cada idioma tem voz feminina e masculina', () => {
    expect(OPEN_VOICES.map((v) => v.model)).not.toEqual(expect.arrayContaining(['en_US-ryan-medium']));
    for (const l of ['pt-BR', 'en', 'es'] as const) for (const g of ['female', 'male'] as const) expect(OPEN_VOICES.some((v) => v.locale === l && v.gender === g)).toBe(true);
  });
});

describe('flag desligada', () => {
  it('todas as rotas do estúdio respondem 404 (o app se comporta como antes)', async () => {
    await flag(false);
    expect((await http.get('/api/v1/audio/studio/voices').set(auth(s))).status).toBe(404);
    expect((await http.post('/api/v1/audio/studio/tts').set(auth(s)).send({ text: 'oi' })).status).toBe(404);
    expect((await http.post('/api/v1/audio/studio/recordings').set(auth(s)).set('content-type', 'audio/webm').send(Buffer.from('x'))).status).toBe(404);
  });
});

describe('estúdio ligado', () => {
  beforeAll(async () => { await flag(true); });

  it.skipIf(!REAL)('vozes reais instaladas: pt-BR com feminina e masculina disponíveis, padrões por gênero', async () => {
    const r = await http.get('/api/v1/audio/studio/voices?locale=pt-BR').set(auth(s)); expect(r.status).toBe(200);
    expect(r.body.items.filter((v: { available: boolean }) => v.available).length).toBeGreaterThanOrEqual(4);
    expect(r.body.defaults).toEqual({ female: 'kokoro:pf_dora', male: 'kokoro:pm_alex' });
    expect(resolveVoice('pt-BR', 'male', 'piper:pt_BR-cadu-medium')?.id).toBe('piper:pt_BR-cadu-medium');
  });

  it.skipIf(!REAL)('texto → voz com Piper e Kokoro: fala de verdade, e o Whisper entende o que foi dito', async () => {
    const text = 'Conheça a nova bicicleta elétrica urbana. A bateria dura o dia inteiro.';
    for (const voiceId of ['piper:pt_BR-faber-medium', 'kokoro:pf_dora', 'piper:pt_BR-cadu-medium']) {
      const r = await http.post('/api/v1/audio/studio/tts').set(auth(s)).send({ text, locale: 'pt-BR', voiceId }); expect(r.status, JSON.stringify(r.body)).toBe(201);
      expect(r.body.voice).toBe(voiceId); expect(r.body.durationSec).toBeGreaterThan(2);
      const f = join(dir, `${voiceId.replace(/\W/g, '_')}.m4a`); writeFileSync(f, await fetchBuf(r.body.url)); const wav = f + '.wav'; ff(['-i', f, '-ar', '16000', '-ac', '1', wav]);
      const va = await detectVoice(wav); expect(looksLikeSpeech(va), `${voiceId}: ${JSON.stringify(va)}`).toBe(true);
      const said = norm(whisper(wav).words.map((w) => w.w).join(' '));
      const hits = ['biciclet', 'eletric', 'bateri', 'inteir', 'urban', 'nova'].filter((w) => said.includes(w)); // radicais: o Whisper base (o menor) erra uma vogal aqui e ali
      expect(hits.length, `${voiceId}: "${said}"`).toBeGreaterThanOrEqual(5);
    }
    const usage = await pool.query(`SELECT provider FROM ai_usage WHERE user_id=$1 AND operation='tts_inline' AND cost_cents=0`, [s.id]);
    expect(new Set(usage.rows.map((x) => x.provider))).toEqual(new Set(['piper', 'kokoro']));
  }, 240_000);

  it('texto → voz: texto longo demais (400), voz inexistente (404)', async () => {
    expect((await http.post('/api/v1/audio/studio/tts').set(auth(s)).send({ text: 'a'.repeat(env.TTS_PREVIEW_MAX_CHARS + 1), locale: 'pt-BR' })).status).toBe(400);
    expect((await http.post('/api/v1/audio/studio/tts').set(auth(s)).send({ text: 'oi', locale: 'pt-BR', voiceId: 'piper:nao-existe' })).status).toBe(404);
  });

  it('gravação: aceita o formato do navegador (webm/opus e mp4/aac), trata e guarda; recusa áudio sem voz e arquivo inválido', async () => {
    // "voz gravada": fala sintetizada pelo espeak-ng (sempre instalado), como o MediaRecorder entregaria
    const raw = join(dir, 'fala.wav'); spawnSync(env.ESPEAK_BIN, ['-v', 'pt-br', '-w', raw, 'Olá, esta é a minha voz gravada no celular, falando sobre a bicicleta elétrica.']);
    const webm = join(dir, 'rec.webm'), mp4 = join(dir, 'rec.m4a'), tone = join(dir, 'tom.webm');
    ff(['-i', raw, '-c:a', 'libopus', '-b:a', '48k', webm]); ff(['-i', raw, '-c:a', 'aac', mp4]); ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-c:a', 'libopus', tone]);
    const a = await http.post('/api/v1/audio/studio/recordings').set(auth(s)).set('content-type', 'audio/webm;codecs=opus').send(readFileSync(webm)); expect(a.status, JSON.stringify(a.body)).toBe(201);
    expect(a.body.durationSec).toBeGreaterThan(2); expect(a.body.url).toMatch(/recordings/);
    const b = await http.post('/api/v1/audio/studio/recordings').set(auth(s)).set('content-type', 'audio/mp4').send(readFileSync(mp4)); expect(b.status).toBe(201);
    const t = await http.post('/api/v1/audio/studio/recordings').set(auth(s)).set('content-type', 'audio/webm').send(readFileSync(tone)); expect(t.status).toBe(422); expect(t.body.code).toBe('recording_no_voice');
    const g = await http.post('/api/v1/audio/studio/recordings').set(auth(s)).set('content-type', 'audio/webm').send(Buffer.from('isso nao e audio')); expect(g.status).toBe(422); expect(g.body.code).toBe('recording_invalid');
    const list = await http.get('/api/v1/audio/studio/recordings').set(auth(s)); expect(list.body.items.map((x: { id: string }) => x.id)).toEqual(expect.arrayContaining([a.body.id, b.body.id]));
    expect((await http.get('/api/v1/audio/studio/recordings').set(auth(other))).body.items).toEqual([]); // RLS: cada um só vê as suas
    expect((await http.delete(`/api/v1/audio/studio/recordings/${a.body.id}`).set(auth(other))).status).toBe(404);
    expect((await http.delete(`/api/v1/audio/studio/recordings/${b.body.id}`).set(auth(s))).status).toBe(200);
    expect((await http.delete(`/api/v1/audio/studio/recordings/${b.body.id}`).set(auth(s))).status).toBe(404);
  }, 120_000);

  it.skipIf(!composerAvailable())('música composta (instrumentos reais) e música enviada pelo usuário, com licença; ninguém mais vê a do usuário', async () => {
    const c = await http.post('/api/v1/audio/studio/tracks/compose').set(auth(s)).set('idempotency-key', `c-${Date.now()}`).send({ mood: 'calm', durationSec: 20 }); expect(c.status, JSON.stringify(c.body)).toBe(201);
    const pv = await http.get(`/api/v1/audio/studio/tracks/${c.body.id}/preview`).set(auth(s)); expect(pv.status).toBe(200);
    const f = join(dir, 'calm.m4a'); writeFileSync(f, await fetchBuf(pv.body.url)); expect(probeDur(f)).toBeCloseTo(20, 0);
    const ent = spawnSync('ffmpeg', ['-hide_banner', '-i', f, '-af', 'aspectralstats=measure=entropy,ametadata=print:file=-', '-f', 'null', '-'], { encoding: 'utf8' }).stdout.split('\n').filter((l) => l.includes('1.entropy')).map((l) => Number(l.split('=')[1]));
    expect(ent.reduce((x, y) => x + y, 0) / ent.length).toBeGreaterThan(0.15); // instrumentos reais; o tom de demonstração fica perto de 0,08
    const mp3 = join(dir, 'minha.mp3'); ff(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=8', '-c:a', 'libmp3lame', mp3]);
    expect((await http.post('/api/v1/audio/studio/tracks/upload?title=Minha').set(auth(s)).set('content-type', 'audio/mpeg').send(readFileSync(mp3))).body.code).toBe('music_rights_required');
    const u = await http.post('/api/v1/audio/studio/tracks/upload?title=Minha%20faixa&rights=own').set(auth(s)).set('content-type', 'audio/mpeg').send(readFileSync(mp3)); expect(u.status, JSON.stringify(u.body)).toBe(201);
    const mine = (await http.get('/api/v1/audio/studio/tracks').set(auth(s))).body.items.find((x: { id: string }) => x.id === u.body.id);
    expect(mine).toMatchObject({ title: 'Minha faixa', mine: true, license: 'Declarado pelo usuário: obra própria' });
    expect((await http.get(`/api/v1/audio/studio/tracks/${u.body.id}/preview`).set(auth(other))).status).toBe(404);
    expect((await http.get('/api/v1/audio/studio/tracks').set(auth(other))).body.items.some((x: { id: string }) => x.id === u.body.id)).toBe(false);
  }, 120_000);

  it.skipIf(!REAL)('montagem com a narração GRAVADA + música composta: cenas no ritmo da fala, legendas pelas palavras reais, música por baixo', async () => {
    const script = 'Conheça a nova bicicleta elétrica urbana. A bateria dura o dia inteiro. Peça a sua hoje mesmo.';
    const ref = await uploadPhoto(s);
    const c = await http.post('/api/v1/projects').set(auth(s)).send({ title: 'Gravado', script, locale: 'pt-BR', photos: [ref] }); expect(c.status).toBe(201);
    await http.post(`/api/v1/projects/${c.body.id}/storyboard`).set(auth(s)).send({});
    const p = await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.scenes?.length ? x : undefined; });
    // a "gravação" do usuário: a voz Cadu lendo o roteiro (fala real, com ritmo próprio)
    const tts = await http.post('/api/v1/audio/studio/tts').set(auth(s)).send({ text: script, locale: 'pt-BR', voiceId: 'piper:pt_BR-cadu-medium' });
    const m4a = join(dir, 'gravacao.m4a'); writeFileSync(m4a, await fetchBuf(tts.body.url)); const webm = join(dir, 'gravacao.webm'); ff(['-i', m4a, '-c:a', 'libopus', webm]);
    const rec = await http.post(`/api/v1/audio/studio/recordings?projectId=${c.body.id}`).set(auth(s)).set('content-type', 'audio/webm').send(readFileSync(webm)); expect(rec.status).toBe(201);
    const track = await http.post('/api/v1/audio/studio/tracks/compose').set(auth(s)).set('idempotency-key', `k-${Date.now()}`).send({ mood: 'upbeat', durationSec: 30 }); expect(track.status).toBe(201);
    const put = await http.put(`/api/v1/projects/${c.body.id}/audio-settings`).set(auth(s)).send({ narration: { mode: 'recorded', recordingId: rec.body.id }, music: { trackId: track.body.id, volume: 0.4 } }); expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect((await http.put(`/api/v1/projects/${c.body.id}/audio-settings`).set(auth(other)).send({ narration: { mode: 'tts' } })).status).toBe(404);
    await http.post(`/api/v1/projects/${c.body.id}/scenes/${p.scenes[0].id}/generate`).set(auth(s)).send({ chain: true });
    await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.scenes.every((y: { status: string }) => y.status === 'done') ? x : undefined; }, 120_000);
    expect((await http.post(`/api/v1/projects/${c.body.id}/assemble`).set(auth(s)).send({})).status).toBe(202);
    const ready = await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.status === 'ready' || x.status === 'failed' ? x : undefined; }, 240_000);
    expect(ready.status).toBe('ready');
    const row = (await pool.query<{ final_video_url: string }>('SELECT final_video_url FROM projects WHERE id=$1', [c.body.id])).rows[0]!;
    const mp4 = join(dir, 'final.mp4'); const l = refLocation(row.final_video_url); writeFileSync(mp4, await storage.get(l.bucket, l.key));
    const total = probeDur(mp4); expect(total).toBeGreaterThan(rec.body.durationSec - 0.2); expect(total).toBeLessThan(rec.body.durationSec + 1.5); // dura o tempo da gravação
    const wav = join(dir, 'final.wav'); ff(['-i', mp4, '-ar', '16000', '-ac', '1', wav]);
    const heard = norm(whisper(wav).words.map((w) => w.w).join(' ')); for (const w of ['biciclet', 'bateri', 'hoje']) expect(heard).toContain(w); // a narração é a gravação
    const vtt = (await storage.get('videos', row.final_video_url.replace(/\.mp4$/, '.vtt'))).toString();
    expect(norm(vtt)).toContain('biciclet'); expect(vtt.split('-->').length - 1).toBeGreaterThanOrEqual(3);
    // música por baixo: no fim (fala já acabou) ainda há som
    const tail = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(Math.max(0, total - 1.2)), '-i', mp4, '-t', '0.6', '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
    expect(Number(/mean_volume: (-?[\d.]+) dB/.exec(tail)?.[1] ?? -99)).toBeGreaterThan(-45);
    const usage = await pool.query(`SELECT 1 FROM ai_usage WHERE project_id=$1 AND operation='narration_recorded'`, [c.body.id]); expect(usage.rowCount).toBe(1);
  }, 400_000);
});
