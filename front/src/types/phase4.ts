/** Tipos da Fase 4. Estendem (sem quebrar) User/Project/Template/Publication/Transaction das fases 1–3. */
export type Plan = 'free' | 'pro' | 'business';
export interface User { id: string; name: string; email: string; plan: Plan; credits: number; affiliateBalanceCents: number; isAdmin: boolean; banned?: boolean; lastActiveAt: string; createdAt: string }

export type ItemStatus = 'pending' | 'generating' | 'ready' | 'error';
export interface Catalog { id: string; ownerId: string; name: string; description: string; niche: string; itemCount: number; status: 'draft' | 'generating' | 'ready' | 'partial'; defaultTemplateId?: string; createdAt: string; updatedAt: string }
export interface CatalogItem { id: string; catalogId: string; name: string; description: string; price: number; category: string; sku: string; photoUrls: string[]; projectId?: string; status: ItemStatus; error?: string; retried?: boolean }
export interface BatchJob { id: string; type: 'generation' | 'publication'; catalogId: string; totalItems: number; completedItems: number; failedItems: number; status: 'queued' | 'running' | 'paused' | 'done'; createdAt: string; finishedAt?: string }

export type Moderation = 'draft' | 'pending' | 'approved' | 'rejected';
export interface SceneStructure { label: string; durationSec: number; referenceMode: 'product' | 'person' | 'both' }
export interface TemplateExtended { id: string; name: string; category: string; description: string; tags: string[]; previewUrl: string; sceneStructure: SceneStructure[]; promptHints: string[]; voiceId: string; trackId: string; captionStyle: string; priceCredits: number; creatorId: string; ratingAvg: number; ratingCount: number; usageCount: number; moderationStatus: Moderation; rejectionReason?: string; createdAt: string }
export interface TemplatePurchase { id: string; templateId: string; buyerId: string; priceCredits: number; creatorShareCredits: number; feeCredits: number; createdAt: string }
export interface TemplateReview { id: string; templateId: string; userId: string; stars: 1 | 2 | 3 | 4 | 5; comment: string; createdAt: string }

export type AffiliatePlatform = 'shopee' | 'mercadolivre';
export interface AffiliateAccount { id: string; userId: string; platform: AffiliatePlatform; externalUserId: string; /** token SEMPRE criptografado em repouso, só no backend */ token: string; connectedAt: string }
export interface AffiliateLink { id: string; publicationId: string; userId: string; platform: AffiliatePlatform; originalUrl: string; trackingUrl: string; priceCents: number; clicks: number; conversions: number; commissionCents: number; /** parcela do mês corrente */ monthCents?: number; feeCents: number; status: 'active' | 'disabled' }
export interface PayoutRequest { id: string; userId: string; amountCents: number; status: 'pending' | 'approved' | 'paid' | 'rejected'; requestedAt: string; processedAt?: string; reason?: string }

export interface FeatureFlag { key: string; value: boolean; updatedAt: string }
export interface Settings { marketplaceFeePct: number; affiliateFeePct: number; minPayoutCents: number; creditValueCents: number; planLimits: Record<Plan, number>; affiliateRates: Record<AffiliatePlatform, number> }
export interface AuditEntry { id: string; actorId: string; actorName: string; action: string; target: string; detail: string; at: string }
export interface Report { id: string; platform: string; projectTitle: string; userId: string; reason: string; status: 'open' | 'removed' | 'dismissed' }
export interface Dispute { id: string; purchaseId: string; buyerId: string; reason: string; status: 'open' | 'refunded' | 'denied' }

export const DEFAULT_SETTINGS: Settings = {
  marketplaceFeePct: 20, affiliateFeePct: 10, minPayoutCents: 5000, creditValueCents: 38,
  planLimits: { free: 3, pro: 40, business: 100 },
  affiliateRates: { shopee: 6, mercadolivre: 5 }, // TODO: verify — taxas reais variam por categoria
};
/** Inteiro em centavos: nunca use float para dinheiro. */
export const pct = (cents: number, p: number): number => Math.round((cents * p) / 100);
