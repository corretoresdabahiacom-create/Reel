import { backend, checkVideo, connectFlow, ensureFresh, finish, need, noop, refreshFlow, MB } from './common';
import { PlatformError, type PlatformIntegration, type PublishMetadata, type VideoFile } from './types';

/* Temu Seller/Partner API – acesso restrito a parceiros aprovados. TODO: verify tudo (auth, endpoints, limites).
   Valores abaixo são placeholders conservadores. A UI já trata falha transitória e retry. */
const RULES = { maxSec: 60, minSec: 5, maxBytes: 100 * MB, vertical: true };

export const temu: PlatformIntegration = {
  platform: 'temu',
  connect: connectFlow('temu'),
  refresh: refreshFlow('temu'),
  validate(video: VideoFile, m: PublishMetadata) {
    const errors: string[] = [];
    need(!!m.listingId?.trim(), 'Informe o ID do produto.', errors);
    return finish(checkVideo('temu', video, RULES), errors, ['API da Temu exige conta de parceiro aprovada.']);
  },
  async publish(videoUrl, m, token, onProgress = noop) {
    try {
      const t = await ensureFresh('temu', token);
      onProgress(0.3, 'Enviando vídeo à Temu');
      // TODO: substituir mock por real.
      await backend('temu', 'goods/video', t, { videoUrl, goodsId: m.listingId }, 'goods_video');
      onProgress(1, 'Publicado');
      return { status: 'published', externalId: m.listingId, url: `https://www.temu.com/goods.html?goods_id=${m.listingId}` };
    } catch (e) { return { status: 'failed', error: e instanceof PlatformError ? e : new PlatformError('temu', 'unknown', (e as Error).message) }; }
  },
};
