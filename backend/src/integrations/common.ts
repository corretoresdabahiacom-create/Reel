import { createHmac } from 'node:crypto';
import { env } from '../config/env.js';
import { PlatformError, type PublishMeta, type Validation } from './types.js';
import type { PlatformId } from '../utils/validate.js';

export const isMock = () => env.PLATFORM_MODE === 'mock';
export const MB = 1024 * 1024;
export const hashtags = (m: PublishMeta) => (m.hashtags ?? []).map((h) => (h.startsWith('#') ? h : '#' + h)).join(' ');
export const form = (o: Record<string, string | undefined>) => new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined) as [string, string][]);
export const expires = (sec?: number) => (sec ? new Date(Date.now() + sec * 1000) : undefined);

/** fetch JSON com classificação de erro: 429/5xx = retryable; 4xx = definitivo. */
export async function api<T>(platform: PlatformId, url: string, init: RequestInit = {}): Promise<T> {
  let r: Response; try { r = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) }); } catch (e) { throw new PlatformError(platform, `rede: ${(e as Error).message}`, true, 'network'); }
  const text = await r.text(); let j: unknown; try { j = text ? JSON.parse(text) : {}; } catch { j = { raw: text }; }
  if (!r.ok) throw new PlatformError(platform, `${platform} ${r.status}: ${JSON.stringify(j).slice(0, 300)}`, r.status === 429 || r.status >= 500, r.status === 401 ? 'unauthorized' : 'http_' + r.status);
  return j as T;
}
export function checkRules(platform: PlatformId, v: { bytes: number; durationSec: number; width: number; height: number }, r: { maxSec: number; minSec?: number; maxBytes: number; minHeight?: number; vertical: boolean }): Validation {
  const errors: string[] = [], warnings: string[] = [];
  if (v.durationSec > r.maxSec + 0.5) errors.push(`duração ${v.durationSec.toFixed(1)}s acima do máximo de ${r.maxSec}s`);
  if (r.minSec && v.durationSec < r.minSec) errors.push(`duração ${v.durationSec.toFixed(1)}s abaixo do mínimo de ${r.minSec}s`);
  if (v.bytes > r.maxBytes) errors.push(`arquivo de ${(v.bytes / MB).toFixed(1)} MB acima do máximo de ${(r.maxBytes / MB).toFixed(0)} MB`);
  if (r.minHeight && Math.max(v.width, v.height) < r.minHeight) errors.push(`resolução abaixo de ${r.minHeight}p`);
  if (r.vertical && v.height <= v.width) warnings.push('vídeo não é vertical (9:16)');
  return { ok: errors.length === 0, errors, warnings };
}
export const mockId = (p: string) => `mock-${p}-${Math.random().toString(36).slice(2, 10)}`;
/** Falha injetável nos testes: MOCK_PLATFORM_FAIL=tiktok (retryable) ou tiktok:fatal. */
export function mockFault(p: PlatformId): void { const f = process.env.MOCK_PLATFORM_FAIL; if (!f) return; const [pl, mode] = f.split(':'); if (pl === p) throw new PlatformError(p, 'falha simulada da plataforma (mock)', mode !== 'fatal', 'mock_fault'); }
export const hmac = (key: string, data: string) => createHmac('sha256', key).update(data).digest('hex');
export const mockTokens = (p: string, code: string) => ({ accessToken: `mock-at-${p}-${code}`, refreshToken: `mock-rt-${p}-${code}`, expiresAt: expires(7200), scope: 'mock', externalUserId: `mock-${p}-user`, handle: `@mock_${p}` });
export const mockPoll = (p: string, id: string) => ({ status: 'published' as const, externalId: id, externalUrl: `https://mock.${p}.example/v/${id}` });
