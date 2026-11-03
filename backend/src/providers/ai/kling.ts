import { SignJWT } from 'jose';
import { env } from '../../config/env.js';
import { storage, RAW_SCENE } from '../storage.js';
import { ffmpeg, withTmp, writeFile, readFile } from '../../utils/ffmpeg.js';
import { join } from 'node:path';
import type { SceneInput, SceneResult, VideoProvider } from './types.js';

/**
 * Kling AI (image→video). Autenticação: JWT HS256 (iss = access key, assinado com secret key), conforme a documentação do Kling.
 * Fluxo: POST /v1/videos/image2video → task_id → GET /v1/videos/image2video/{task_id} até `succeed` → baixa o MP4.
 * ⚠ Escrito conforme a documentação pública; NÃO testado contra a API real (sem credenciais nesta fase). Campos/modelos podem exigir ajuste.
 * Custo (estimativa configurável): ~14 centavos de dólar por 5 s no modo `std` — ajuste KLING_COST_CENTS_PER_5S.
 */
const COST_PER_5S = Number(process.env.KLING_COST_CENTS_PER_5S ?? 14);
export class KlingVideo implements VideoProvider {
  name = 'kling';
  private async token(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: env.KLING_ACCESS_KEY }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setExpirationTime(now + 1800).setNotBefore(now - 5).sign(new TextEncoder().encode(env.KLING_SECRET_KEY));
  }
  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const r = await fetch(env.KLING_API_BASE + path, { method, headers: { authorization: `Bearer ${await this.token()}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = (await r.json().catch(() => ({}))) as { code?: number; message?: string; data?: T };
    if (!r.ok || (j.code !== undefined && j.code !== 0)) throw new Error(`kling ${r.status}: ${j.message ?? 'erro'}`);
    return j.data as T;
  }
  async generateScene(scene: SceneInput, previous: { lastFrameKey?: string } | undefined): Promise<SceneResult> {
    if (!env.KLING_ACCESS_KEY || !env.KLING_SECRET_KEY) throw new Error('Kling sem credenciais (KLING_ACCESS_KEY/KLING_SECRET_KEY)');
    const t0 = Date.now();
    // chaining: o frame inicial é o último frame da cena anterior (ou a 1ª foto de referência) — enviado como URL assinada
    const srcKey = previous?.lastFrameKey ?? scene.referenceKeys[0];
    const image = srcKey ? await storage.signedGetUrl(srcKey.startsWith('uploads/') ? 'uploads' : 'videos', srcKey.replace(/^uploads\//, ''), 3600) : undefined;
    const duration = scene.durationSec >= 8 ? '10' : '5';
    const task = await this.api<{ task_id: string }>('POST', '/v1/videos/image2video', { model_name: 'kling-v1-6', mode: 'std', duration, aspect_ratio: '9:16', prompt: scene.prompt, image });
    let url: string | undefined;
    for (let i = 0; i < 120 && !url; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      const s = await this.api<{ task_status: string; task_status_msg?: string; task_result?: { videos?: { url: string }[] } }>('GET', `/v1/videos/image2video/${task.task_id}`);
      if (s.task_status === 'failed') throw new Error('kling falhou: ' + (s.task_status_msg ?? ''));
      if (s.task_status === 'succeed') url = s.task_result?.videos?.[0]?.url;
    }
    if (!url) throw new Error('kling: tempo esgotado');
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
    const videoKey = `projects/${scene.projectId}/scenes/${scene.id}-${Date.now()}.mp4`, frameKey = videoKey.replace('.mp4', '-last.jpg');
    await storage.put('videos', videoKey, buf, 'video/mp4', RAW_SCENE);
    await withTmp(async (dir) => { const i = join(dir, 'i.mp4'), o = join(dir, 'f.jpg'); await writeFile(i, buf); await ffmpeg(['-sseof', '-0.2', '-i', i, '-frames:v', '1', '-q:v', '3', o]); await storage.put('videos', frameKey, await readFile(o), 'image/jpeg', RAW_SCENE); });
    return { videoKey, lastFrameKey: frameKey, consistency: 0.95, usage: { provider: 'kling', operation: 'generate_scene', costCents: (Number(duration) / 5) * COST_PER_5S, latencyMs: Date.now() - t0 } };
  }
}
