import { PLATFORM_CONFIG } from './config';
import { http } from './http';
import { backend, checkVideo, connectFlow, ensureFresh, finish, need, noop, refreshFlow, tags, MB } from './common';
import { PlatformError, type PlatformIntegration, type PublishMetadata, type VideoFile } from './types';

/* Instagram Graph API – Reels: 1) POST /{ig-id}/media (media_type=REELS, video_url PÚBLICO, caption)
   2) poll status_code até FINISHED  3) POST /{ig-id}/media_publish. Exige conta profissional (Business/Creator).
   O video_url precisa ser acessível publicamente (o backend gera uma URL assinada temporária). */
const RULES = { maxSec: 90, minSec: 3, maxBytes: 300 * MB, vertical: true }; // TODO: verify limites atuais de Reels
const cfg = PLATFORM_CONFIG.instagram;

export const instagram: PlatformIntegration = {
  platform: 'instagram',
  connect: connectFlow('instagram'),
  refresh: refreshFlow('instagram'),
  validate(video: VideoFile, m: PublishMetadata) {
    const errors: string[] = [];
    const caption = `${m.caption ?? ''} ${tags(m)}`.trim();
    need(caption.length <= 2200, 'Legenda excede 2200 caracteres.', errors);
    need((m.hashtags ?? []).length <= 30, 'Máximo de 30 hashtags.', errors);
    return finish(checkVideo('instagram', video, RULES), errors, ['Requer conta profissional (Business ou Creator) do Instagram.']);
  },
  async publish(videoUrl, m, token, onProgress = noop) {
    try {
      const t = await ensureFresh('instagram', token);
      const igId = t.externalUserId;
      if (!igId) throw new PlatformError('instagram', 'not_professional', 'Conta sem perfil profissional. Converta para Business/Creator.');
      onProgress(0.1, 'Preparando URL pública');
      const { publicUrl } = await backend<{ publicUrl: string }>('instagram', 'public-url', t, { videoUrl }, 'public_url');
      onProgress(0.3, 'Criando contêiner de mídia');
      const c = await http<{ id: string }>(`${cfg.apiBase}/${cfg.apiVersion}/${igId}/media`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.accessToken}` },
        body: JSON.stringify({ media_type: 'REELS', video_url: publicUrl, caption: `${m.caption ?? ''} ${tags(m)}`.trim(), collaborators: m.collaborators?.map((u) => u.replace('@', '')) }) }, { platform: 'instagram', label: 'create_container' });
      onProgress(0.6, 'Processando no Instagram');
      for (let i = 0; i < 30; i++) {
        const s = await http<{ status_code: string }>(`${cfg.apiBase}/${cfg.apiVersion}/${c.id}?fields=status_code`, { headers: { authorization: `Bearer ${t.accessToken}` } }, { platform: 'instagram', label: 'poll_container' });
        if (s.status_code === 'FINISHED') break;
        if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new PlatformError('instagram', 'processing_failed', 'O Instagram não conseguiu processar o vídeo.');
        await new Promise((r) => setTimeout(r, 4000));
      }
      const p = await http<{ id: string }>(`${cfg.apiBase}/${cfg.apiVersion}/${igId}/media_publish`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${t.accessToken}` }, body: JSON.stringify({ creation_id: c.id }) }, { platform: 'instagram', label: 'media_publish' });
      onProgress(1, 'Publicado');
      return { status: 'published', externalId: p.id, url: `https://www.instagram.com/reel/${p.id}/` }; // TODO: buscar permalink via ?fields=permalink
    } catch (e) { return { status: 'failed', error: e instanceof PlatformError ? e : new PlatformError('instagram', 'unknown', (e as Error).message) }; }
  },
};
