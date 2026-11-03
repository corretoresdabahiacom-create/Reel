import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { storage, refLocation } from '../../providers/storage.js';
import { withTmp } from '../../utils/ffmpeg.js';
import { recordUsage } from '../../providers/ai/router.js';
import { duration, sceneCuts } from './analysis.js';
import type { SfxEvent } from './types.js';

/** Sensibilidade do detector de cena (0–1). 0,15 pega troca de cor com luz parecida sem disparar em movimento comum. */
export const CUT_THRESHOLD = 0.15;
export interface SfxSuggestion { timestampSec: number; sfxId: string; reason: string }
/**
 * Sugestão de SFX com timing por frame: o detector de cena do FFmpeg acha os cortes (sem corte detectável, usa as
 * fronteiras das cenas do projeto); cada corte ganha um "whoosh"
 * um pouco antes, a abertura ganha um "brilho" e o fechamento um "impacto". Roda localmente (sem provedor externo);
 * mesmo assim grava em `ai_usage` como `local` para custo e latência ficarem rastreáveis. O usuário aceita ou descarta cada sugestão.
 */
export async function suggestSfx(videoUrl: string, ctx: { userId: string; projectId: string }, sceneDurations: number[] = []): Promise<SfxSuggestion[]> {
  const t0 = Date.now();
  const out = await withTmp(async (dir) => {
    const f = join(dir, 'v.mp4'); const l = refLocation(videoUrl); await writeFile(f, await storage.get(l.bucket, l.key));
    const dur = await duration(f); let cuts = (await sceneCuts(f, CUT_THRESHOLD)).filter((c) => c > 0.5 && c < dur - 0.5);
    if (!cuts.length && sceneDurations.length > 1) { // cortes suaves (mesma luz/cor): usa as fronteiras das cenas, proporcionais à duração do vídeo
      const total = sceneDurations.reduce((x, y) => x + y, 0); let acc = 0;
      cuts = sceneDurations.slice(0, -1).map((d) => { acc += d; return +(acc / total * dur).toFixed(2); });
    }
    const s: SfxSuggestion[] = [{ timestampSec: 0.1, sfxId: 'sparkle', reason: 'abertura do vídeo' }];
    let last = -10;
    for (const c of cuts) { if (c - last < 1) continue; last = c; s.push({ timestampSec: Math.max(0, +(c - 0.25).toFixed(2)), sfxId: 'whoosh', reason: `troca de cena em ${c.toFixed(1)} s` }); }
    if (dur > 3) s.push({ timestampSec: +Math.max(0, dur - 0.9).toFixed(2), sfxId: 'impact', reason: 'fechamento do vídeo' });
    return s.slice(0, 12);
  });
  await recordUsage({ provider: 'local', operation: 'sfx_suggest', costCents: 0, latencyMs: Date.now() - t0, userId: ctx.userId, projectId: ctx.projectId, status: 'ok' });
  return out;
}
export const toEvents = (s: SfxSuggestion[]): SfxEvent[] => s.map(({ timestampSec, sfxId }) => ({ timestampSec, sfxId }));
