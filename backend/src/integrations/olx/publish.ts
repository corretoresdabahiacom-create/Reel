import { env } from '../../config/env.js';
import { api, isMock, mockFault, mockId, mockPoll } from '../common.js';
import { PlatformError, type PublishApi, type Validation } from '../types.js';
/**
 * OLX: o anúncio NÃO recebe arquivo de vídeo — recebe um LINK DO YOUTUBE. Portanto a publicação na OLX depende de uma publicação prévia no YouTube
 * (o worker passa `video.youtubeUrl`). Se o upload ao YouTube falhar, a OLX falha com mensagem específica (dependência).
 * ⚠ Endpoint de autoupload é restrito a parceiros — TODO confirmar payload do anúncio.
 */
export const publish: PublishApi = {
  rules: { maxSec: 59, maxBytes: 256 * 1024 * 1024, vertical: false },
  validate(_v, m): Validation { const errors: string[] = []; if (!m.title || m.title.length < 3) errors.push('título obrigatório'); if (m.price === undefined) errors.push('preço obrigatório'); return { ok: errors.length === 0, errors, warnings: ['o vídeo é enviado ao YouTube automaticamente e o link entra no anúncio'] }; },
  async upload(video, meta, token) {
    if (!video.youtubeUrl) throw new PlatformError('olx', 'Depende do YouTube: o envio automático ao YouTube falhou ou não foi feito.', false, 'youtube_dependency');
    if (isMock()) { mockFault('olx'); return { providerJobId: mockId('olx') }; }
    const j = await api<{ id: string }>('olx', `${env.OLX_API_BASE}/autoupload`, { method: 'POST', headers: { authorization: `Bearer ${token.accessToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ title: meta.title, description: `${meta.description ?? ''}\n${video.youtubeUrl}`, price: meta.price, category: meta.category, video: video.youtubeUrl }) });
    return { providerJobId: j.id };
  },
  async pollStatus(id, token) { if (isMock()) return mockPoll('olx', id); const j = await api<{ status: string; url?: string; reason?: string }>('olx', `${env.OLX_API_BASE}/autoupload/${id}`, { headers: { authorization: `Bearer ${token.accessToken}` } }); return j.status === 'rejected' ? { status: 'failed', error: j.reason } : j.status === 'published' ? { status: 'published', externalId: id, externalUrl: j.url } : { status: 'processing' }; },
};
