import { readFile } from 'node:fs/promises';
import { api, checkRules, isMock, mockFault, mockId, mockPoll, MB } from '../common.js';
import type { PublishApi } from '../types.js';
/** Mercado Livre Clips: vertical, 10–61 s, ≤ 280 MB, associado a um item (`listingId` = MLB…). O Clip passa por moderação antes de aparecer. ⚠ Endpoint conforme Fase 3 / doc de Clips; NÃO testado contra a API real (TODO validar). */
export const publish: PublishApi = {
  rules: { maxSec: 61, minSec: 10, maxBytes: 280 * MB, vertical: true },
  validate(v, m) { const r = checkRules('mercadolivre', v, publish.rules); if (!m.listingId || !/^MLB\d+$/i.test(String(m.listingId))) r.errors.push('informe o ID do anúncio no formato MLB123456789'); r.warnings.push('o Clip passa por moderação antes de aparecer'); r.ok = r.errors.length === 0; return r; },
  async upload(video, meta, token, onProgress) {
    if (isMock()) { mockFault('mercadolivre'); onProgress?.(1, 'upload'); return { providerJobId: mockId('mercadolivre') }; }
    const fd = new FormData(); fd.set('file', new Blob([await readFile(video.path)], { type: 'video/mp4' }), 'clip.mp4');
    const j = await api<{ id?: string; clip_id?: string }>('mercadolivre', `https://api.mercadolibre.com/marketplace/items/${meta.listingId}/clips/upload`, { method: 'POST', headers: { authorization: `Bearer ${token.accessToken}` }, body: fd }); onProgress?.(1, 'upload'); return { providerJobId: j.clip_id ?? j.id ?? String(meta.listingId) };
  },
  async pollStatus(id, token, meta) {
    if (isMock()) return mockPoll('mercadolivre', id);
    const j = await api<{ status?: string; reason?: string }>('mercadolivre', `https://api.mercadolibre.com/marketplace/items/${meta.listingId}/clips/${id}`, { headers: { authorization: `Bearer ${token.accessToken}` } });
    return j.status === 'rejected' ? { status: 'failed', error: j.reason ?? 'rejeitado na moderação' } : j.status === 'published' || j.status === 'active' ? { status: 'published', externalId: id, externalUrl: `https://produto.mercadolivre.com.br/${meta.listingId}` } : { status: 'processing' };
  },
};
