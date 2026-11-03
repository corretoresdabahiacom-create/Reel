import { BACKEND_URL } from './config';
import { isExpired, refreshAccessToken, connectWithPopup } from './oauth';
import { http, log } from './http';
import { PlatformError, type AuthToken, type Platform, type ProgressFn, type PublishMetadata, type ValidationResult, type VideoFile, type Adaptation } from './types';

export const MB = 1024 * 1024;
export const tags = (m: PublishMetadata) => (m.hashtags ?? []).map((h) => (h.startsWith('#') ? h : '#' + h)).join(' ');
export const connectFlow = (p: Platform) => () => connectWithPopup(p);
export const refreshFlow = (p: Platform) => (t: AuthToken) => refreshAccessToken(p, t);

/** Garante token válido (renova se expirou). Quem chama deve persistir o token novo. */
export async function ensureFresh(p: Platform, t: AuthToken): Promise<AuthToken> {
  return isExpired(t) ? refreshAccessToken(p, t) : t;
}

/** Limites de vídeo por plataforma. Valores marcados "verify" vêm do prompt da Fase 3 e ainda não foram confirmados em documentação oficial. */
export interface VideoRules { maxSec: number; minSec?: number; maxBytes: number; vertical: boolean }
export function checkVideo(p: Platform, v: VideoFile, r: VideoRules): ValidationResult {
  const errors: string[] = []; const adaptations: Adaptation[] = [];
  if (v.mime !== 'video/mp4') adaptations.push({ kind: 'transcode', from: v.mime, to: 'MP4/H.264', description: 'Converter para MP4 (H.264 + AAC)' });
  if (r.vertical && v.height <= v.width) adaptations.push({ kind: 'resize', from: `${v.width}×${v.height}`, to: '1080×1920', description: 'Recortar para vertical 9:16' });
  else if (v.width !== 1080 || v.height !== 1920) adaptations.push({ kind: 'resize', from: `${v.width}×${v.height}`, to: '1080×1920', description: 'Ajustar para 1080×1920' });
  if (v.durationSec > r.maxSec) adaptations.push({ kind: 'trim', from: `${v.durationSec}s`, to: `${r.maxSec}s`, description: `Reduzir para no máx. ${r.maxSec}s` });
  if (r.minSec && v.durationSec < r.minSec) errors.push(`Vídeo curto demais (mín. ${r.minSec}s).`);
  if (v.sizeBytes > r.maxBytes) adaptations.push({ kind: 'compress', from: `${(v.sizeBytes / MB).toFixed(0)}MB`, to: `≤${(r.maxBytes / MB).toFixed(0)}MB`, description: `Comprimir para ≤ ${(r.maxBytes / MB).toFixed(0)}MB` });
  return { valid: errors.length === 0, errors, warnings: [], adaptations };
}
export const need = (cond: boolean, msg: string, errors: string[]) => { if (!cond) errors.push(msg); };
export const finish = (base: ValidationResult, errors: string[], warnings: string[] = []): ValidationResult => ({ ...base, errors: [...base.errors, ...errors], warnings: [...base.warnings, ...warnings], valid: base.errors.length + errors.length === 0 });

/** Chama o backend para operações que exigem segredo ou upload de arquivo grande. */
export async function backend<T>(p: Platform, path: string, token: AuthToken, body: unknown, label: string): Promise<T> {
  return http<T>(`${BACKEND_URL}/api/${p}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token.accessToken}` }, body: JSON.stringify(body) }, { platform: p, label });
}
export const noop: ProgressFn = () => undefined;
export { log, PlatformError };
