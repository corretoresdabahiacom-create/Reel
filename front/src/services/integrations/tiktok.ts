import { PLATFORM_CONFIG, APP_STATUS } from './config';
import { http } from './http';
import { backend, checkVideo, connectFlow, ensureFresh, finish, need, noop, refreshFlow, tags, MB } from './common';
import { PlatformError, type PlatformIntegration, type PublishMetadata, type VideoFile } from './types';

/* TikTok Content Posting API – Direct Post (verificado na doc oficial):
   POST {apiBase}/v2/post/publish/video/init/ → { publish_id, upload_url }; PUT do arquivo no upload_url (válido ~1h);
   status em /v2/post/publish/status/fetch/. Legenda ≤ 2200. App NÃO auditado: só privacy_level = SELF_ONLY.
   Limite: ~6 requisições/min por token. */
const RULES = { maxSec: 600, maxBytes: 287 * MB, vertical: true }; // TODO: verify limite de duração/tamanho da conta (consulte /v2/post/publish/creator_info/query/)
const cfg = PLATFORM_CONFIG.tiktok;

export const tiktok: PlatformIntegration = {
  platform: 'tiktok',
  connect: connectFlow('tiktok'),
  refresh: refreshFlow('tiktok'),
  validate(video: VideoFile, m: PublishMetadata) {
    const errors: string[] = []; const warnings: string[] = [];
    const caption = `${m.caption ?? ''} ${tags(m)}`.trim();
    need(caption.length > 0, 'Escreva uma legenda.', errors);
    need(caption.length <= 2200, 'Legenda excede 2200 caracteres.', errors);
    if (!APP_STATUS.tiktokAudited) warnings.push('App TikTok não auditado: o vídeo será publicado como privado (apenas você).');
    return finish(checkVideo('tiktok', video, RULES), errors, warnings);
  },
  async publish(videoUrl, m, token, onProgress = noop) {
    try {
      const t = await ensureFresh('tiktok', token);
      const privacy = APP_STATUS.tiktokAudited ? ({ public: 'PUBLIC_TO_EVERYONE', friends: 'MUTUAL_FOLLOW_FRIENDS', private: 'SELF_ONLY' } as const)[m.privacy ?? 'public'] : 'SELF_ONLY';
      onProgress(0.1, 'Iniciando envio');
      const init = await http<{ data: { publish_id: string; upload_url: string }; error: { code: string; message: string } }>(
        `${cfg.apiBase}/v2/post/publish/video/init/`,
        { method: 'POST', headers: { authorization: `Bearer ${t.accessToken}`, 'content-type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({ post_info: { title: `${m.caption ?? ''} ${tags(m)}`.trim(), privacy_level: privacy }, source_info: { source: 'FILE_UPLOAD', video_size: 0 /* TODO: preencher com o tamanho real */, chunk_size: 0, total_chunk_count: 1 } }) },
        { platform: 'tiktok', label: 'init_upload', mapError: (s, b) => (s === 429 ? { code: 'rate_limit', message: 'Muitas requisições ao TikTok. Aguarde 1 minuto.', retryable: true } : (b as { error?: { code?: string; message?: string } })?.error?.code ? { code: (b as { error: { code: string } }).error.code, message: (b as { error: { message: string } }).error.message, retryable: false } : null) });
      onProgress(0.3, 'Enviando vídeo');
      // O PUT do arquivo roda no backend (stream do arquivo adaptado até data.upload_url).
      await backend('tiktok', 'upload', t, { uploadUrl: init.data.upload_url, videoUrl }, 'put_video');
      onProgress(0.8, 'Processando no TikTok');
      const st = await backend<{ status: string; postId?: string; failReason?: string }>('tiktok', 'status', t, { publishId: init.data.publish_id }, 'poll_status');
      if (st.status === 'FAILED') throw new PlatformError('tiktok', 'publish_failed', st.failReason ?? 'O TikTok recusou o vídeo.');
      onProgress(1, 'Publicado');
      return { status: 'published', externalId: init.data.publish_id, url: st.postId ? `https://www.tiktok.com/@me/video/${st.postId}` : 'https://www.tiktok.com/' };
    } catch (e) { return { status: 'failed', error: e instanceof PlatformError ? e : new PlatformError('tiktok', 'unknown', (e as Error).message) }; }
  },
};
