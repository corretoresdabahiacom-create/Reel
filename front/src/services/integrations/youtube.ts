import { PLATFORM_CONFIG, APP_STATUS } from './config';
import { backend, checkVideo, connectFlow, ensureFresh, finish, need, noop, refreshFlow, tags, MB } from './common';
import { PlatformError, type PlatformIntegration, type PublishMetadata, type VideoFile } from './types';

/* YouTube Data API v3 – videos.insert (upload resumável, feito no backend).
   ATENÇÃO – divergências com o prompt original:
   • Cota: a página oficial "determine_quota_cost" lista videos.insert = 1 unidade, com bucket próprio de ~100 chamadas/dia por padrão
     (o prompt citava 1.600 unidades ≈ 6 vídeos/dia – valor de versões antigas). Confirme no Google Cloud Console.
   • Shorts: vertical/quadrado e < 3 min segundo fontes de terceiros (prompt dizia ≤ 59s). Mantemos 59s por segurança (TODO: verify).
   Projetos de API não verificados enviam vídeos como PRIVADOS. */
export const YT_DAILY_UPLOADS = 100; // TODO: verify – cota real do seu projeto
const RULES = { maxSec: 59, maxBytes: 256 * 1024 * MB, vertical: true };
const cfg = PLATFORM_CONFIG.youtube;

export const youtube: PlatformIntegration = {
  platform: 'youtube',
  connect: connectFlow('youtube'),
  refresh: refreshFlow('youtube'),
  validate(video: VideoFile, m: PublishMetadata) {
    const errors: string[] = []; const warnings: string[] = [];
    need(!!m.title?.trim(), 'Informe um título.', errors);
    need((m.title ?? '').length <= 100, 'Título excede 100 caracteres.', errors);
    need((m.description ?? '').length <= 5000, 'Descrição excede 5000 caracteres.', errors);
    if (!APP_STATUS.youtubeVerified) warnings.push('Projeto de API não verificado: o vídeo pode ficar privado até a verificação.');
    return finish(checkVideo('youtube', video, RULES), errors, warnings);
  },
  async publish(videoUrl, m, token, onProgress = noop) {
    try {
      const t = await ensureFresh('youtube', token);
      const title = `${m.title ?? ''}`.slice(0, 100);
      const description = `${m.description ?? ''}\n\n${tags(m)} #Shorts`.trim();
      onProgress(0.15, 'Iniciando upload resumável');
      // O backend executa: POST {apiBase}/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status e PUT em chunks.
      const r = await backend<{ id: string }>('youtube', 'upload', t, { videoUrl, snippet: { title, description, categoryId: '22' }, status: { privacyStatus: APP_STATUS.youtubeVerified ? (m.visibility ?? 'public') : 'private', selfDeclaredMadeForKids: false } }, 'videos_insert');
      void cfg;
      onProgress(1, 'Publicado');
      return { status: 'published', externalId: r.id, url: `https://www.youtube.com/shorts/${r.id}` };
    } catch (e) {
      const err = e instanceof PlatformError ? e : new PlatformError('youtube', 'unknown', (e as Error).message);
      if (err.code === 'http_403') return { status: 'failed', error: new PlatformError('youtube', 'quota_exceeded', 'Cota diária do YouTube esgotada. Tente amanhã.', false) };
      return { status: 'failed', error: err };
    }
  },
};
