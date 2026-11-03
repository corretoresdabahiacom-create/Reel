/** Tipos comuns das integrações (Fase 3). */
export type Platform = 'tiktok' | 'youtube' | 'instagram' | 'shopee' | 'temu' | 'olx' | 'mercadolivre';
export const PLATFORM_IDS: Platform[] = ['tiktok', 'youtube', 'instagram', 'shopee', 'temu', 'olx', 'mercadolivre'];

/** Token OAuth. `expiresAt` em epoch ms. Tokens só vivem no backend (ou em memória); nunca em localStorage. */
export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  scope?: string;
  externalUserId?: string;
  handle?: string;
}

export interface ConnectedAccount extends AuthToken {
  id: string;
  userId: string;
  platform: Platform;
  connectedAt: string;
  lastSyncAt: string;
}

export interface VideoFile {
  url: string;
  durationSec: number;
  sizeBytes: number;
  width: number;
  height: number;
  mime: string;
}

export type Privacy = 'public' | 'friends' | 'private';
export type Visibility = 'public' | 'unlisted' | 'private';

export interface PublishMetadata {
  title?: string;
  description?: string;
  caption?: string;
  hashtags?: string[];
  privacy?: Privacy; // TikTok
  visibility?: Visibility; // YouTube
  collaborators?: string[]; // Instagram (@usuarios)
  category?: string;
  price?: number;
  listingId?: string; // Shopee/Temu/Mercado Livre: ID do anúncio
  youtubeUrl?: string; // OLX: link do YouTube (preenchido pelo upload automático)
}

export type JobStatus = 'pending' | 'uploading' | 'processing' | 'published' | 'failed';

export interface PublicationJob {
  id: string;
  projectId: string;
  platform: Platform;
  status: JobStatus;
  progress: number; // 0..1, individual por plataforma
  stage?: string;
  externalUrl?: string;
  error?: string;
  retryCount: number;
  createdAt: string;
}

export interface PlatformConfig {
  platform: Platform;
  clientId: string; // público; o client secret fica só no backend
  scopes: string[];
  redirectUri: string;
  apiVersion: string;
  authUrl: string;
  apiBase: string;
  extraAuthParams?: Record<string, string>;
  /** true quando a URL de autorização precisa de assinatura do servidor (Shopee, parceiros). */
  authUrlFromBackend?: boolean;
}

export class PlatformError extends Error {
  constructor(
    public platform: Platform,
    public code: string,
    message: string,
    public retryable = false,
    public retryAfterSec?: number,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

export interface Adaptation {
  kind: 'trim' | 'compress' | 'resize' | 'transcode';
  from: string;
  to: string;
  description: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[]; // impedem o envio
  warnings: string[]; // avisos (ex.: app não auditado)
  adaptations: Adaptation[]; // o que o videoAdapter vai corrigir antes do envio
}

export type ProgressFn = (progress: number, stage: string) => void;

export interface PublishResult {
  status: 'published' | 'failed';
  url?: string;
  externalId?: string;
  error?: PlatformError;
}

/** Contrato que toda plataforma implementa. */
export interface PlatformIntegration {
  platform: Platform;
  connect(): Promise<AuthToken>;
  refresh(token: AuthToken): Promise<AuthToken>;
  publish(videoUrl: string, metadata: PublishMetadata, token: AuthToken, onProgress?: ProgressFn): Promise<PublishResult>;
  validate(video: VideoFile, metadata: PublishMetadata): ValidationResult;
}
