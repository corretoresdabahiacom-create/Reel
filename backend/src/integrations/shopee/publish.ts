import { readFile } from 'node:fs/promises';
import { env } from '../../config/env.js';
import { api, checkRules, isMock, mockFault, mockId, mockPoll, MB } from '../common.js';
import { shopSign } from './oauth.js';
import { PlatformError, type PublishApi } from '../types.js';
/**
 * Shopee: vídeo de produto 10–60 s, ≤ 30 MB. Fluxo da Media Space API: init_video_upload → upload_video_part (partes de 4 MB) → complete_video_upload
 * → get_video_upload_result (polling) → vincula ao item (`product.update_item` com video_upload_id). Requer `listingId` (item_id).
 * ⚠ Endpoints/campos conforme documentação pública v2; NÃO testado contra a API real — validar na homologação do parceiro (TODO).
 */
const BASE = 'https://partner.shopeemobile.com'; const PART = 4 * MB;
const url = (path: string, tok: { accessToken: string; externalUserId?: string }) => { const ts = Math.floor(Date.now() / 1000); return `${BASE}${path}?partner_id=${env.SHOPEE_PARTNER_ID}&timestamp=${ts}&sign=${shopSign(path, ts, tok.accessToken, tok.externalUserId ?? '')}&access_token=${tok.accessToken}&shop_id=${tok.externalUserId}`; };
export const publish: PublishApi = {
  rules: { maxSec: 60, minSec: 10, maxBytes: 30 * MB, vertical: true },
  validate(v, m) { const r = checkRules('shopee', v, publish.rules); if (!m.listingId) r.errors.push('informe o ID do produto (item_id) da Shopee'); if ((m.title ?? '').length > 120) r.errors.push('título passa de 120 caracteres'); r.ok = r.errors.length === 0; return r; },
  async upload(video, meta, token, onProgress) {
    if (isMock()) { mockFault('shopee'); onProgress?.(1, 'upload'); return { providerJobId: mockId('shopee') }; }
    const buf = await readFile(video.path); const { createHash } = await import('node:crypto'); const md5 = createHash('md5').update(buf).digest('hex');
    const init = await api<{ response?: { video_upload_id: string }; error?: string; message?: string }>('shopee', url('/api/v2/media_space/init_video_upload', token), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file_md5: md5, file_size: video.bytes }) });
    if (!init.response) throw new PlatformError('shopee', `${init.error}: ${init.message}`);
    const id = init.response.video_upload_id; const parts = Math.ceil(buf.length / PART);
    for (let i = 0; i < parts; i++) { const fd = new FormData(); fd.set('video_upload_id', id); fd.set('part_seq', String(i)); fd.set('content_md5', createHash('md5').update(buf.subarray(i * PART, (i + 1) * PART)).digest('hex')); fd.set('part_content', new Blob([buf.subarray(i * PART, (i + 1) * PART)]));
      await api('shopee', url('/api/v2/media_space/upload_video_part', token), { method: 'POST', body: fd }); onProgress?.((i + 1) / parts, 'upload'); }
    await api('shopee', url('/api/v2/media_space/complete_video_upload', token), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ video_upload_id: id, part_seq_list: Array.from({ length: parts }, (_, i) => i), report_data: { upload_cost: 0 } }) });
    return { providerJobId: id };
  },
  async pollStatus(id, token, meta) {
    if (isMock()) return mockPoll('shopee', id);
    const r = await api<{ response?: { status: string; video_info?: { video_url_list?: { video_url: string }[] }; message?: string } }>('shopee', `${url('/api/v2/media_space/get_video_upload_result', token)}&video_upload_id=${id}`);
    const s = r.response?.status; if (s === 'FAILED') return { status: 'failed', error: r.response?.message ?? 'falhou' }; if (s !== 'SUCCEEDED') return { status: 'processing' };
    await api('shopee', url('/api/v2/product/update_item', token), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ item_id: Number(meta.listingId), video_upload_id: [id] }) });
    return { status: 'published', externalId: id, externalUrl: r.response?.video_info?.video_url_list?.[0]?.video_url };
  },
};
