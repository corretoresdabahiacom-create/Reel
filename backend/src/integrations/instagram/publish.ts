import { api, checkRules, hashtags, isMock, mockFault, mockId, mockPoll, MB } from '../common.js';
import { PlatformError, type PublishApi } from '../types.js';
/** Reels via Content Publishing API: 1) cria container (video_url PÚBLICO/assinado) 2) poll status_code 3) media_publish. Requer conta profissional. ⚠ Não testado contra a API real. */
export const publish: PublishApi = {
  rules: { maxSec: 90, minSec: 3, maxBytes: 300 * MB, vertical: true, usesPublicUrl: true },
  validate(v, m) { const r = checkRules('instagram', v, publish.rules); if (`${m.caption ?? ''} ${hashtags(m)}`.length > 2200) r.errors.push('legenda passa de 2.200 caracteres'); r.ok = r.errors.length === 0; return r; },
  async upload(video, meta, token, onProgress) {
    if (isMock()) { mockFault('instagram'); onProgress?.(1, 'container'); return { providerJobId: mockId('instagram') }; }
    if (!video.publicUrl) throw new PlatformError('instagram', 'video_url público ausente');
    const c = await api<{ id: string }>('instagram', `https://graph.instagram.com/v21.0/${token.externalUserId}/media`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token.accessToken}` },
      body: JSON.stringify({ media_type: 'REELS', video_url: video.publicUrl, caption: `${meta.caption ?? ''}\n${hashtags(meta)}`.trim(), share_to_feed: true, collaborators: meta.collab ? String(meta.collab).split(/\s+/).map((x) => x.replace('@', '')) : undefined }) });
    onProgress?.(0.5, 'container'); return { providerJobId: c.id };
  },
  async pollStatus(id, token) {
    if (isMock()) return mockPoll('instagram', id);
    const s = await api<{ status_code: string }>('instagram', `https://graph.instagram.com/v21.0/${id}?fields=status_code&access_token=${token.accessToken}`);
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') return { status: 'failed', error: s.status_code }; if (s.status_code !== 'FINISHED') return { status: 'processing' };
    const pub = await api<{ id: string }>('instagram', `https://graph.instagram.com/v21.0/${token.externalUserId}/media_publish`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token.accessToken}` }, body: JSON.stringify({ creation_id: id }) });
    const pl = await api<{ permalink?: string }>('instagram', `https://graph.instagram.com/v21.0/${pub.id}?fields=permalink&access_token=${token.accessToken}`).catch(() => ({} as { permalink?: string }));
    return { status: 'published', externalId: pub.id, externalUrl: pl.permalink };
  },
};
