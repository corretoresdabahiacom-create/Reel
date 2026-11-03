import { z } from 'zod';
import { AppError } from '../../utils/errors.js';
import { residencyFor, JURISDICTIONS, jurisdictionFor } from '../compliance/matrix.js';
/**
 * Perfil de internacionalização profunda (Fase 8) — fonte única que o app/backoffice consulta para localizar formato de vídeo, plataformas dominantes, pacote de música, pagamentos/impostos,
 * suporte e nota regulatória. É CONFIGURAÇÃO (revisada por jurídico/produto); docs/INTERNATIONALIZATION/MATRIX.md é a versão legível e `tests` garantem que as duas não divergem.
 * Os "music packs" são IDENTIFICADORES de pacotes a licenciar — nenhum conteúdo musical está incluso.
 */
export interface I18nProfile {
  locale: string; country: string; language: string; videoFormats: string[]; dominantPlatforms: string[]; musicPackIds: string[]; culturalNotes: string[];
  payments: { methods: string[]; currency: string; taxName: string; taxPct: number | null; invoiceRequired: boolean }; support: { channels: string[]; hours: string; firstResponseSlaHours: number; language: string };
  aiRegulation: string[]; residency: 'BR' | 'US' | 'EU' | 'CA'; dsarDays: number | null; rtl: boolean;
}
const BASE_FORMATS = ['9:16 1080x1920 ≤60s', '1:1 1080x1080 ≤60s (marketplaces)'];
export const PROFILES: I18nProfile[] = [
  { locale: 'pt-BR', country: 'BR', language: 'Português (Brasil)', videoFormats: BASE_FORMATS, dominantPlatforms: ['tiktok', 'instagram', 'youtube', 'shopee', 'mercadolivre', 'olx'], musicPackIds: ['br-pop-instrumental', 'br-funk-instrumental', 'br-sertanejo-instrumental'], culturalNotes: ['Feriados: Black Friday, Dia das Mães, Dia dos Namorados', 'Tom informal; evitar espanhol neutro nas legendas'], payments: { methods: ['pix', 'cartao', 'boleto'], currency: 'BRL', taxName: 'ISS/PIS/COFINS', taxPct: null, invoiceRequired: true }, support: { channels: ['chat', 'email', 'whatsapp'], hours: '24x7 (follow-the-sun)', firstResponseSlaHours: 4, language: 'pt-BR' }, aiRegulation: ['LGPD art. 20 (revisão de decisões automatizadas)', 'PL 2338/2023 (marco de IA) — acompanhar'], residency: 'BR', dsarDays: 15, rtl: false },
  { locale: 'es-MX', country: 'MX', language: 'Español (México)', videoFormats: BASE_FORMATS, dominantPlatforms: ['tiktok', 'instagram', 'youtube', 'mercadolivre'], musicPackIds: ['mx-regional-instrumental', 'latin-pop-instrumental'], culturalNotes: ['Buen Fin (nov), Día de Muertos, Día de las Madres (10 mai)', 'Marketplace foco: Mercado Libre México; confirmar disponibilidade de Shopee/OLX/Temu no MX antes do lançamento (não assumir)'], payments: { methods: ['oxxo', 'spei', 'tarjeta'], currency: 'MXN', taxName: 'IVA', taxPct: 16, invoiceRequired: true }, support: { channels: ['chat', 'email', 'whatsapp'], hours: '24x7 (follow-the-sun)', firstResponseSlaHours: 4, language: 'es-MX' }, aiRegulation: ['LFPDPPP (lei federal de proteção de dados; reformada em 2025 — validar texto e autoridade vigentes com advogado local)', 'Sem lei de IA em vigor conhecida — acompanhar iniciativas legislativas'], residency: 'US', dsarDays: 20 /* dias úteis — validar */, rtl: false },
  { locale: 'es', country: 'ES', language: 'Español (España)', videoFormats: BASE_FORMATS, dominantPlatforms: ['tiktok', 'instagram', 'youtube'], musicPackIds: ['es-pop-instrumental'], culturalNotes: ['Rebajas (jan/jul), Black Friday'], payments: { methods: ['tarjeta', 'sepa', 'bizum'], currency: 'EUR', taxName: 'IVA', taxPct: 21, invoiceRequired: true }, support: { channels: ['chat', 'email'], hours: '24x7 (follow-the-sun)', firstResponseSlaHours: 4, language: 'es' }, aiRegulation: ['EU AI Act art. 50 (transparência) — marca visível "Gerado por IA"', 'GDPR / DSA'], residency: 'EU', dsarDays: 30, rtl: false },
  { locale: 'en', country: 'US', language: 'English (US)', videoFormats: BASE_FORMATS, dominantPlatforms: ['tiktok', 'instagram', 'youtube', 'temu'], musicPackIds: ['us-pop-instrumental', 'us-hiphop-instrumental'], culturalNotes: ['Black Friday/Cyber Monday, Prime Day, Back to School'], payments: { methods: ['card', 'apple_pay', 'google_pay'], currency: 'USD', taxName: 'Sales tax (por estado)', taxPct: null, invoiceRequired: false }, support: { channels: ['chat', 'email'], hours: '24x7 (follow-the-sun)', firstResponseSlaHours: 8, language: 'en' }, aiRegulation: ['CCPA/CPRA', 'Leis estaduais de IA (ex.: Colorado AI Act) — acompanhar', 'FTC: disclosure de endorsements'], residency: 'US', dsarDays: 45, rtl: false },
  { locale: 'en', country: 'GB', language: 'English (UK)', videoFormats: BASE_FORMATS, dominantPlatforms: ['tiktok', 'instagram', 'youtube'], musicPackIds: ['uk-pop-instrumental'], culturalNotes: ['Boxing Day, Black Friday'], payments: { methods: ['card', 'apple_pay', 'bacs'], currency: 'GBP', taxName: 'VAT', taxPct: 20, invoiceRequired: true }, support: { channels: ['chat', 'email'], hours: '24x7 (follow-the-sun)', firstResponseSlaHours: 8, language: 'en' }, aiRegulation: ['UK GDPR', 'Online Safety Act'], residency: 'EU', dsarDays: 30, rtl: false },
];
const FALLBACK_BY_LANG: Record<string, string> = { 'pt-BR': 'BR', es: 'ES', 'es-MX': 'MX', en: 'US' };
export const profileQuery = z.object({ locale: z.enum(['pt-BR', 'en', 'es', 'es-MX']), country: z.string().length(2).toUpperCase().optional() });
export function resolveProfile(locale: string, country?: string): I18nProfile {
  const c = (country ?? FALLBACK_BY_LANG[locale] ?? 'US').toUpperCase();
  const exact = PROFILES.find((p) => p.country === c && p.locale === locale) ?? PROFILES.find((p) => p.country === c);
  if (exact) return { ...exact, residency: residencyFor(exact.country) };
  // País sem perfil dedicado: herda o perfil do idioma, mas com residência/DSAR pela jurisdição real do país.
  const base = PROFILES.find((p) => p.locale === locale && p.country === FALLBACK_BY_LANG[locale]);
  if (!base) throw new AppError(404, 'not_found', 'Perfil inexistente');
  const j = jurisdictionFor(c); const dsarDays = j?.dsarDays ?? base.dsarDays; const residency = residencyFor(c);
  return { ...base, country: c, residency, dsarDays, aiRegulation: [...(j ? [j.law] : []), ...base.aiRegulation], culturalNotes: [...base.culturalNotes, `Perfil herdado de ${base.country}: revisar localmente antes do lançamento em ${c}`] };
}
/** Cobertura: toda jurisdição da matriz de compliance precisa de perfil de país OU herdar de idioma — usado em teste de regressão. */
export const coverage = () => JURISDICTIONS.map((j) => ({ law: j.code, countries: j.countries.map((c) => ({ country: c, dedicatedProfile: PROFILES.some((p) => p.country === c) }))}));
