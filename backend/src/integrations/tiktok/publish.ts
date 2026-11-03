import { readFile } from 'node:fs/promises';
import { env } from '../../config/env.js';
import { api, checkRules, hashtags, isMock, mockFault, mockId, mockPoll, MB } from '../common.js';
import { PlatformError, type PublishApi } from '../types.js';
/**
 * TikTok Content Posting API (Direct Post). Limites: vídeo ≤ 1 GB (aqui adaptamos p/ ≤ ~287 MB), 6 inits/min por usuário (limitado no worker).
 * App NÃO auditado → só `SELF_ONLY` (privado); com TIKTOK_APP_AUDITED=true respeita meta.privacy.
 * Upload em partes (FILE_UPLOAD): chunks de 10 MB; cada PUT com Content-Range. ⚠ Não testado contra a API real.
 */
const CHUNK = 10 * MB;
export const publish: PublishApi = {
  rules: { maxSec: 600, minSec: 3, maxBytes: 1024 * MB, vertical: true },
  validate(v, m) { const r = checkRules('tiktok', v, publish.rules); const cap = `${m.caption ?? ''} ${hashtags(m)}`.trim(); if (cap.length > 2200) r.errors.push('legenda passa de 2.200 caracteres'); if (!env.TIKTOK_APP_AUDITED) r.warnings.push('app não auditado: será publicado como privado (SELF_ONLY)'); r.ok = r.errors.length === 0; return r; },
  async upload(video, meta, token, onProgress) {
    if (isMock()) { mockFault('tiktok'); onProgress?.(1, 'upload'); return { providerJobId: mockId('tiktok') }; }
    const level = env.TIKTOK_APP_AUDITED ? ({ public: 'PUBLIC_TO_EVERYONE', friends: 'MUTUAL_FOLLOW_FRIENDS', private: 'SELF_ONLY' } as Record<string, string>)[meta.privacy ?? 'private'] ?? 'SELF_ONLY' : 'SELF_ONLY';
    const chunks = Math.max(1, Math.ceil(video.bytes / CHUNK)); const chunkSize = chunks === 1 ? video.bytes : CHUNK;
    const init = await api<{ data: { publish_id: string; upload_url: string }; error?: { code: string; message: string } }>('tiktok', 'https://open.tiktokapis.com/v2/post/publish/video/init/', { method: 'POST', headers: { authorization: `Bearer ${token.accessToken}`, 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ post_info: { title: `${meta.caption ?? ''} ${hashtags(meta)}`.trim().slice(0, 2200), privacy_level: level, disable_comment: false }, source_info: { source: 'FILE_UPLOAD', video_size: video.bytes, chunk_size: chunkSize, total_chunk_count: chunks } }) });
    if (init.error && init.error.code !== 'ok') throw new PlatformError('tiktok', `${init.error.code}: ${init.error.message}`, false, init.error.code);
    const buf = await readFile(video.path);
    for (let i = 0; i < chunks; i++) { const start = i * chunkSize, end = Math.min(video.bytes, start + chunkSize) - 1;
      const r = await fetch(init.data.upload_url, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${video.bytes}` }, body: buf.subarray(start, end + 1) });
      if (!r.ok && r.status !== 206) throw new PlatformError('tiktok', `upload parte ${i + 1} falhou (${r.status})`, r.status >= 500); onProgress?.((i + 1) / chunks, 'upload'); }
    return { providerJobId: init.data.publish_id };
  },
  async pollStatus(id, token) {
    if (isMock()) return mockPoll('tiktok', id);
    const j = await api<{ data: { status: string; fail_reason?: string; publicaly_available_post_id?: string[] } }>('tiktok', 'https://open.tiktokapis.com/v2/post/publish/status/fetch/', { method: 'POST', headers: { authorization: `Bearer ${token.accessToken}`, 'content-type': 'application/json; charset=UTF-8' }, body: JSON.stringify({ publish_id: id }) });
    if (j.data.status === 'FAILED') return { status: 'failed', error: j.data.fail_reason ?? 'falhou' };
    if (j.data.status === 'PUBLISH_COMPLETE') { const pid = j.data.publicaly_available_post_id?.[0]; return { status: 'published', externalId: pid ?? id, externalUrl: pid ? `https://www.tiktok.com/@/video/${pid}` : undefined }; }
    return { status: 'processing' };
  },
};
