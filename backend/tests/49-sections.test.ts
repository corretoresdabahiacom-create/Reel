import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { boot, shutdown, http, signup, auth, uploadPhoto, waitFor, pool, type Session } from './helpers.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { storage, refLocation } from '../src/providers/storage.js';
import { splitSpeech, speechSec, durationFor, parseMotion, withMotion, SECTION_MAX_SEC } from '../src/modules/projects/sections.js';
import { motionFilter } from '../src/providers/ai/motion.js';

/** Seções de até 15 s (ff_sections): divisão automática, foto/movimento por seção e a montagem com a foto se movendo de verdade. */
const flag = async (on: boolean) => { await pool.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key='ff_sections'`, [on, on ? 100 : 0]); await invalidateFlags(); };
const sentence = (n: number, tag: string) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ') + '.';
let s: Session; let other: Session; let dir: string;
beforeAll(async () => { dir = mkdtempSync(join(tmpdir(), 'sec-')); await boot(); s = await signup({ plan: 'pro', credits: 80 }); other = await signup(); });
afterAll(async () => { await flag(false); await shutdown(); rmSync(dir, { recursive: true, force: true }); });

describe('unidades', () => {
  it('a fala de 15 s cabe ~39 palavras; acima disso divide por frase e, sem frase que caiba, por palavras', () => {
    expect(splitSpeech('Oi. Tudo bem?')).toEqual(['Oi. Tudo bem?']);
    const a = splitSpeech([sentence(19, 'a'), sentence(19, 'b'), sentence(19, 'c')].join(' '));
    expect(a).toHaveLength(2); expect(a[0]).toContain('b18.'); expect(a[1]).toContain('c0'); // quebra no fim da frase, não no meio
    for (const p of a) expect(speechSec(p)).toBeLessThanOrEqual(SECTION_MAX_SEC);
    const b = splitSpeech(Array.from({ length: 100 }, (_, i) => `w${i}`).join(' ')); // uma frase só, longa demais
    expect(b).toHaveLength(3); for (const p of b) expect(speechSec(p)).toBeLessThanOrEqual(SECTION_MAX_SEC);
    expect(b.join(' ').split(' ')).toHaveLength(100); // nada se perde
    expect(splitSpeech('')).toEqual(['']);
  });
  it('duração da seção acompanha a fala (3–15 s) e o movimento viaja no prompt sem se perder', () => {
    expect(durationFor('Oi')).toBe(3); expect(durationFor(sentence(26, 'x'))).toBe(11); expect(durationFor(sentence(200, 'x'))).toBe(15);
    expect(parseMotion(withMotion('pan_left', 'a câmera passeia pelo produto'))).toEqual({ motion: 'pan_left', action: 'a câmera passeia pelo produto' });
    expect(parseMotion('prompt antigo sem movimento')).toEqual({ motion: null, action: 'prompt antigo sem movimento' });
    expect(parseMotion('[mov:inexistente] x').motion).toBeNull();
  });
  it('filtro de movimento: um para cada gesto, nenhum para "parada" (usa o clipe da cena)', () => {
    for (const m of ['zoom_in', 'zoom_out', 'pan_left', 'pan_right']) expect(motionFilter(m, 6)).toMatch(/zoompan=.*d=72:s=360x640:fps=12/);
    expect(motionFilter('still', 6)).toBeNull(); expect(motionFilter('xyz', 6)).toBeNull();
  });
});

describe('PUT /projects/{id}/sections', () => {
  it('desligada → 404; ligada: grava foto, movimento e texto; divide o que passa de 15 s; protege o dono', async () => {
    const ref = await uploadPhoto(s), ref2 = await uploadPhoto(s);
    const c = await http.post('/api/v1/projects').set(auth(s)).send({ title: 'Seções', script: 'Roteiro de teste para as seções do vídeo.', locale: 'pt-BR', photos: [ref, ref2] }); expect(c.status).toBe(201);
    const url = `/api/v1/projects/${c.body.id}/sections`; const body = { sections: [{ text: 'Abertura curta.', action: 'a câmera se aproxima do produto', photoIndex: 0, motion: 'zoom_in' }, { text: [sentence(25, 'a'), sentence(25, 'b'), sentence(25, 'c')].join(' '), action: 'passeia pela foto', photoIndex: 1, motion: 'pan_right' }] };
    await flag(false); expect((await http.put(url).set(auth(s)).send(body)).status).toBe(404);
    await flag(true);
    expect((await http.put(url).set(auth(other)).send(body)).status).toBe(404); // outro usuário não vê o projeto
    expect((await http.put(url).set(auth(s)).send({ sections: [{ text: 'x', photoIndex: 5 }] })).status).toBe(422); // foto inexistente
    expect((await http.put(url).set(auth(s)).send({ sections: [] })).status).toBe(400);
    const r = await http.put(url).set(auth(s)).send(body); expect(r.status).toBe(200);
    expect(r.body.split).toBe(2); expect(r.body.sections).toHaveLength(4); // 1 + 3 pedaços (75 palavras = 29 s → 3 seções de ≤15 s)
    const sc = r.body.sections as { index: number; durationSec: number; referenceImages: string[]; prompt: string; text: string }[];
    expect(sc.map((x) => x.index)).toEqual([0, 1, 2, 3]); for (const x of sc) { expect(x.durationSec).toBeGreaterThanOrEqual(3); expect(x.durationSec).toBeLessThanOrEqual(15); }
    expect(sc[0]!.referenceImages).toEqual([ref]); expect(sc[1]!.referenceImages).toEqual([ref2]); expect(sc[3]!.referenceImages).toEqual([ref2]); // a divisão mantém a foto
    expect(parseMotion(sc[0]!.prompt).motion).toBe('zoom_in'); expect(parseMotion(sc[2]!.prompt)).toMatchObject({ motion: 'pan_right', action: 'passeia pela foto' });
    const again = await http.put(url).set(auth(s)).send({ sections: [body.sections[0]!] }); expect(again.status).toBe(200); expect(again.body.sections).toHaveLength(1); // regravar substitui
    const get = await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s)); expect(get.body.scenes).toHaveLength(1);
  });

  it('montagem: a foto da seção se move de verdade (quadros mudam) e o vídeo tem áudio', async () => {
    await flag(true);
    const ref = await uploadPhoto(s);
    const c = await http.post('/api/v1/projects').set(auth(s)).send({ title: 'Movimento', script: 'Teste de movimento.', locale: 'pt-BR', photos: [ref] }); expect(c.status).toBe(201);
    const r = await http.put(`/api/v1/projects/${c.body.id}/sections`).set(auth(s)).send({ sections: [{ text: 'Veja o produto de perto agora mesmo.', action: 'zoom', photoIndex: 0, motion: 'zoom_in' }] }); expect(r.status).toBe(200);
    const sid = r.body.sections[0].id as string;
    expect((await http.post(`/api/v1/projects/${c.body.id}/scenes/${sid}/generate`).set(auth(s)).send({})).status).toBe(202);
    await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.scenes.every((y: { status: string }) => y.status === 'done') ? x : undefined; }, 60_000);
    expect((await http.post(`/api/v1/projects/${c.body.id}/assemble`).set(auth(s)).send({})).status).toBe(202);
    const ready = await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.status === 'ready' || x.status === 'failed' ? x : undefined; }, 120_000);
    expect(ready.status).toBe('ready');
    const key = (await pool.query<{ final_video_url: string }>('SELECT final_video_url FROM projects WHERE id=$1', [c.body.id])).rows[0]!.final_video_url; const l = refLocation(key);
    const f = join(dir, 'final.mp4'); writeFileSync(f, await storage.get(l.bucket, l.key));
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f]).stdout.toString(); expect(probe).toContain('audio'); expect(probe).toContain('video');
    // primeiro e último quadro diferem: zoom de verdade (uma foto parada geraria quadros idênticos)
    const hash = (t: string) => spawnSync('ffmpeg', ['-v', 'error', '-ss', t, '-i', f, '-frames:v', '1', '-vf', 'scale=36:64,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 20 }).stdout;
    const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.toString());
    expect(Buffer.compare(hash('0.2'), hash(String(Math.max(0.5, dur - 0.5))))).not.toBe(0);
  }, 240_000);
  it('administrador gera sem gastar crédito; usuário comum sem crédito leva 402', async () => {
    await flag(true);
    for (const [admin, esperado] of [[true, 202], [false, 402]] as const) {
      const u = await signup({ plan: 'free', credits: 0, admin });
      const ref = await uploadPhoto(u);
      const c = await http.post('/api/v1/projects').set(auth(u)).send({ title: 'Crédito', script: 'Teste.', locale: 'pt-BR', photos: [ref] }); expect(c.status).toBe(201);
      const r = await http.put(`/api/v1/projects/${c.body.id}/sections`).set(auth(u)).send({ sections: [{ text: 'Uma frase curta para testar.', action: '', photoIndex: 0, motion: 'zoom_in' }] }); expect(r.status).toBe(200);
      const g = await http.post(`/api/v1/projects/${c.body.id}/scenes/${r.body.sections[0].id}/generate`).set(auth(u)).send({}); expect(g.status).toBe(esperado);
      if (admin) { await waitFor(async () => (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(u))).body.scenes[0].status === 'done' ? true : undefined, 60_000); expect((await pool.query<{ credits: number }>('SELECT credits FROM users WHERE id=$1', [u.id])).rows[0]!.credits).toBe(0); }
    }
  }, 120_000);

  it('limite: 20 seções de 15 s viram um único vídeo de até 5 min com áudio; a 21ª é recusada', async () => {
    await flag(true);
    const ref = await uploadPhoto(s);
    const c = await http.post('/api/v1/projects').set(auth(s)).send({ title: 'Cinco minutos', script: 'Teste.', locale: 'pt-BR', photos: [ref] }); expect(c.status).toBe(201);
    const fala = Array.from({ length: 38 }, (_, i) => `palavra${i}`).join(' ') + '.'; // ~15 s de fala
    const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ text: fala, action: '', photoIndex: 0, motion: (['zoom_in', 'zoom_out', 'pan_left', 'pan_right'] as const)[i % 4] }));
    expect((await http.put(`/api/v1/projects/${c.body.id}/sections`).set(auth(s)).send({ sections: mk(21) })).status).toBe(400);
    const r = await http.put(`/api/v1/projects/${c.body.id}/sections`).set(auth(s)).send({ sections: mk(20) }); expect(r.status).toBe(200); expect(r.body.sections).toHaveLength(20);
    for (const sec of r.body.sections as { id: string }[]) { // a cena N usa o último quadro da N-1: uma de cada vez
      expect((await http.post(`/api/v1/projects/${c.body.id}/scenes/${sec.id}/generate`).set(auth(s)).send({})).status).toBe(202);
      await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.scenes.find((y: { id: string }) => y.id === sec.id)?.status === 'done' ? x : undefined; }, 60_000);
    }
    expect((await http.post(`/api/v1/projects/${c.body.id}/assemble`).set(auth(s)).send({})).status).toBe(202);
    const ready = await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.status === 'ready' || x.status === 'failed' ? x : undefined; }, 540_000);
    expect(ready.status).toBe('ready');
    const key = (await pool.query<{ final_video_url: string }>('SELECT final_video_url FROM projects WHERE id=$1', [c.body.id])).rows[0]!.final_video_url; const l = refLocation(key);
    const f = join(dir, 'cinco.mp4'); writeFileSync(f, await storage.get(l.bucket, l.key));
    const dur = Number(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout.toString());
    expect(dur).toBeGreaterThan(30); expect(dur).toBeLessThanOrEqual(300.5); // cada seção dura a própria fala (limitada a 15 s), nunca passa de 5 min
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', f]).stdout.toString(); expect(probe).toContain('audio'); expect(probe).toContain('video');
    const vol = spawnSync('ffmpeg', ['-v', 'info', '-i', f, '-af', 'volumedetect', '-vn', '-f', 'null', '-'], { encoding: 'utf8' }).stderr.match(/mean_volume: (-?[\d.]+) dB/); expect(Number(vol?.[1])).toBeGreaterThan(-60);
  }, 720_000);
});

import { mapArgs, humanPrompt } from '../src/providers/ai/humanMotion.js';
describe('movimento humano (mapeamento da API do Space)', () => {
  it('mapeia imagem, prompt e duração; ignora negativo e usa padrões', () => {
    const a = mapArgs([{ parameter_name: 'input_image', component: 'image' }, { parameter_name: 'prompt', component: 'textbox' }, { parameter_name: 'negative_prompt', component: 'textbox', parameter_has_default: true, parameter_default: 'ruim' }, { parameter_name: 'duration_seconds', component: 'slider' }, { parameter_name: 'steps', component: 'slider', parameter_has_default: true, parameter_default: 6 }], 'IMG', 'P', 9);
    expect(a).toEqual(['IMG', 'P', 'ruim', 5, 6]);
    expect(mapArgs([{ parameter_name: 'x', component: 'textbox' }], 'IMG', 'P', 3)).toBeNull();
  });
  it('o texto pede movimento humano e inclui a ação e a fala', () => {
    const t = humanPrompt('ele pula de alegria e troca a camisa para vermelha', 'Olá, pessoal');
    expect(t).toMatch(/pula de alegria/); expect(t).toMatch(/Olá, pessoal/); expect(t).toMatch(/blinking/);
  });
});

describe('rosto falando (SadTalker): áudio e ajustes', () => {
  it('põe foto e áudio nos lugares certos e aplica preprocess=full / expressão', () => {
    const a = mapArgs([{ parameter_name: 'source_image', component: 'image' }, { parameter_name: 'driven_audio', component: 'audio' }, { parameter_name: 'preprocess', component: 'dropdown', parameter_default: 'crop' }, { parameter_name: 'expression_scale', component: 'slider', parameter_default: 1 }, { parameter_name: 'still_mode', component: 'checkbox', parameter_default: false }], 'IMG', '', 0, { audio: 'AUD', overrides: { preprocess: 'full', expression_scale: 1.3 } });
    expect(a).toEqual(['IMG', 'AUD', 'full', 1.3, false]);
  });
});

import { meanVolumeDb } from '../src/utils/ffmpeg.js';
import { kokoroModel } from '../src/providers/ai/voices.js';
describe('trava de som', () => {
  it('mede áudio mudo e áudio com voz/tom', async () => {
    const d = mkdtempSync(join(tmpdir(), 'vol-')); const mudo = join(d, 'm.wav'), tom = join(d, 't.wav');
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=22050:cl=mono', '-t', '1', mudo]);
    spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=22050', '-t', '1', tom]);
    expect(await meanVolumeDb(mudo)).toBeLessThan(-50); expect(await meanVolumeDb(tom)).toBeGreaterThan(-30); expect(await meanVolumeDb(join(d, 'nao-existe.wav'))).toBe(-Infinity);
    rmSync(d, { recursive: true, force: true });
  });
  it('usa o modelo completo de voz quando existe ao lado do reduzido', () => { expect(typeof kokoroModel()).toBe('string'); });
});

import { OpenTts } from '../src/providers/ai/openVoice.js';
import { resolveVoice } from '../src/providers/ai/voices.js';
import { env } from '../src/config/env.js';
describe('voz neural (Edge) opcional com reserva', () => {
  const e = env as unknown as Record<string, string>; const old = { t: e.EDGE_TTS, s: e.EDGE_SCRIPT, p: e.EDGE_PYTHON };
  afterAll(() => { e.EDGE_TTS = old.t!; e.EDGE_SCRIPT = old.s!; e.EDGE_PYTHON = old.p!; });
  it('desligada: não aparece e a voz padrão continua local', () => { e.EDGE_TTS = '0'; expect(resolveVoice('pt-BR', 'female')?.engine).not.toBe('edge'); });
  it('ligada: Francisca é a padrão e devolve MP3; se o serviço falhar, cai para voz local sem erro', async () => {
    const d = mkdtempSync(join(tmpdir(), 'edge-')); const ok = join(d, 'ok.py'), bad = join(d, 'bad.py');
    writeFileSync(ok, "import sys,subprocess\nsubprocess.run(['ffmpeg','-y','-loglevel','error','-f','lavfi','-i','sine=frequency=300','-t','1',sys.argv[2]],check=True)\n");
    writeFileSync(bad, 'import sys\nsys.exit(3)\n');
    e.EDGE_TTS = '1'; e.EDGE_PYTHON = 'python3'; e.EDGE_SCRIPT = ok;
    expect(resolveVoice('pt-BR', 'female')?.id).toBe('edge:pt-BR-FranciscaNeural');
    const r = await new OpenTts().synthesize('Olá, tudo bem?', 'pt-BR', { gender: 'female' }); expect(r.ext).toBe('mp3'); expect(r.voice).toBe('edge:pt-BR-FranciscaNeural'); expect(r.audio.length).toBeGreaterThan(500);
    e.EDGE_SCRIPT = bad;
    const kokoroOrPiper = resolveVoice('pt-BR', 'female', 'kokoro:pf_dora'); // pode não existir no CI; então só garantimos que NÃO lança quando há voz local
    if (kokoroOrPiper && kokoroOrPiper.engine !== 'edge') { const r2 = await new OpenTts().synthesize('Olá.', 'pt-BR', { gender: 'female' }); expect(r2.voice).not.toMatch(/^edge:/); }
    rmSync(d, { recursive: true, force: true });
  });
});
