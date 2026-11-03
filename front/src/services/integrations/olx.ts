import { backend, checkVideo, connectFlow, ensureFresh, finish, need, noop, refreshFlow, MB } from './common';
import { PlatformError, type PlatformIntegration, type PublishMetadata, type VideoFile } from './types';

/* OLX não hospeda vídeo próprio: o anúncio recebe um LINK de vídeo (YouTube). Fluxo (orquestrado em index.ts):
   1) publicar no YouTube automaticamente; 2) usar a URL gerada em metadata.youtubeUrl; 3) atualizar o anúncio.
   TODO: verify – API de anúncios da OLX (restrita a parceiros) e nome do campo de vídeo (ex.: movie_url). */
const RULES = { maxSec: 59, maxBytes: 256 * 1024 * MB, vertical: true };
const YT = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i;

export const olx: PlatformIntegration = {
  platform: 'olx',
  connect: connectFlow('olx'),
  refresh: refreshFlow('olx'),
  validate(video: VideoFile, m: PublishMetadata) {
    const errors: string[] = [];
    need(!!m.listingId?.trim(), 'Informe o ID do anúncio.', errors);
    if (m.youtubeUrl) need(YT.test(m.youtubeUrl), 'Link do YouTube inválido.', errors);
    return finish(checkVideo('olx', video, RULES), errors, ['O vídeo será enviado ao YouTube automaticamente e o link usado no anúncio.']);
  },
  async publish(_videoUrl, m, token, onProgress = noop) {
    try {
      if (!m.youtubeUrl || !YT.test(m.youtubeUrl)) throw new PlatformError('olx', 'missing_youtube', 'Sem link do YouTube. Conecte o YouTube para o envio automático.');
      const t = await ensureFresh('olx', token);
      onProgress(0.5, 'Atualizando anúncio');
      await backend('olx', 'ad/video-link', t, { adId: m.listingId, movieUrl: m.youtubeUrl }, 'ad_video_link'); // TODO: substituir mock por real
      onProgress(1, 'Publicado');
      return { status: 'published', externalId: m.listingId, url: `https://www.olx.com.br/d/anuncio/${m.listingId}` };
    } catch (e) { return { status: 'failed', error: e instanceof PlatformError ? e : new PlatformError('olx', 'unknown', (e as Error).message) }; }
  },
};
