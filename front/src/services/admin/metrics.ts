import type { Report, Settings, TemplateExtended, TemplatePurchase, User, PayoutRequest, AffiliateLink } from '../../types/phase4';

export const PLAN_PRICE_CENTS = { free: 0, pro: 4900, business: 19900 } as const; // espelha backend payments.service.ts PLANS + seed pricing_regions BR (fonte da verdade: backend)
export const getMRR = (users: User[]): number => users.filter((u) => !u.banned).reduce((a, u) => a + PLAN_PRICE_CENTS[u.plan], 0);
export const getActiveUsers = (users: User[], days = 30, now = Date.now()): number => users.filter((u) => !u.banned && now - new Date(u.lastActiveAt).getTime() <= days * 864e5).length;
export const getModerationQueue = (templates: TemplateExtended[], reports: Report[]) => ({ templates: templates.filter((t) => t.moderationStatus === 'pending'), reports: reports.filter((r) => r.status === 'open') });
/** Receita por fonte, em centavos. Marketplace = 20% retidos convertidos pelo valor do crédito; afiliados = taxa retida. */
export function getRevenueBySource(p: { users: User[]; purchases: TemplatePurchase[]; links: AffiliateLink[]; creditPurchasesCents: number }, st: Settings) {
  return {
    subscriptions: getMRR(p.users),
    credits: p.creditPurchasesCents,
    marketplace: p.purchases.reduce((a, x) => a + x.feeCredits * st.creditValueCents, 0),
    affiliates: p.links.reduce((a, l) => a + l.feeCents, 0),
  };
}
export const getPendingPayouts = (payouts: PayoutRequest[]) => payouts.filter((x) => x.status === 'pending' || x.status === 'approved');
