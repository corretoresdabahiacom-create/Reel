import { BACKEND_URL } from './integrations/config';
import { http } from './integrations/http';
import type { Platform } from './integrations/types';

/** Perfis de saída por plataforma (valores do prompt; TODO: verify contra a documentação de cada uma). */
export const ADAPT_PROFILES: Record<Platform, { maxSec: number; maxMB: number; width: 1080; height: 1920 }> = {
  tiktok: { maxSec: 600, maxMB: 287, width: 1080, height: 1920 },
  youtube: { maxSec: 59, maxMB: 256 * 1024, width: 1080, height: 1920 },
  instagram: { maxSec: 90, maxMB: 300, width: 1080, height: 1920 },
  shopee: { maxSec: 60, maxMB: 30, width: 1080, height: 1920 },
  temu: { maxSec: 60, maxMB: 100, width: 1080, height: 1920 },
  olx: { maxSec: 59, maxMB: 256 * 1024, width: 1080, height: 1920 },
  mercadolivre: { maxSec: 60, maxMB: 280, width: 1080, height: 1920 },
};
export interface AdaptedVideo { url: string; applied: string[]; sizeBytes: number; durationSec: number }

/** Pede ao backend (server/adapter.ts, FFmpeg) uma versão adequada à plataforma: 9:16 1080×1920, MP4 H.264/AAC, corte e compressão. */
export async function adaptForPlatform(videoUrl: string, platform: Platform): Promise<AdaptedVideo> {
  return http<AdaptedVideo>(`${BACKEND_URL}/api/adapt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ videoUrl, platform, profile: ADAPT_PROFILES[platform] }) }, { platform, label: 'adapt_video', timeoutMs: 300_000 });
}
