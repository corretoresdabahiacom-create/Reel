import type { Locale, Region } from '../../types/phase5';
export const currencyFor = (region: Region): 'BRL' | 'USD' | 'EUR' => (region === 'EU' ? 'EUR' : region === 'US' ? 'USD' : 'BRL');
/** Valores guardados em centavos (regra do projeto). Impostos: STUB — em produção usar Stripe Tax / tabela por país (IVA UE, sales tax US). */
export const formatCurrency = (cents: number, locale: Locale, currency: 'BRL' | 'USD' | 'EUR' = 'BRL') => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
export const formatNumber = (n: number, locale: Locale, opts?: Intl.NumberFormatOptions) => new Intl.NumberFormat(locale, opts).format(n);
export const formatDate = (d: Date | string | number, locale: Locale, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) => new Intl.DateTimeFormat(locale, opts).format(new Date(d));
export function formatRelative(d: Date | string | number, locale: Locale, now = Date.now()): string {
  const diff = (new Date(d).getTime() - now) / 1000; const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const steps: Array<[Intl.RelativeTimeFormatUnit, number]> = [['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, s] of steps) if (Math.abs(diff) >= s) return rtf.format(Math.round(diff / s), u);
  return rtf.format(Math.round(diff), 'second');
}
/** Preço por região (stub): conversão fixa só para demonstração. TODO: tabela de preços por mercado (App Store/Play Billing locais) em vez de câmbio. */
export const PRICE_BRL_CENTS = { pro: 4900, business: 19900 } as const;
export const FX: Record<'BRL' | 'USD' | 'EUR', number> = { BRL: 1, USD: 0.18, EUR: 0.17 };
export const TAX_RATE: Record<Region, number> = { LATAM: 0, US: 0, EU: 0.21 }; // STUB (IVA médio UE)
export function priceFor(plan: keyof typeof PRICE_BRL_CENTS, region: Region, locale: Locale) { const cur = currencyFor(region); const net = Math.round(PRICE_BRL_CENTS[plan] * FX[cur]); const tax = Math.round(net * TAX_RATE[region]); return { currency: cur, net, tax, total: net + tax, label: formatCurrency(net + tax, locale, cur) }; }
