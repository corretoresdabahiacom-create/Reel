import { readFile } from 'node:fs/promises';
import { env } from '../../config/env.js';
import { api, checkRules, isMock, mockFault, mockId, mockPoll, MB } from '../common.js';
import type { PublishApi } from '../types.js';
/** Temu: vídeo de produto ≥ 720p, ≤ 100 MB (valores da Fase 3). ⚠ Endpoints abaixo são PLACEHOLDERS configuráveis (API restrita) — TODO confirmar na documentação de parceiro. */
export const publish: PublishApi = {
  rules: { maxSec: 60, minSec: 5, maxBytes: 100 * MB, minHeight: 720, vertical: true },
  validate(v, m) { const r = checkRules('temu', v, publish.rules); if (!m.listingId) r.errors.push('informe o ID do produto (SKC/goods_id) da Temu'); r.ok = r.errors.length === 0; return r; },
  async upload(video, meta, token, onProgress) {
    if (isMock()) { mockFault('temu'); onProgress?.(1, 'upload'); return { providerJobId: mockId('temu') }; }
    const fd = new FormData(); fd.set('goods_id', String(meta.listingId)); fd.set('video', new Blob([await readFile(video.path)], { type: 'video/mp4' }), 'video.mp4');
    const j = await api<{ task_id: string }>('temu', `${env.TEMU_API_BASE}/goods/video/upload`, { method: 'POST', headers: { authorization: `Bearer ${token.accessToken}` }, body: fd }); onProgress?.(1, 'upload'); return { providerJobId: j.task_id };
  },
  async pollStatus(id, token) {
    if (isMock()) return mockPoll('temu', id);
    const j = await api<{ status: string; url?: string; reason?: string }>('temu', `${env.TEMU_API_BASE}/goods/video/status?task_id=${id}`, { headers: { authorization: `Bearer ${token.accessToken}` } });
    return j.status === 'FAILED' ? { status: 'failed', error: j.reason } : j.status === 'DONE' ? { status: 'published', externalId: id, externalUrl: j.url } : { status: 'processing' };
  },
};
