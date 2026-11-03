import type { PlatformId } from '../utils/validate.js';
export interface OAuthTokens { accessToken: string; refreshToken?: string; expiresAt?: Date; scope?: string; externalUserId?: string; handle?: string }
export interface VideoInfo { path: string; bytes: number; durationSec: number; width: number; height: number; publicUrl?: string; youtubeUrl?: string }
export interface PublishMeta { title?: string; caption?: string; description?: string; hashtags?: string[]; privacy?: string; visibility?: string; category?: string; listingId?: string; price?: number; collab?: string; [k: string]: unknown }
export interface Validation { ok: boolean; errors: string[]; warnings: string[] }
export type PollResult = { status: 'processing' | 'published' | 'failed'; externalId?: string; externalUrl?: string; error?: string };
export class PlatformError extends Error { constructor(public platform: PlatformId, message: string, public retryable = false, public code = 'platform_error') { super(message); } }

export interface OAuthApi {
  getAuthUrl(state: string, ctx: { codeChallenge?: string; redirectUri: string }): string | Promise<string>;
  exchangeCode(code: string, ctx: { codeVerifier?: string; redirectUri: string; shopId?: string }): Promise<OAuthTokens>;
  refreshToken(refreshToken: string, ctx?: { externalUserId?: string }): Promise<OAuthTokens>;
  revokeToken(token: string): Promise<void>;
}
export interface PublishApi {
  rules: { maxSec: number; minSec?: number; maxBytes: number; minHeight?: number; vertical: boolean; usesPublicUrl?: boolean };
  validate(video: Pick<VideoInfo, 'bytes' | 'durationSec' | 'width' | 'height'>, meta: PublishMeta): Validation;
  /** Envia o vídeo e devolve o id do job/post no provedor (persistido antes de qualquer polling → retry nunca duplica o post). */
  upload(video: VideoInfo, meta: PublishMeta, token: OAuthTokens, onProgress?: (p: number, stage: string) => void): Promise<{ providerJobId: string }>;
  pollStatus(providerJobId: string, token: OAuthTokens, meta: PublishMeta): Promise<PollResult>;
}
export interface WebhookApi {
  verify(headers: Record<string, string | string[] | undefined>, raw: Buffer): boolean;
  parse(body: unknown): { eventId: string; type: string; externalId?: string; status?: string } | null;
}
export interface PlatformModule { id: PlatformId; oauth: OAuthApi; publish: PublishApi; webhooks?: WebhookApi }
