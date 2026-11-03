/** Entrega de vídeo via CDN. Mock: URLs assinadas com HMAC fake e expiração. TODO real: CloudFront (signed URLs/cookies) ou Cloudflare Stream/Mux (HLS + thumbnails automáticos). */
export type ContentType = 'video' | 'thumbnail' | 'manifest' | 'segment' | 'subtitle';
/** Cache-Control por tipo: vídeos/segmentos são imutáveis (nome com hash); manifest HLS muda pouco; legendas revalidam. */
export const CACHE_CONTROL: Record<ContentType, string> = {
  video: 'public, max-age=31536000, immutable', segment: 'public, max-age=31536000, immutable', thumbnail: 'public, max-age=2592000, stale-while-revalidate=86400',
  manifest: 'public, max-age=60, stale-while-revalidate=300', subtitle: 'public, max-age=3600, must-revalidate',
};
const CDN_HOST = 'https://cdn.nexusreel.example'; // TODO: domínio real
const sig = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
export function getSignedUrl(assetId: string, ttlSec = 3600, now = Date.now()): { url: string; expiresAt: number } {
  const exp = Math.floor(now / 1000) + ttlSec; return { url: `${CDN_HOST}/v/${assetId}.mp4?exp=${exp}&sig=${sig(assetId + exp)}`, expiresAt: exp * 1000 };
}
export const isExpired = (u: { expiresAt: number }, now = Date.now(), skewMs = 30_000) => now + skewMs >= u.expiresAt;
export function verifySignedUrl(url: string, now = Date.now()): boolean { const m = /\/v\/(.+)\.mp4\?exp=(\d+)&sig=(\w+)/.exec(url); return !!m && Number(m[2]) * 1000 > now && sig(m[1] + m[2]) === m[3]; }
export interface HlsManifest { url: string; renditions: Array<{ name: string; bandwidth: number; height: number }>; available: boolean }
/** HLS (adaptativo) só quando o ativo já foi transcodificado; senão o player usa o MP4 assinado. */
export function getHlsManifest(assetId: string, transcoded: boolean): HlsManifest { return { url: `${CDN_HOST}/hls/${assetId}/master.m3u8`, available: transcoded, renditions: transcoded ? [{ name: '360p', bandwidth: 800_000, height: 640 }, { name: '720p', bandwidth: 2_500_000, height: 1280 }, { name: '1080p', bandwidth: 5_000_000, height: 1920 }] : [] }; }
export function getThumbnails(assetId: string, widths = [160, 320, 640]) { return widths.map((w) => ({ width: w, webp: `${CDN_HOST}/t/${assetId}_${w}.webp`, avif: `${CDN_HOST}/t/${assetId}_${w}.avif` })); }
export const thumbSrcSet = (assetId: string, fmt: 'webp' | 'avif' = 'webp') => getThumbnails(assetId).map((t) => `${t[fmt]} ${t.width}w`).join(', ');
export function getVideoMetadata(assetId: string) { return { assetId, durationSec: 60, width: 1080, height: 1920, codec: 'h264', bitrateKbps: 5000, sizeMB: 38, hls: false }; }
