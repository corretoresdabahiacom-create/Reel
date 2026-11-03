import { join } from 'node:path';
import { env } from '../../config/env.js';
import { pool } from '../../db/pool.js';
import { systemScope } from '../../db/context.js';
import { redis } from '../../db/redis.js';
import { logger } from '../../observability/logger.js';
import { m } from '../../observability/metrics.js';
import { sceneCache, pickVideoProvider, costGuard, rateLimitedMinute } from '../../modules/cost-optimization/index.js';
import { c2paAssertion } from '../../modules/compliance/aiDisclosure.js';
import { span } from '../../observability/tracing.js';
import { storage, refLocation } from '../storage.js';
import { ffmpeg, ffprobeDuration, meanVolumeDb, withTmp, writeFile, readFile } from '../../utils/ffmpeg.js';
import { AppError } from '../../utils/errors.js';
import { heuristicStoryboard, mockTranslate, toVtt, speechCues, cuesToVtt, type Cue } from './heuristics.js';
import { motionFilter, MOTION_FPS } from './motion.js';
import { humanMotionClip, talkingClip } from './humanMotion.js';
import { EspeakTts, PiperTts, KokoroTts, OpenTts, narrationEnabled } from './openVoice.js';
import { alignScenes, wordsToCues, type TimedWord } from './narration.js';
import { transcribeAudio } from '../../modules/transcript/stt.js';
import { MockModeration, MockTts, MockVideo } from './mock.js';
import { KlingVideo } from './kling.js';
import { ElevenLabsTts } from './elevenlabs.js';
import { OpenAIModeration } from './openaiModeration.js';
import type { AIProvider, ModerationProvider, SceneInput, SceneResult, TtsProvider, Usage, VideoProvider } from './types.js';

const video: Record<string, VideoProvider> = { mock: new MockVideo(), kling: new KlingVideo() };
const tts: Record<string, TtsProvider> = { mock: new MockTts(), elevenlabs: new ElevenLabsTts(), espeak: new EspeakTts(), piper: new PiperTts(), kokoro: new KokoroTts(), open: new OpenTts() };
const mod: Record<string, ModerationProvider> = { mock: new MockModeration(), openai: new OpenAIModeration() };

/** Circuit breaker em Redis (compartilhado entre workers): 3 falhas em 5 min abrem o circuito por 10 min → usa o provedor B. */
const FAIL_N = 3, FAIL_WINDOW = 300, OPEN_SEC = 600;
export const breakerOpen = async (p: string) => (await redis.exists(`cb:open:${p}`)) === 1;
async function recordFailure(p: string): Promise<void> {
  m.aiFailures.inc({ provider: p }); const k = `cb:fail:${p}`; const n = await redis.incr(k); if (n === 1) await redis.expire(k, FAIL_WINDOW);
  if (n >= FAIL_N) { await redis.set(`cb:open:${p}`, '1', 'EX', OPEN_SEC); logger.warn({ provider: p }, 'circuit breaker de IA aberto'); }
}
const recordOk = (p: string) => redis.del(`cb:fail:${p}`).catch(() => undefined);
/** Breaker compartilhado para provedores externos que não são de IA (Módulo 5: nuvens do usuário). Só falhas temporárias devem contar. */
export { recordFailure as recordProviderFailure, recordOk as recordProviderOk };

export async function recordUsage(u: Usage & { userId?: string; projectId?: string; status?: string }): Promise<void> {
  m.aiDuration.observe({ provider: u.provider, operation: u.operation }, u.latencyMs); if (u.costCents) m.aiCost.inc({ provider: u.provider, operation: u.operation }, u.costCents);
  // RLS: contabilidade de custo é pipeline interno e o total do dia é agregado de TODOS os usuários (guardrail) → system explícito
  const day = await systemScope('ai_usage: contabilidade de custo + total diário global do guardrail', async () => {
    await pool.query('INSERT INTO ai_usage (user_id, project_id, provider, operation, cost_cents, latency_ms, status) VALUES ($1,$2,$3,$4,$5,$6,$7)', [u.userId ?? null, u.projectId ?? null, u.provider, u.operation, u.costCents, u.latencyMs, u.status ?? 'ok']);
    return Number((await pool.query<{ s: number }>(`SELECT COALESCE(SUM(cost_cents),0) AS s FROM ai_usage WHERE created_at > date_trunc('day', now())`)).rows[0].s);
  });
  if (u.costCents && (await rateLimitedMinute('eval').catch(() => false))) void costGuard.evaluate().catch(() => undefined);
  if (day > env.AI_DAILY_COST_ALERT_CENTS) logger.warn({ dailyCostCents: day, threshold: env.AI_DAILY_COST_ALERT_CENTS }, 'ALERTA: custo diário de IA acima do limite');
}
/** Limite diário de custo de IA por plano (controle de custo). */
export async function assertBudget(userId: string, plan: string): Promise<void> {
  const lim = { free: env.AI_COST_LIMIT_FREE_CENTS, pro: env.AI_COST_LIMIT_PRO_CENTS, business: env.AI_COST_LIMIT_BUSINESS_CENTS }[plan] ?? env.AI_COST_LIMIT_FREE_CENTS;
  const s = Number((await pool.query<{ s: number }>(`SELECT COALESCE(SUM(cost_cents),0) AS s FROM ai_usage WHERE user_id=$1 AND created_at > date_trunc('day', now())`, [userId])).rows[0].s);
  if (s >= lim) throw new AppError(402, 'ai_budget_exceeded', 'Limite diário de custo de IA do plano atingido');
}
/** Provedor primário → secundário com circuit breaker compartilhado (R14). Exportado para os módulos pós-lançamento (áudio etc.). */
export async function viaFallback<T>(kind: string, primary: string, fallback: string, call: (name: string) => Promise<T>): Promise<T> {
  const order = (await breakerOpen(primary)) ? [fallback] : primary === fallback ? [primary] : [primary, fallback];
  let last: unknown;
  for (const name of order) {
    try { const r = await call(name); await recordOk(name); return r; } catch (e) { last = e; logger.warn({ provider: name, kind, err: (e as Error).message }, 'provedor de IA falhou'); await recordFailure(name); }
  }
  throw last instanceof Error ? last : new Error('todos os provedores falharam');
}

/** TTS avulso (Módulo 9: substituir palavra pela transcrição). Mesmo breaker/fallback do dublador; grava ai_usage. */
export async function synthesizeSpeech(text: string, locale: string, voice: { gender: 'male' | 'female' | 'neutral'; voiceId?: string }, ctx: { userId: string; projectId?: string }): Promise<{ audio: Buffer; ext: string; voice: string }> {
  const t = await viaFallback('tts', env.AI_TTS_PROVIDER, env.AI_TTS_FALLBACK, (n) => tts[n]!.synthesize(text, locale, voice));
  await recordUsage({ ...t.usage, operation: 'tts_inline', userId: ctx.userId, projectId: ctx.projectId }); return { audio: t.audio, ext: t.ext, voice: t.voice };
}
const ai: AIProvider = {
  async generateStoryboard(script, photoKeys, ctx) { return heuristicStoryboard(script, photoKeys.length, ctx); },
  async generateScene(scene: SceneInput, previous, ctx): Promise<SceneResult> {
    await assertBudget(ctx.userId, ctx.plan);
    // Fase 8: cache de cena (mesmos inputs => reuso sem custo) e roteamento por custo/qualidade — ambos atrás de flags (padrão: desligadas).
    const hit = await sceneCache.lookup(scene, previous?.lastFrameKey).catch(() => null);
    if (hit) { await recordUsage({ ...hit.usage, userId: ctx.userId, projectId: scene.projectId }); return hit; }
    const primary = await pickVideoProvider(scene, env.AI_VIDEO_PROVIDER, breakerOpen).catch(() => env.AI_VIDEO_PROVIDER);
    return span('ai.generateScene', { provider: primary, scene: scene.index }, async () => {
      const r = await viaFallback('video', primary, env.AI_VIDEO_FALLBACK, (n) => video[n]!.generateScene(scene, previous, { userId: ctx.userId }));
      await recordUsage({ ...r.usage, userId: ctx.userId, projectId: scene.projectId }); await sceneCache.store(scene, r, previous?.lastFrameKey).catch(() => undefined); return r;
    });
  },
  generateSubtitles: (scenes, locale) => toVtt(scenes.map((s) => ({ ...s, text: mockTranslate(s.text, locale) }))),
  async assembleVideo(scenes, opts) {
    return span('ai.assemble', { project: opts.projectId }, async () => withTmp(async (dir) => {
      const files: string[] = [];
      for (let i = 0; i < scenes.length; i++) { const f = join(dir, `s${i}.mp4`); const l = refLocation(scenes[i]!.videoKey); await writeFile(f, await storage.get(l.bucket, l.key)); files.push(f); }
      const out = join(dir, 'final.mp4'); let inputs = files.flatMap((f) => ['-i', f]);
      const disclosureFx = opts.disclosure?.visible ? `,drawtext=text='${opts.disclosure.label.replace(/[^\p{L}\p{N} ]/gu, '')}':x=w-tw-8:y=8:fontsize=12:fontcolor=white@0.85:box=1:boxcolor=black@0.45:boxborderw=4` : '';
      let vtt: string;
      if (narrationEnabled() || opts.audio) {
        // Narração real (voz aberta escolhida, ou a GRAVADA pelo usuário) + música de verdade com ducking.
        // Cada cena dura a sua fala (+ respiro; o último quadro fica parado se a fala for maior); legendas pela fala real.
        const locale = opts.locale ?? 'pt-BR'; const mode = opts.audio?.narration.mode ?? 'tts';
        const segs: { dur: number }[] = []; let cues: Cue[] = []; let narration: string | null = null; let sceneWav: string[] = []; // áudio de cada seção (para a boca acompanhar a fala)
        if (mode === 'recorded' && opts.audio?.narration.recordingRef) {
          const rec = join(dir, 'rec.wav'); const l = refLocation(opts.audio.narration.recordingRef); const raw = join(dir, 'rec.in'); await writeFile(raw, await storage.get(l.bucket, l.key));
          await ffmpeg(['-i', raw, '-ac', '1', '-ar', '22050', rec]); const R = await ffprobeDuration(rec);
          let words: TimedWord[] = [];
          try { words = (await transcribeAudio(rec, [{ index: 0, startMs: 0, endMs: Math.round(R * 1000), text: '' }], locale)).words.map((w) => ({ w: w.w, start: w.start / 1000, end: w.end / 1000 })); } catch { words = []; } // sem transcrição: divisão proporcional
          const starts = alignScenes(words, scenes.map((x) => x.text), R);
          starts.forEach((st, i) => { const next = i + 1 < starts.length ? starts[i + 1]! : R + 0.35; segs.push({ dur: Math.max(1, Math.round((next - st) * 100) / 100) }); });
          cues = words.length ? wordsToCues(words) : scenes.flatMap((x, i) => speechCues(x.text, starts[i]!, Math.max(0.5, segs[i]!.dur - 0.2)));
          for (let i = 0; i < starts.length; i++) { const sw = join(dir, `sw${i}.wav`); try { await ffmpeg(['-ss', String(starts[i]), '-t', String(segs[i]!.dur), '-i', rec, '-ar', '16000', '-ac', '1', sw]); sceneWav[i] = sw; } catch { /* sem trecho: só câmera */ } }
          narration = rec; await recordUsage({ provider: 'recording', operation: 'narration_recorded', costCents: 0, latencyMs: 0, projectId: opts.projectId });
        } else if (mode === 'none') {
          let t = 0; for (const x of scenes) { const d = Math.max(2, Math.min(4, x.durationSec)); cues.push(...speechCues(x.text, t + 0.1, d - 0.2)); segs.push({ dur: d }); t += d; }
        } else {
          const wavs: string[] = []; sceneWav = wavs; let t = 0;
          for (const [i, x] of scenes.entries()) {
            const r = await viaFallback('tts', env.AI_TTS_PROVIDER, env.AI_TTS_FALLBACK, (n) => tts[n]!.synthesize(x.text, locale, { gender: opts.voiceGender ?? 'female', voiceId: opts.audio?.narration.voiceId }));
            await recordUsage({ ...r.usage, operation: 'tts_narration', projectId: opts.projectId });
            let wav = join(dir, `n${i}.${r.ext}`); await writeFile(wav, r.audio);
            if ((await meanVolumeDb(wav)) < -50) { // voz muda/inaudível (modelo quebrado, arquivo vazio): tenta a voz reserva antes de entregar um vídeo sem som
              try { const alt = await tts.espeak!.synthesize(x.text, locale, { gender: opts.voiceGender ?? 'female' }); const w2 = join(dir, `n${i}b.${alt.ext}`); await writeFile(w2, alt.audio); if ((await meanVolumeDb(w2)) > -50) { wav = w2; logger.warn({ scene: i }, 'tts_silencioso_usou_reserva'); } } catch { /* mantém */ }
            }
            wavs.push(wav);
            const speech = await ffprobeDuration(wav); const dur = Math.max(1.5, Math.round((speech + 0.35) * 100) / 100);
            cues.push(...speechCues(x.text, t + 0.1, Math.max(0.5, speech))); segs.push({ dur }); t += dur;
          }
          narration = join(dir, 'nar.wav');
          await ffmpeg([...wavs.flatMap((w) => ['-i', w]), '-filter_complex', segs.map((g, i) => `[${i}:a]aresample=22050,aformat=channel_layouts=mono,apad=whole_dur=${g.dur}[a${i}]`).join(';') + ';' + segs.map((_, i) => `[a${i}]`).join('') + `concat=n=${segs.length}:v=0:a=1[o]`, '-map', '[o]', narration]);
        }
        // Seções (ff_sections): a foto escolhida se move DE VERDADE durante toda a fala da seção (zoom/pan); sem foto ou se falhar, fica o clipe da cena.
        let moved = false;
        const aiKind = (x: (typeof scenes)[number], i: number) => (x.motion === 'talk' && !!x.photoKey && !!env.HF_TALK_SPACE && !!sceneWav[i] ? 'talk' : x.motion === 'human' && !!x.photoKey && !!env.HF_VIDEO_SPACE ? 'human' : null);
        // rostos falando / pessoas se movendo: todas as seções AO MESMO TEMPO (cada uma pode levar minutos); falhou → null → câmera
        const aiClips = scenes.map(async (x, i) => { const k = aiKind(x, i); if (!k) return null; try { const l = refLocation(x.photoKey!); const ph = await storage.get(l.bucket, l.key); return k === 'talk' ? await talkingClip(ph, await readFile(sceneWav[i]!)) : await humanMotionClip(ph, x.action ?? '', x.text, Math.min(5, segs[i]!.dur)); } catch { return null; } });
        for (const [i, x] of scenes.entries()) {
          const talk = x.motion === 'talk' && !!x.photoKey && !!env.HF_TALK_SPACE && !!sceneWav[i];
          const human = x.motion === 'human' && !!x.photoKey && !!env.HF_VIDEO_SPACE;
          const vfm = x.photoKey && x.motion ? motionFilter(human || talk || x.motion === 'talk' ? 'zoom_in' : x.motion, segs[i]!.dur) : null; if (!vfm) continue;
          try { const l = refLocation(x.photoKey!); const img = join(dir, `p${i}.img`), mf = join(dir, `m${i}.mp4`); const photo = await storage.get(l.bucket, l.key); await writeFile(img, photo);
            if (talk) { // rosto falando com a narração da seção (boca sincronizada); o vídeo já tem a duração da fala
              const tv = await aiClips[i]; const tin = join(dir, `t${i}.mp4`);
              if (tv) { await writeFile(tin, tv); await ffmpeg(['-i', tin, '-vf', `scale=360:640:force_original_aspect_ratio=increase,crop=360:640,fps=${MOTION_FPS},tpad=stop_mode=clone:stop_duration=${segs[i]!.dur},trim=duration=${segs[i]!.dur},setpts=PTS-STARTPTS,format=yuv420p`, '-c:v', 'libx264', '-preset', 'ultrafast', '-an', mf]); files[i] = mf; moved = true; continue; }
            }
            if (human) { // pessoa se mexendo (modelo aberto); o clipe curto vai em vai-e-vem até cobrir a fala. Falhou → câmera.
              const hv = await aiClips[i]; const hin = join(dir, `h${i}.mp4`);
              if (hv) { await writeFile(hin, hv); await ffmpeg(['-i', hin, '-filter_complex', `[0:v]scale=360:640:force_original_aspect_ratio=increase,crop=360:640,fps=${MOTION_FPS},split[a][b];[b]reverse[r];[a][r]concat=n=2:v=1:a=0,loop=loop=-1:size=400,trim=duration=${segs[i]!.dur},setpts=PTS-STARTPTS,format=yuv420p[v]`, '-map', '[v]', '-c:v', 'libx264', '-preset', 'ultrafast', '-an', mf]); files[i] = mf; moved = true; continue; }
            }
            await ffmpeg(['-i', img, '-vf', vfm, '-r', String(MOTION_FPS), '-c:v', 'libx264', '-preset', 'ultrafast', '-an', mf]); files[i] = mf; moved = true; } catch { /* mantém o clipe da cena */ }
        }
        if (moved) inputs = files.flatMap((f) => ['-i', f]);
        vtt = cuesToVtt(cues); const srt = join(dir, 's.srt'); await writeFile(srt, vtt.replace(/^WEBVTT\n\n/, '').replace(/(\d\d:\d\d:\d\d)\.(\d{3})/g, '$1,$2'));
        const n = files.length; const total = Math.round(segs.reduce((a, g) => a + g.dur, 0) * 100) / 100;
        const vf = segs.map((g, i) => `[${i}:v]fps=12,scale=360:640,setsar=1,tpad=stop_mode=clone:stop_duration=${g.dur},trim=duration=${g.dur},setpts=PTS-STARTPTS[v${i}]`).join(';') + ';' + segs.map((_, i) => `[v${i}]`).join('') + `concat=n=${n}:v=1:a=0[v]`;
        // áudio: narração (ou silêncio) + música escolhida em loop com fade e ducking; sem escolha do estúdio, o tom de sempre
        const audioIns: string[] = []; let k = n; const nIdx = narration ? k++ : -1; if (narration) audioIns.push('-i', narration);
        let musicFile = opts.audio?.musicRef ? join(dir, 'music.in') : null;
        if (musicFile) { try { const l = refLocation(opts.audio!.musicRef!); await writeFile(musicFile, await storage.get(l.bucket, l.key)); } catch { musicFile = null; /* trilha sumiu do armazenamento: o vídeo sai só com a narração, nunca falha */ } }
        const mIdx = musicFile ? k++ : !opts.audio ? k++ : -1;
        if (musicFile) audioIns.push('-stream_loop', '-1', '-i', musicFile); else if (!opts.audio) audioIns.push('-f', 'lavfi', '-t', String(total), '-i', 'sine=frequency=110:sample_rate=22050');
        const vol = Math.max(0, Math.min(1, opts.audio?.musicVolume ?? 0.35)).toFixed(2);
        const nar = nIdx >= 0 ? `[${nIdx}:a]aresample=44100,aformat=channel_layouts=stereo,apad,atrim=0:${total}[nar]` : '';
        const mus = mIdx >= 0 ? (musicFile ? `[${mIdx}:a]aresample=44100,aformat=channel_layouts=stereo,atrim=0:${total},asetpts=N/SR/TB,volume=${vol},afade=t=out:st=${Math.max(0, total - 1.5).toFixed(2)}:d=1.5[mus]` : `[${mIdx}:a]aresample=44100,aformat=channel_layouts=stereo,volume=0.12[mus]`) : '';
        let af: string;
        if (nar && mus) af = musicFile ? `${nar};${mus};[nar]asplit=2[n1][sc];[mus][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck];[n1][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[ao]` : `${nar};${mus};[nar][mus]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[ao]`;
        else if (nar) af = `${nar};[nar]loudnorm=I=-14:TP=-1.5:LRA=11[ao]`;
        else if (mus) af = `${mus};[mus]loudnorm=I=-14:TP=-1.5:LRA=11[ao]`;
        else af = `anullsrc=r=44100:cl=stereo,atrim=0:${total}[ao]`;
        await ffmpeg([...inputs, ...audioIns, '-filter_complex', `${vf};${af};[v]${opts.audio?.captions === false ? 'null' : `subtitles=${srt.replace(/:/g, '\\:')}:force_style='FontSize=14,Alignment=2'`}${disclosureFx}[vo]`, '-map', '[vo]', '-map', '[ao]', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-metadata', 'comment=ai_generated=true;generator=NexusReel', '-metadata', 'description=Conteudo gerado por inteligencia artificial', '-t', String(total), out], 600_000);
        if (narration && (await meanVolumeDb(out)) < -60) throw new Error('video_sem_som: a narração ficou muda'); // melhor falhar com aviso do que entregar um vídeo calado
      } else {
      const vf = files.map((_, i) => `[${i}:v]fps=12,scale=360:640,setsar=1[v${i}]`).join(';') + ';' + files.map((_, i) => `[v${i}]`).join('') + `concat=n=${files.length}:v=1:a=0[v]`;
      const total = scenes.reduce((a, s) => a + Math.min(2, s.durationSec), 0);
      // trilha (mock: tom grave baixo) + legendas queimadas
      vtt = toVtt(scenes.map((s) => ({ ...s, durationSec: Math.min(2, s.durationSec) }))); const srt = join(dir, 's.srt'); await writeFile(srt, vtt.replace(/^WEBVTT\n\n/, '').replace(/(\d\d:\d\d:\d\d)\.(\d{3})/g, '$1,$2'));
      await ffmpeg([...inputs, '-f', 'lavfi', '-t', String(total), '-i', 'sine=frequency=110:sample_rate=22050', '-filter_complex', `${vf};[v]subtitles=${srt.replace(/:/g, '\\:')}:force_style='FontSize=14,Alignment=2'${opts.disclosure?.visible ? `,drawtext=text='${opts.disclosure.label.replace(/[^\p{L}\p{N} ]/gu, '')}':x=w-tw-8:y=8:fontsize=12:fontcolor=white@0.85:box=1:boxcolor=black@0.45:boxborderw=4` : ''}[vo]`, '-map', '[vo]', '-map', `${files.length}:a`, '-af', 'volume=0.15', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-metadata', 'comment=ai_generated=true;generator=NexusReel', '-metadata', 'description=Conteudo gerado por inteligencia artificial', '-shortest', out]);
      }
      const durationSec = Math.round((await ffprobeDuration(out)) * 100) / 100;
      const stamp = Date.now(); const videoKey = `projects/${opts.projectId}/final-${stamp}.mp4`, subtitlesKey = `projects/${opts.projectId}/final-${stamp}.vtt`; // mesmo carimbo: a legenda fica ao lado do vídeo
      const finalBuf = await readFile(out); await storage.put('videos', videoKey, finalBuf, 'video/mp4'); await storage.put('videos', subtitlesKey, vtt, 'text/vtt');
      await storage.put('videos', videoKey.replace(/\.mp4$/, '.c2pa.json'), JSON.stringify(c2paAssertion(finalBuf, { visible: !!opts.disclosure?.visible })), 'application/json');
      return { videoKey, durationSec, subtitlesKey };
    }));
  },
  async dubVideo(video0, targetLocales, voice) {
    const out: Awaited<ReturnType<AIProvider['dubVideo']>> = [];
    for (const locale of targetLocales) {
      const text = video0.scenes.map((s) => mockTranslate(s.text, locale)).join(' ');
      const t = await viaFallback('tts', env.AI_TTS_PROVIDER, env.AI_TTS_FALLBACK, (n) => tts[n]!.synthesize(text, locale, voice));
      await recordUsage({ ...t.usage, projectId: video0.projectId });
      const base = `projects/${video0.projectId}/dub-${locale}-${Date.now()}`; const audioKey = `${base}.${t.ext}`, videoKey = `${base}.mp4`, subtitlesKey = `${base}.vtt`;
      await withTmp(async (dir) => {
        const vi = join(dir, 'v.mp4'), au = join(dir, 'a.' + t.ext), o = join(dir, 'o.mp4'); const l = refLocation(video0.videoKey);
        await writeFile(vi, await storage.get(l.bucket, l.key)); await writeFile(au, t.audio);
        await ffmpeg(['-i', vi, '-i', au, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-shortest', o]);
        await storage.put('videos', videoKey, await readFile(o), 'video/mp4');
      });
      await storage.put('videos', audioKey, t.audio, t.ext === 'mp3' ? 'audio/mpeg' : 'audio/wav');
      await storage.put('videos', subtitlesKey, ai.generateSubtitles(video0.scenes, locale), 'text/vtt');
      out.push({ locale, videoKey, audioKey, subtitlesKey, voice: t.voice });
    }
    return out;
  },
  async moderateContent(text, imageUrls) {
    const r = await viaFallback('moderation', env.AI_MODERATION_PROVIDER, 'mock', (n) => mod[n]!.moderate(text, imageUrls));
    await recordUsage({ ...r.usage }); return { allowed: r.allowed, categories: r.categories };
  },
};
export const aiProvider: AIProvider = ai;
