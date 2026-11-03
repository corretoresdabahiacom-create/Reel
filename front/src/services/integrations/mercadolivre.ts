import { backend, checkVideo, connectFlow, ensureFresh, finish, need, noop, refreshFlow, MB } from './common';
import { PlatformError, type PlatformIntegration, type PublishMetadata, type VideoFile } from './types';

/* Mercado Livre Clips: vertical 9:16, 10s–1min, MP4/MOV/MPEG/AVI, ≤280MB, moderação automática (fontes de terceiros).
   TODO: verify – endpoint de upload de Clips na documentação developers.mercadolivre.com.br. */
const RULES = { maxSec: 60, minSec: 10, maxBytes: 280 * MB, vertical: true };

export const mercadolivre: PlatformIntegration = {
  platform: 'mercadolivre',
  connect: connectFlow('mercadolivre'),
  refresh: refreshFlow('mercadolivre'),
  validate(video: VideoFile, m: PublishMetadata) {
    const errors: string[] = [];
    need(!!m.listingId?.trim(), 'Informe o ID do anúncio (MLB...).', errors);
    return finish(checkVideo('mercadolivre', video, RULES), errors, ['O Clip passa por moderação automática antes de aparecer.']);
  },
  async publish(videoUrl, m, token, onProgress = noop) {
    try {
      const t = await ensureFresh('mercadolivre', token);
      onProgress(0.3, 'Enviando Clip');
      await backend('mercadolivre', 'clips/upload', t, { videoUrl, itemId: m.listingId }, 'clips_upload'); // TODO: substituir mock por real
      onProgress(0.9, 'Em moderação');
      return { status: 'published', externalId: m.listingId, url: `https://produto.mercadolivre.com.br/${m.listingId}` };
    } catch (e) { return { status: 'failed', error: e instanceof PlatformError ? e : new PlatformError('mercadolivre', 'unknown', (e as Error).message) }; }
  },
};
