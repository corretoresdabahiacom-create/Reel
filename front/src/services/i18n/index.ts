import type { Locale } from '../../types/phase5';
import { LOCALES } from '../../types/phase5';
import ptBR from '../../../locales/pt-BR.json';
import en from '../../../locales/en.json';
import es from '../../../locales/es.json';
/** i18n leve (sem dependências), com a mesma API conceitual do i18next: t(key, params), plural por `_one/_other`, `{{var}}`, fallback pt-BR.
 *  Para trocar por i18next/react-i18next basta manter os JSON em /locales (formato compatível). */
type Dict = Record<string, string>;
const DICTS: Record<Locale, Dict> = { 'pt-BR': ptBR as Dict, en: en as Dict, es: es as Dict };
export const DEFAULT_LOCALE: Locale = 'pt-BR';
export const RTL_LOCALES: string[] = ['ar', 'he', 'fa', 'ur']; // nenhum dos 3 atuais é RTL; pronto para expansão
export const isRtl = (l: string) => RTL_LOCALES.includes(l.split('-')[0]);
export const direction = (l: string): 'rtl' | 'ltr' => (isRtl(l) ? 'rtl' : 'ltr');
/** Detecta idioma do dispositivo (navigator.languages) e mapeia para um Locale suportado. */
export function detectLocale(langs: readonly string[] = (typeof navigator !== 'undefined' ? navigator.languages : []) ?? []): Locale {
  for (const l of langs) { const low = l.toLowerCase(); if (low.startsWith('pt')) return 'pt-BR'; if (low.startsWith('es')) return 'es'; if (low.startsWith('en')) return 'en'; }
  return DEFAULT_LOCALE;
}
export const isLocale = (x: string): x is Locale => (LOCALES as string[]).includes(x);
function interpolate(s: string, p: Record<string, string | number>): string { return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k in p ? String(p[k]) : `{{${k}}}`)); }
export function translate(locale: Locale, key: string, params: Record<string, string | number> = {}): string {
  const d = DICTS[locale]; let k = key;
  // gênero/contexto: t('profile.welcome', { context: 'female' }) tenta `profile.welcome_female` antes da chave base
  if (typeof params.context === 'string' && `${key}_${params.context}` in d) k = `${key}_${params.context}`;
  if (typeof params.count === 'number') { const rule = new Intl.PluralRules(locale).select(params.count); const pk = `${key}_${rule}`; if (pk in d) k = pk; else if (`${key}_other` in d) k = `${key}_other`; }
  if (typeof params.count === 'number' && params.count === 0 && `${key}_zero` in d) k = `${key}_zero`;
  const raw = d[k] ?? DICTS[DEFAULT_LOCALE][k] ?? key; // fallback: pt-BR → a própria chave (visível em QA)
  return interpolate(raw, params);
}
export const missingKeys = (locale: Locale): string[] => Object.keys(DICTS[DEFAULT_LOCALE]).filter((k) => !(k in DICTS[locale]));
export { formatCurrency, formatDate, formatNumber, formatRelative, currencyFor } from './format';
