/**
 * Tipos de consentimento (Módulo 0). Espelham o CHECK de `consents.type` (migration 0008) e o `ConsentType` do frontend.
 * Os 4 primeiros são os da Fase 5 e seguem aceitos pela API pública (`POST /users/me/consents`). Os demais são gravados
 * pelo fluxo próprio de cada módulo, atrás da flag correspondente: `voice_clone` pelo Módulo 1 (`ff_audio`),
 * `person_image` pelo 3, `avatar_live` pelo 10 e `external_provider` por qualquer módulo que envie mídia a um provedor externo.
 */
export const LEGACY_CONSENT_TYPES = ['cookies', 'ai', 'marketing', 'terms'] as const;
export const SENSITIVE_CONSENT_TYPES = ['voice_clone', 'person_image', 'avatar_live', 'external_provider'] as const;
export type LegacyConsentType = (typeof LEGACY_CONSENT_TYPES)[number];
export type SensitiveConsentType = (typeof SENSITIVE_CONSENT_TYPES)[number];
export type ConsentType = LegacyConsentType | SensitiveConsentType;
