import { backend, checkVideo, connectFlow, ensureFresh, finish, need, noop, refreshFlow, MB } from './common';
import { PlatformError, type PlatformIntegration, type PublishMetadata, type VideoFile } from './types';

/* Shopee Open Platform v2 – vídeo do anúncio. Assinatura HMAC-SHA256 (partner_id, path, timestamp, access_token, shop_id) feita SÓ no backend.
   TODO: verify – endpoints de vídeo (fluxo init/upload/complete do media_space) e limites exatos. Valores do prompt: ≤30MB, ≤60s, MP4. */
const RULES = { maxSec: 60, minSec: 10, maxBytes: 30 * MB, vertical: true };

export const shopee: PlatformIntegration = {
  platform: 'shopee',
  connect: connectFlow('shopee'),
  refresh: refreshFlow('shopee'),
  validate(video: VideoFile, m: PublishMetadata) {
    const errors: string[] = [];
    need(!!m.listingId?.trim(), 'Informe o ID do anúncio (item_id).', errors);
    need((m.title ?? '').length <= 120, 'Título excede 120 caracteres.', errors);
    return finish(checkVideo('shopee', video, RULES), errors);
  },
  async publish(videoUrl, m, token, onProgress = noop) {
    try {
      const t = await ensureFresh('shopee', token);
      onProgress(0.2, 'Enviando vídeo à Shopee');
      // TODO: substituir mock por real – confirmar endpoints de media_space.
      const up = await backend<{ videoUploadId: string }>('shopee', 'video/upload', t, { videoUrl }, 'video_upload');
      onProgress(0.7, 'Vinculando ao anúncio');
      await backend('shopee', 'item/attach-video', t, { itemId: m.listingId, videoUploadId: up.videoUploadId }, 'attach_video');
      onProgress(1, 'Publicado');
      return { status: 'published', externalId: m.listingId, url: `https://shopee.com.br/product/${m.listingId}` }; // TODO: URL real com shop_id
    } catch (e) { return { status: 'failed', error: e instanceof PlatformError ? e : new PlatformError('shopee', 'unknown', (e as Error).message) }; }
  },
};
