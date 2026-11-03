import { USE_REAL_APIS } from './config';
import { log } from './http';
import { instagram } from './instagram';
import { mercadolivre } from './mercadolivre';
import { olx } from './olx';
import { shopee } from './shopee';
import { temu } from './temu';
import { tiktok } from './tiktok';
import { youtube } from './youtube';
import { adaptForPlatform } from '../videoAdapter';
import { PlatformError, type AuthToken, type Platform, type PlatformIntegration, type ProgressFn, type PublishMetadata, type PublishResult, type VideoFile } from './types';

export const INTEGRATIONS: Record<Platform, PlatformIntegration> = { tiktok, youtube, instagram, shopee, temu, olx, mercadolivre };
export * from './types';
export { USE_REAL_APIS } from './config';

/** Assinatura estável usada pelas telas. `video` é o arquivo original; a adaptação por plataforma acontece aqui dentro. */
export async function publish(platform: Platform, video: VideoFile, metadata: PublishMetadata, token: AuthToken, onProgress?: ProgressFn): Promise<PublishResult> {
  // TODO: substituir mock por real – com USE_REAL_APIS=false o app usa o mock do front (ver nexusreel.html).
  if (!USE_REAL_APIS) throw new PlatformError(platform, 'mock_mode', 'USE_REAL_APIS=false: use o provedor mock.');
  const integ = INTEGRATIONS[platform];
  const check = integ.validate(video, metadata);
  if (!check.valid) return { status: 'failed', error: new PlatformError(platform, 'validation', check.errors.join(' ')) };
  try {
    onProgress?.(0.02, 'Adaptando vídeo');
    const adapted = await adaptForPlatform(video.url, platform);
    log('info', platform, 'publish_start', { adaptations: adapted.applied });
    return await integ.publish(adapted.url, metadata, token, onProgress);
  } catch (e) {
    return { status: 'failed', error: e instanceof PlatformError ? e : new PlatformError(platform, 'unknown', (e as Error).message) };
  }
}

/** Publica em várias plataformas em paralelo; falha de uma NUNCA bloqueia as outras (allSettled). OLX depende do YouTube. */
export async function publishAll(targets: Platform[], video: VideoFile, metadata: Record<Platform, PublishMetadata>, tokens: Partial<Record<Platform, AuthToken>>, onProgress?: (p: Platform, pr: number, stage: string) => void): Promise<Record<Platform, PublishResult>> {
  const results = {} as Record<Platform, PublishResult>;
  const run = async (p: Platform, meta: PublishMetadata) => {
    const tk = tokens[p];
    results[p] = tk ? await publish(p, video, meta, tk, (pr, s) => onProgress?.(p, pr, s)) : { status: 'failed', error: new PlatformError(p, 'not_connected', 'Conta não conectada.') };
  };
  const independents = targets.filter((p) => p !== 'olx');
  await Promise.allSettled(independents.map((p) => run(p, metadata[p])));
  if (targets.includes('olx')) {
    const ytUrl = results.youtube?.status === 'published' ? results.youtube.url : undefined;
    if (!ytUrl && !targets.includes('youtube') && tokens.youtube) {
      await run('youtube', { ...metadata.youtube, title: metadata.youtube?.title ?? metadata.olx.title });
    }
    const yt = results.youtube?.status === 'published' ? results.youtube.url : undefined;
    await run('olx', { ...metadata.olx, youtubeUrl: yt });
  }
  return results;
}
