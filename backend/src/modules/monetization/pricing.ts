import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { growthSettings } from '../growth/settings.js';
import type { Row } from '../../db/rows.generated.js';

export interface PricingRegion { region: string; countryCodes: string[]; currency: string; locale: string; proCents: number; businessCents: number; creditCents: number; packs: Array<{ id: string; credits: number; priceCents: number }>; taxPct: number; taxKind: string; taxInclusive: boolean; methods: string[]; pppIndex: number; annualDiscountPct: number }
const toRegion = (r: Record<string, any>): PricingRegion => ({ region: r.region, countryCodes: r.country_codes, currency: r.currency, locale: r.locale, proCents: r.plan_pro_price_cents, businessCents: r.plan_business_price_cents, creditCents: r.credits_price_cents, packs: r.credit_packs_json, taxPct: Number(r.tax_pct), taxKind: r.tax_kind, taxInclusive: r.tax_inclusive, methods: r.payment_methods, pppIndex: Number(r.ppp_index), annualDiscountPct: r.annual_discount_pct });
export async function pricingRegions(): Promise<PricingRegion[]> {
  const c = await redis.get('pricing:regions').catch(() => null); if (c) return JSON.parse(c);
  const rows = (await pool.query<Row<'pricing_regions'>>('SELECT * FROM pricing_regions WHERE active ORDER BY region')).rows.map(toRegion); await redis.set('pricing:regions', JSON.stringify(rows), 'EX', 60).catch(() => undefined); return rows;
}
export const invalidatePricing = () => redis.del('pricing:regions', 'pricing:fx').catch(() => undefined);
/** País → região de preço; sem país, cai pela região do usuário (LATAM→BR, EU→EU, US→US). */
export function resolveRegion(regs: PricingRegion[], o: { country?: string | null; userRegion?: string | null; region?: string }): PricingRegion {
  const by = (code: string) => regs.find((r) => r.region === code);
  if (o.region && by(o.region)) return by(o.region)!; const cc = o.country?.toUpperCase(); if (cc) { const hit = regs.find((r) => r.countryCodes.includes(cc)); if (hit) return hit; }
  return by(o.userRegion === 'EU' ? 'EU' : o.userRegion === 'US' ? 'US' : 'BR') ?? regs[0]!;
}
export interface Fx { brlPerMajor: number; exponent: number }
export async function fxRates(): Promise<Record<string, Fx>> {
  const c = await redis.get('pricing:fx').catch(() => null); if (c) return JSON.parse(c);
  const m = Object.fromEntries((await pool.query<Pick<Row<'fx_rates'>, 'currency' | 'brl_per_major' | 'exponent'>>('SELECT currency, brl_per_major, exponent FROM fx_rates')).rows.map((r) => [r.currency.trim(), { brlPerMajor: Number(r.brl_per_major), exponent: r.exponent as number }])); await redis.set('pricing:fx', JSON.stringify(m), 'EX', 300).catch(() => undefined); return m;
}
/** Valor em unidades menores da moeda → centavos de BRL (relatórios, atribuição, LTV). */
export async function toBrlCents(minor: number, currency: string): Promise<number> {
  if (currency === 'BRL') return Math.round(minor); const fx = (await fxRates())[currency]; if (!fx) throw new Error(`sem câmbio para ${currency}`); return Math.round((minor / 10 ** fx.exponent) * fx.brlPerMajor * 100);
}
export const EXPONENT: Record<string, number> = { IDR: 0, JPY: 0, KRW: 0, CLP: 0 };
export const exponentOf = (cur: string) => EXPONENT[cur] ?? 2;
export function formatMoney(minor: number, currency: string, locale: string): string { const e = exponentOf(currency); return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: e, maximumFractionDigits: e }).format(minor / 10 ** e); }
export type Item = { kind: 'plan'; plan: 'pro' | 'business'; billing?: 'monthly' | 'annual' } | { kind: 'credits'; packId: string };
export interface Quote { region: string; country: string | null; currency: string; locale: string; item: Item; subtotalMinor: number; taxMinor: number; iofMinor: number; totalMinor: number; netMinor: number; tax: { kind: string; pct: number; inclusive: boolean }; display: { subtotal: string; tax: string; iof: string; total: string; perMonth?: string }; methods: string[]; credits?: number }
/** Preço + imposto no checkout. Imposto incluso (padrão LATAM/EU/IN/SEA): tax = preço − preço/(1+t). Exclusivo (US): soma. IOF (placeholder) só em cobrança em moeda estrangeira para cartão brasileiro. */
export async function quote(regs: PricingRegion[], o: { item: Item; country?: string | null; userRegion?: string | null; region?: string; iofCountry?: string | null; priceRatio?: number }): Promise<Quote> {
  const r = resolveRegion(regs, o); let subtotal: number; let credits: number | undefined; let perMonth: number | undefined;
  if (o.item.kind === 'plan') { const raw = o.item.plan === 'pro' ? r.proCents : r.businessCents; const step = 10 ** exponentOf(r.currency) * (exponentOf(r.currency) === 0 ? 1000 : 1); const base = o.priceRatio && o.priceRatio !== 1 ? Math.max(step, Math.round((raw * o.priceRatio) / step) * step) : raw; if (o.item.billing === 'annual') { subtotal = Math.round((base * 12 * (100 - r.annualDiscountPct)) / 100); perMonth = Math.round(subtotal / 12); } else subtotal = base; }
  else { const p = r.packs.find((x) => x.id === (o.item as { packId: string }).packId); if (!p) throw new RangeError('pacote inexistente'); subtotal = p.priceCents; credits = p.credits; }
  const tax = r.taxInclusive ? Math.round(subtotal - subtotal / (1 + r.taxPct / 100)) : Math.round((subtotal * r.taxPct) / 100);
  const gs = await growthSettings(); const iof = (o.iofCountry ?? o.country)?.toUpperCase() === 'BR' && r.currency !== 'BRL' ? Math.round(((r.taxInclusive ? subtotal : subtotal + tax) * gs.iofPct) / 100) : 0;
  const total = (r.taxInclusive ? subtotal : subtotal + tax) + iof; const f = (n: number) => formatMoney(n, r.currency, r.locale);
  return { region: r.region, country: o.country ?? null, currency: r.currency, locale: r.locale, item: o.item, subtotalMinor: subtotal, taxMinor: tax, iofMinor: iof, totalMinor: total, netMinor: subtotal - (r.taxInclusive ? tax : 0), tax: { kind: r.taxKind, pct: r.taxPct, inclusive: r.taxInclusive },
    display: { subtotal: f(subtotal), tax: f(tax), iof: f(iof), total: f(total), ...(perMonth ? { perMonth: f(perMonth) } : {}) }, methods: r.methods, ...(credits ? { credits } : {}) };
}
