import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { storage, RAW_SCENE } from '../storage.js';
import { ffmpeg, withTmp, writeFile } from '../../utils/ffmpeg.js';
import type { ModerationProvider, SceneInput, SceneResult, TtsProvider, VideoProvider } from './types.js';

const hue = (s: string) => parseInt(createHash('md5').update(s).digest('hex').slice(0, 4), 16) % 360;
/** Vídeo mock REAL (FFmpeg): se há frame anterior (chaining) a cena PARTE dele; senão usa a foto de referência ou uma cor determinística. */
export class MockVideo implements VideoProvider {
  name = 'mock';
  async generateScene(scene: SceneInput, previous: { lastFrameKey?: string } | undefined): Promise<SceneResult> {
    // falha determinística para testar retry (como na Fase 2): MOCK_FAIL_SCENE_INDEX=6 falha a cena 7 até ser refeita (retried=true)
    if (process.env.MOCK_FAIL_SCENE_INDEX !== undefined && Number(process.env.MOCK_FAIL_SCENE_INDEX) === scene.index && !scene.retried) throw new Error('falha simulada do provedor (mock)');
    const t0 = Date.now(); const dur = Math.max(1, Math.min(2, scene.durationSec)); // mock curto: 1–2 s por cena
    const srcKey = previous?.lastFrameKey ?? scene.referenceKeys[0];
    const prefix = `projects/${scene.projectId}/scenes/${scene.id}`;
    const videoKey = `${prefix}-${Date.now()}.mp4`, frameKey = `${prefix}-${Date.now()}-last.jpg`;
    await withTmp(async (dir) => {
      const out = join(dir, 'o.mp4'), frame = join(dir, 'f.jpg'); const common = ['-vf', `scale=360:640:force_original_aspect_ratio=increase,crop=360:640,hue=h=${(scene.index * 12) % 360}:s=1.1,format=yuv420p`];
      if (srcKey && await storage.exists(srcKey.startsWith('uploads/') ? 'uploads' : 'videos', srcKey.replace(/^uploads\//, '')).catch(() => false)) {
        const bucket = srcKey.startsWith('uploads/') ? 'uploads' : 'videos'; const inp = join(dir, 'in.jpg'); await writeFile(inp, await storage.get(bucket, srcKey.replace(/^uploads\//, '')));
        await ffmpeg(['-loop', '1', '-t', String(dur), '-i', inp, ...common, '-r', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-an', out]);
      } else {
        await ffmpeg(['-f', 'lavfi', '-t', String(dur), '-i', `color=c=0x6d28d9:s=360x640:r=12`, '-vf', `hue=h=${hue(scene.projectId) + scene.index * 12},format=yuv420p`, '-c:v', 'libx264', '-preset', 'ultrafast', '-an', out]);
      }
      await ffmpeg(['-sseof', '-0.2', '-i', out, '-frames:v', '1', '-q:v', '4', frame]);
      await storage.put('videos', videoKey, await (await import('node:fs/promises')).readFile(out), 'video/mp4', RAW_SCENE);
      await storage.put('videos', frameKey, await (await import('node:fs/promises')).readFile(frame), 'image/jpeg', RAW_SCENE);
    });
    const consistency = Math.round((0.93 + ((scene.index * 7) % 6) / 100) * 100) / 100; // 0.93–0.98 (simulado)
    return { videoKey, lastFrameKey: frameKey, consistency, usage: { provider: 'mock', operation: 'generate_scene', costCents: 0, latencyMs: Date.now() - t0 } };
  }
}
/** TTS mock: tom senoidal (frequência por idioma/gênero) — serve para exercitar o pipeline de mux sem provedor. */
export class MockTts implements TtsProvider {
  name = 'mock';
  async synthesize(text: string, locale: string, voice: { gender: string }) {
    const t0 = Date.now(); const f = { 'pt-BR': 220, en: 262, es: 330 }[locale] ?? 200; const g = voice.gender === 'male' ? 0.8 : voice.gender === 'female' ? 1.25 : 1;
    const secs = Math.min(60, Math.max(1, Math.round(text.length / 14)));
    const audio = await withTmp(async (dir) => { const o = join(dir, 'a.wav'); await ffmpeg(['-f', 'lavfi', '-t', String(secs), '-i', `sine=frequency=${Math.round(f * g)}:sample_rate=22050`, '-ac', '1', o]); return (await import('node:fs/promises')).readFile(o); });
    return { audio, ext: 'wav' as const, voice: `mock-${locale}-${voice.gender}`, usage: { provider: 'mock', operation: 'tts', costCents: 0, latencyMs: Date.now() - t0 } };
  }
}
export class MockModeration implements ModerationProvider {
  name = 'mock';
  async moderate(text: string): Promise<{ allowed: boolean; categories: string[]; usage: { provider: string; operation: string; costCents: number; latencyMs: number } }> {
    const bad = /\b(arma ilegal|golpe|pirâmide|conteúdo adulto|nsfw|violência extrema)\b/i.test(text);
    return { allowed: !bad, categories: bad ? ['policy'] : [], usage: { provider: 'mock', operation: 'moderation', costCents: 0, latencyMs: 1 } };
  }
}
