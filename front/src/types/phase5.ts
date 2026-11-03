/** Tipos da Fase 5 (estendem User/Project/TemplateExtended das fases anteriores). */
export type Locale = 'pt-BR' | 'en' | 'es';
export type Region = 'LATAM' | 'EU' | 'US';
export const LOCALES: Locale[] = ['pt-BR', 'en', 'es'];
export interface LocalizedVersion { locale: Locale; videoUrl: string; subtitlesUrl: string; audioUrl: string; createdAt: string; status: 'processing' | 'ready' | 'failed' }
/** Módulo 0: tipos novos (voz clonada, imagem de pessoa real, avatar ao vivo, provedor externo) — só ampliam a união. */
export type ConsentType = 'cookies' | 'ai' | 'marketing' | 'terms' | 'voice_clone' | 'person_image' | 'avatar_live' | 'external_provider';
export interface ConsentRecord { id: string; userId: string; type: ConsentType; version: string; acceptedAt: string; revokedAt?: string; ip?: string; verifiedAt?: string }
export interface DataExportRequest { id: string; userId: string; status: 'processing' | 'completed' | 'failed'; requestedAt: string; completedAt?: string; downloadUrl?: string }
export interface DeletionRequest { id: string; userId: string; status: 'pending' | 'scheduled' | 'cancelled' | 'completed'; scheduledFor: string; completedAt?: string }
export interface FeatureFlag { key: string; description: string; enabled: boolean; rolloutPercent: number; regions?: Region[]; plans?: Array<'free' | 'pro' | 'business'>; updatedAt: string; updatedBy: string }
export interface AuditLog { id: string; actorId: string; action: string; targetType: string; targetId: string; metadata: Record<string, unknown>; createdAt: string }
export interface AppBuild { version: string; buildNumber: number; platform: 'ios' | 'android' | 'web'; releasedAt: string; changelog: string; rolloutPercent: number }
/** Extensões: User.locale, User.consents, User.deletionScheduledFor; Project.localizedVersions, Project.sourceLocale; TemplateExtended.locale. */
export interface UserPhase5 { locale: Locale; region: Region; consents: ConsentType[]; deletionScheduledFor?: string }
export interface ProjectPhase5 { localizedVersions: LocalizedVersion[]; sourceLocale: Locale }
export const RETENTION_DAYS = { rawVideos: 90, logs: 30, auditLogs: 365, deletionGrace: 30 } as const;
