import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { boot, shutdown, http, signup, auth, uploadPhoto, waitFor, pool, type Session } from './helpers.js';
import { env, type Env } from '../src/config/env.js';
import { EspeakTts, PiperTts } from '../src/providers/ai/openVoice.js';
import { synthesizeSpeech } from '../src/providers/ai/router.js';
import { speechCues } from '../src/providers/ai/heuristics.js';
import { storage, refLocation } from '../src/providers/storage.js';
import { withTmp, ffprobeDuration } from '../src/utils/ffmpeg.js';
import { detectVoice, extractAudio, rmsFrames } from '../src/modules/audio/analysis.js';

/**
 * Instalação gratuita: voz aberta (espeak-ng; Piper quando o modelo estiver instalado) narrando as cenas, com a duração de
 * cada cena ajustada à fala e legendas cronometradas pela voz. espeak-ng é testado de verdade aqui; o modelo do Piper vem
 * do Hugging Face no build do Docker (bloqueado neste ambiente): aqui só o caminho "modelo ausente → voz reserva".
 */
const saved: Partial<Env> = {};
const set = (o: Partial<Env>) => { for (const [k, v] of Object.entries(o)) { (saved as Record<string, unknown>)[k] ??= (env as Record<string, unknown>)[k]; (env as Record<string, unknown>)[k] = v; } };
let s: Session;
beforeAll(async () => { await boot(); s = await signup({ plan: 'pro', credits: 60 }); });
afterAll(async () => { for (const [k, v] of Object.entries(saved)) (env as Record<string, unknown>)[k] = v; await shutdown(); });

describe('voz aberta', () => {
  it('espeak-ng fala de verdade em pt-BR, en e es (dinâmica de fala, não um tom)', async () => {
    for (const [loc, txt] of [['pt-BR', 'Bicicleta elétrica com bateria que dura o dia todo.'], ['en', 'An electric bike with an all day battery.'], ['es', 'Una bicicleta eléctrica con batería para todo el día.']] as const) {
      const r = await new EspeakTts().synthesize(txt, loc, { gender: 'female' });
      expect(r.ext).toBe('wav'); expect(r.usage.costCents).toBe(0);
      const v = await withTmp(async (d) => { const f = join(d, 'a.wav'); await writeFile(f, r.audio); return detectVoice(f); });
      // fala varia de volume (sílabas/pausas); o tom do mock é constante (modulação 0 dB, SNR 0). O detector de voz natural
      // (feito para pessoas falando) é exigido no vídeo narrado completo, abaixo.
      expect(v.durationSec).toBeGreaterThan(1.5); expect(v.modulationDb, `${loc}: ${JSON.stringify(v)}`).toBeGreaterThan(3); expect(v.snrDb).toBeGreaterThan(20);
    }
  });

  it('Piper sem modelo instalado falha com mensagem clara e o roteador cai para a voz reserva (espeak)', async () => {
    set({ PIPER_VOICES_DIR: '/nao/existe' });
    await expect(new PiperTts().synthesize('oi', 'pt-BR', { gender: 'female' })).rejects.toThrow(/modelo de voz ausente/);
    set({ AI_TTS_PROVIDER: 'piper', AI_TTS_FALLBACK: 'espeak' });
    const r = await synthesizeSpeech('Teste de voz reserva.', 'pt-BR', { gender: 'male' }, { userId: s.id });
    expect(r.ext).toBe('wav'); expect(r.audio.length).toBeGreaterThan(5000);
    set({ AI_TTS_PROVIDER: 'mock', AI_TTS_FALLBACK: 'mock' });
  });

  it('legenda em trechos curtos, contínuos, somando a duração da fala', () => {
    const cues = speechCues('Uma bicicleta elétrica urbana com design leve, bateria de longa duração e conforto no trânsito.', 10, 6);
    expect(cues.length).toBeGreaterThan(1); for (const c of cues) expect(c.text.length).toBeLessThanOrEqual(42);
    expect(cues[0]!.start).toBe(10); expect(cues.at(-1)!.end).toBeCloseTo(16, 5);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.start).toBeCloseTo(cues[i - 1]!.end, 9);
  });
});

describe('montagem narrada (AI_TTS_PROVIDER=espeak)', () => {
  it('vídeo final com narração: cada cena dura a fala, legendas dentro da janela de fala de cada cena e voz presente nelas', async () => {
    set({ AI_TTS_PROVIDER: 'espeak', AI_TTS_FALLBACK: 'espeak' });
    try {
      const ref = await uploadPhoto(s);
      const script = 'Conheça a nova bicicleta elétrica urbana. A bateria dura o dia inteiro. O quadro é leve e resistente. Peça a sua hoje mesmo.';
      const c = await http.post('/api/v1/projects').set(auth(s)).send({ title: 'Narrado', script, locale: 'pt-BR', photos: [ref] }); expect(c.status).toBe(201);
      await http.post(`/api/v1/projects/${c.body.id}/storyboard`).set(auth(s)).send({});
      const p = await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.scenes?.length ? x : undefined; });
      await http.post(`/api/v1/projects/${c.body.id}/scenes/${p.scenes[0].id}/generate`).set(auth(s)).send({ chain: true });
      await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.scenes.every((y: { status: string }) => y.status === 'done') ? x : undefined; }, 120_000);
      expect((await http.post(`/api/v1/projects/${c.body.id}/assemble`).set(auth(s)).send({})).status).toBe(202);
      const ready = await waitFor(async () => { const x = (await http.get(`/api/v1/projects/${c.body.id}`).set(auth(s))).body; return x.status === 'ready' ? x : undefined; }, 180_000);
      const row = (await pool.query<{ final_video_url: string }>('SELECT final_video_url FROM projects WHERE id=$1', [ready.id])).rows[0]!;
      const vttKey = row.final_video_url.replace(/\.mp4$/, '.vtt'); // gravado ao lado (mesmo carimbo)
      const vttRef = (await storage.exists('videos', vttKey)) ? vttKey : null;
      await withTmp(async (d) => {
        const mp4 = join(d, 'f.mp4'); const l = refLocation(row.final_video_url); await writeFile(mp4, await storage.get(l.bucket, l.key));
        const total = await ffprobeDuration(mp4); const wav = await extractAudio(mp4, d); expect(wav, 'o vídeo final tem áudio').toBeTruthy();
        const voice = await detectVoice(wav!); expect(voice.hasVoice, JSON.stringify(voice)).toBe(true);
        expect(total).toBeGreaterThan(p.scenes.length * 1.5); // cenas do tamanho da fala, não 2 s fixos
        const vtt = vttRef ? (await storage.get('videos', vttRef)).toString() : '';
        const cues = [...vtt.matchAll(/(\d\d):(\d\d):(\d\d\.\d{3}) --> (\d\d):(\d\d):(\d\d\.\d{3})\n(.+)/g)].map((m) => ({ s: +m[1]! * 3600 + +m[2]! * 60 + +m[3]!, e: +m[4]! * 3600 + +m[5]! * 60 + +m[6]!, t: m[7]! }));
        expect(cues.length).toBeGreaterThanOrEqual(p.scenes.length); expect(cues.at(-1)!.e).toBeLessThanOrEqual(total + 0.05);
        // dentro das legendas há voz; o texto das legendas é o roteiro
        const fr = await rmsFrames(wav!); const at = (t: number) => fr[Math.min(fr.length - 1, Math.floor((t * 1000) / 50))] ?? -120;
        const inCue = cues.map((q) => Math.max(...Array.from({ length: 8 }, (_, k) => at(q.s + ((q.e - q.s) * k) / 8))));
        expect(inCue.filter((db) => db > -35).length / cues.length).toBeGreaterThan(0.9);
        expect(cues.map((q) => q.t).join(' ').replace(/\s+/g, ' ')).toContain('bateria dura o dia inteiro');
      });
      const usage = (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ai_usage WHERE project_id=$1 AND operation='tts_narration' AND provider='espeak' AND cost_cents=0`, [ready.id])).rows[0]!;
      expect(usage.n).toBe(p.scenes.length);
    } finally { set({ AI_TTS_PROVIDER: 'mock', AI_TTS_FALLBACK: 'mock' }); }
  }, 300_000);
});
