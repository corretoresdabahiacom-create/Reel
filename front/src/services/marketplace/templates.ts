import { pct, type Dispute, type Settings, type TemplateExtended, type TemplatePurchase, type TemplateReview, type User } from '../../types/phase4';

/** Repositório plugável (Postgres em produção). */
export interface MarketDb { users: User[]; templates: TemplateExtended[]; purchases: TemplatePurchase[]; reviews: TemplateReview[]; disputes: Dispute[] }
const id = () => Math.random().toString(36).slice(2, 10);
const now = () => new Date().toISOString();
const user = (db: MarketDb, uid: string) => { const u = db.users.find((x) => x.id === uid); if (!u) throw new Error('Usuário não encontrado.'); return u; };
const tpl = (db: MarketDb, tid: string) => { const t = db.templates.find((x) => x.id === tid); if (!t) throw new Error('Template não encontrado.'); return t; };

export interface ListFilter { category?: string; price?: 'free' | 'paid'; sort?: 'popular' | 'recent' | 'rating'; q?: string }
export function listTemplates(db: MarketDb, f: ListFilter = {}): TemplateExtended[] {
  const q = (f.q ?? '').toLowerCase();
  let r = db.templates.filter((t) => t.moderationStatus === 'approved')
    .filter((t) => !f.category || f.category === 'Todos' || t.category === f.category)
    .filter((t) => !f.price || (f.price === 'free' ? t.priceCredits === 0 : t.priceCredits > 0))
    .filter((t) => !q || t.name.toLowerCase().includes(q) || t.tags.some((x) => x.toLowerCase().includes(q)));
  if (f.sort === 'popular') r = r.sort((a, b) => b.usageCount - a.usageCount);
  else if (f.sort === 'rating') r = r.sort((a, b) => b.ratingAvg - a.ratingAvg);
  else if (f.sort === 'recent') r = r.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return r;
}
export const getTemplate = tpl;
export const ownsTemplate = (db: MarketDb, uid: string, t: TemplateExtended) => t.priceCredits === 0 || t.creatorId === uid || db.purchases.some((p) => p.templateId === t.id && p.buyerId === uid);

/** Compra: o comprador paga o preço cheio; 20% (configurável) ficam com o app e 80% vão em créditos ao criador. Valores inteiros. */
export function purchaseTemplate(db: MarketDb, st: Settings, buyerId: string, templateId: string): TemplatePurchase {
  const t = tpl(db, templateId); const buyer = user(db, buyerId); const creator = user(db, t.creatorId);
  if (t.moderationStatus !== 'approved') throw new Error('Template indisponível.');
  if (ownsTemplate(db, buyerId, t)) throw new Error('Você já possui este template.');
  if (buyer.credits < t.priceCredits) throw new Error('Créditos insuficientes.');
  const fee = pct(t.priceCredits, st.marketplaceFeePct); const share = t.priceCredits - fee;
  buyer.credits -= t.priceCredits; creator.credits += share; // TODO: saque em dinheiro do criador via gateway (Stripe Connect / Mercado Pago)
  const p: TemplatePurchase = { id: id(), templateId, buyerId, priceCredits: t.priceCredits, creatorShareCredits: share, feeCredits: fee, createdAt: now() };
  db.purchases.push(p); t.usageCount += 1; return p;
}
export function publishTemplate(db: MarketDb, creator: User, t: Omit<TemplateExtended, 'id' | 'ratingAvg' | 'ratingCount' | 'usageCount' | 'moderationStatus' | 'createdAt' | 'creatorId'>): TemplateExtended {
  if (creator.plan === 'free') throw new Error('Publicar templates exige plano Pro ou Business.');
  if (t.sceneStructure.length < 3) throw new Error('O template precisa de pelo menos 3 cenas.');
  const n: TemplateExtended = { ...t, id: id(), creatorId: creator.id, ratingAvg: 0, ratingCount: 0, usageCount: 0, moderationStatus: 'pending', createdAt: now() };
  db.templates.push(n); return n; // entra na fila de moderação do Admin
}
export function approveTemplate(db: MarketDb, templateId: string): TemplateExtended { const t = tpl(db, templateId); t.moderationStatus = 'approved'; t.rejectionReason = undefined; return t; }
export function rejectTemplate(db: MarketDb, templateId: string, reason: string): TemplateExtended {
  if (!reason.trim()) throw new Error('O motivo da rejeição é obrigatório.');
  const t = tpl(db, templateId); t.moderationStatus = 'rejected'; t.rejectionReason = reason.trim(); return t;
}
/** Só quem comprou (ou usa um template gratuito) avalia, uma vez por template; a média é recalculada. */
export function rateTemplate(db: MarketDb, userId: string, templateId: string, stars: 1 | 2 | 3 | 4 | 5, comment: string): TemplateReview {
  const t = tpl(db, templateId);
  if (t.creatorId === userId) throw new Error('Você não pode avaliar o próprio template.');
  if (!ownsTemplate(db, userId, t)) throw new Error('Compre o template para avaliar.');
  if (db.reviews.some((r) => r.templateId === templateId && r.userId === userId)) throw new Error('Você já avaliou este template.');
  const r: TemplateReview = { id: id(), templateId, userId, stars, comment, createdAt: now() };
  db.reviews.push(r); t.ratingAvg = Math.round(((t.ratingAvg * t.ratingCount + stars) / (t.ratingCount + 1)) * 10) / 10; t.ratingCount += 1; return r;
}
