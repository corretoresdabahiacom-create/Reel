import { pct, type AffiliateLink, type AffiliatePlatform, type Settings, type User } from '../../types/phase4';

export interface AffiliateDb { users: User[]; links: AffiliateLink[] }
export const TRACKING_BASE = process.env.TRACKING_BASE_URL ?? 'https://app.nexusreel.com/r';
const id = () => Math.random().toString(36).slice(2, 10);

/** URL própria que registra o clique e redireciona para o link real (endpoint GET /r/:publicationId em server/index.ts). */
export const generateTrackingUrl = (publicationId: string): string => `${TRACKING_BASE}/${publicationId}`;

export function createAffiliateLink(db: AffiliateDb, p: { publicationId: string; userId: string; platform: AffiliatePlatform; originalUrl: string; priceCents: number }): AffiliateLink {
  if (!/^https:\/\//.test(p.originalUrl)) throw new Error('O link de afiliado precisa começar com https://');
  const l: AffiliateLink = { id: id(), ...p, trackingUrl: generateTrackingUrl(p.publicationId), clicks: 0, conversions: 0, commissionCents: 0, feeCents: 0, status: 'active' };
  db.links.push(l); return l;
}
/** Retorna a URL de destino para o redirect 302. TODO produção: deduplicar por IP/UA, ignorar bots, rate limit. */
export function recordClick(db: AffiliateDb, publicationId: string): string {
  const l = db.links.find((x) => x.publicationId === publicationId && x.status === 'active'); if (!l) throw new Error('Link inexistente.');
  l.clicks += 1; return l.originalUrl;
}
/** Comissão bruta = valor da venda × taxa da plataforma. O app retém affiliateFeePct; o restante vai ao saldo do usuário. Tudo em centavos. */
export function recordConversion(db: AffiliateDb, st: Settings, publicationId: string, saleCents?: number): { grossCents: number; netCents: number; feeCents: number } {
  const l = db.links.find((x) => x.publicationId === publicationId); if (!l) throw new Error('Link inexistente.');
  const gross = pct(saleCents ?? l.priceCents, st.affiliateRates[l.platform]); const fee = pct(gross, st.affiliateFeePct); const net = gross - fee;
  l.conversions += 1; l.commissionCents += net; l.feeCents += fee;
  const u = db.users.find((x) => x.id === l.userId); if (u) u.affiliateBalanceCents += net;
  return { grossCents: gross, netCents: net, feeCents: fee }; // TODO: conciliar com o relatório oficial de conversões das APIs de afiliados
}
export function getUserEarnings(db: AffiliateDb, userId: string) {
  const mine = db.links.filter((l) => l.userId === userId);
  const sum = (k: 'clicks' | 'conversions' | 'commissionCents') => mine.reduce((a, l) => a + l[k], 0);
  return { clicks: sum('clicks'), conversions: sum('conversions'), commissionCents: sum('commissionCents'), balanceCents: db.users.find((u) => u.id === userId)?.affiliateBalanceCents ?? 0, links: mine };
}
