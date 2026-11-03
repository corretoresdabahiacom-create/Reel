import { readFile } from 'node:fs/promises';
import { env } from '../../config/env.js';
import { redis } from '../../db/redis.js';
import { api, checkRules, hashtags, isMock, mockFault, mockId, mockPoll, MB } from '../common.js';
import { PlatformError, type PublishApi } from '../types.js';
/**
 * YouTube Data API v3 — upload resumável. Shorts: vertical e ≤ 60 s (adaptamos p/ ≤ 59 s) + "#Shorts" no título/descrição.
 * COTA: o projeto tem 10.000 unidades/dia e cada upload custa 1.600 → ~6 uploads/dia POR PROJETO (todos os usuários somados),
 * a menos que se solicite aumento. Contabilizamos em Redis (YT_DAILY_UNITS) e falhamos cedo com mensagem clara.
 * Projeto de API não verificado → vídeos ficam privados (forçamos `private` se YOUTUBE_PROJECT_VERIFIED=false). ⚠ Não testado contra a API real.
 */
export const YT_UNITS_PER_UPLOAD = 1600; export const YT_DAILY_UNITS = Number(process.env.YT_DAILY_UNITS ?? 10_000);
export async function reserveYoutubeQuota(): Promise<void> {
  const day = new Date().toISOString().slice(0, 10); const used = await redis.incrby(`yt:quota:${day}`, YT_UNITS_PER_UPLOAD); await redis.expire(`yt:quota:${day}`, 172800);
  if (used > YT_DAILY_UNITS) { await redis.decrby(`yt:quota:${day}`, YT_UNITS_PER_UPLOAD); throw new PlatformError('youtube', 'Cota diária de uploads do YouTube esgotada para o projeto. Tente amanhã.', false, 'quota_exceeded'); }
}
export const publish: PublishApi = {
  rules: { maxSec: 59, minSec: 1, maxBytes: 256 * 1024 * MB, vertical: true },
  validate(v, m) { const r = checkRules('youtube', v, publish.rules); if ((m.title ?? '').length > 100) r.errors.push('título passa de 100 caracteres'); if ((m.description ?? '').length > 5000) r.errors.push('descrição passa de 5.000 caracteres'); if (!env.YOUTUBE_PROJECT_VERIFIED) r.warnings.push('projeto não verificado: vídeo será privado'); r.ok = r.errors.length === 0; return r; },
  async upload(video, meta, token, onProgress) {
    await reserveYoutubeQuota();
    if (isMock()) { mockFault('youtube'); onProgress?.(1, 'upload'); return { providerJobId: mockId('youtube') }; }
    const privacy = env.YOUTUBE_PROJECT_VERIFIED ? meta.visibility ?? 'public' : 'private';
    const title = `${(meta.title ?? 'Vídeo').slice(0, 88)} #Shorts`; const description = `${meta.description ?? ''}\n\n${hashtags(meta)} #Shorts`.trim();
    const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST', headers: { authorization: `Bearer ${token.accessToken}`, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(video.bytes) },
      body: JSON.stringify({ snippet: { title, description, categoryId: '22' }, status: { privacyStatus: privacy, selfDeclaredMadeForKids: false } }) });
    if (!start.ok) throw new PlatformError('youtube', `youtube init ${start.status}`, start.status >= 500 || start.status === 429, start.status === 403 ? 'quota_or_forbidden' : 'http_' + start.status);
    const loc = start.headers.get('location'); if (!loc) throw new PlatformError('youtube', 'sem URL de upload');
    const put = await fetch(loc, { method: 'PUT', headers: { 'content-type': 'video/mp4', 'content-length': String(video.bytes) }, body: await readFile(video.path) });
    if (!put.ok) throw new PlatformError('youtube', `youtube upload ${put.status}`, put.status >= 500); const j = (await put.json()) as { id: string }; onProgress?.(1, 'upload'); return { providerJobId: j.id };
  },
  async pollStatus(id, token) {
    if (isMock()) return mockPoll('youtube', id);
    const j = await api<{ items: { status: { uploadStatus: string; failureReason?: string }; processingDetails?: { processingStatus: string } }[] }>('youtube', `https://www.googleapis.com/youtube/v3/videos?part=status,processingDetails&id=${id}`, { headers: { authorization: `Bearer ${token.accessToken}` } });
    const it = j.items?.[0]; if (!it) return { status: 'processing' }; if (it.status.uploadStatus === 'failed' || it.status.uploadStatus === 'rejected') return { status: 'failed', error: it.status.failureReason ?? it.status.uploadStatus };
    return it.status.uploadStatus === 'processed' ? { status: 'published', externalId: id, externalUrl: `https://www.youtube.com/shorts/${id}` } : { status: 'processing' };
  },
};
