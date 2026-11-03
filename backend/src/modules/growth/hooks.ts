import { residencyService } from '../residency/residency.js';
import { pool } from '../../db/pool.js';
import { logger } from '../../observability/logger.js';
import { track } from '../analytics/analytics.service.js';
import { attributionService, type TouchInput } from '../attribution/attribution.service.js';
import { referralsService, deviceHash } from '../referrals/referrals.service.js';
import { partnersService } from '../partners/partners.service.js';
import { toBrlCents } from '../monetization/pricing.js';
import type { Row } from '../../db/rows.generated.js';

/** Ganchos de growth chamados pelos módulos existentes. Nunca lançam: crescimento/analytics jamais derrubam o fluxo de negócio. */
const safe = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e) { logger.warn({ hook: label, err: (e as Error).message }, 'gancho de growth falhou (ignorado)'); } };
export interface SignupCtx { referralCode?: string; clickId?: string; anonId?: string; deviceId?: string; partnerCode?: string; utm?: TouchInput; country?: string; timezone?: string; ip?: string; method?: string }
export const growthHooks = {
  onUserRegistered: (userId: string, ctx: SignupCtx = {}) => safe('onUserRegistered', async () => {
    if (ctx.country || ctx.timezone) await pool.query('UPDATE users SET country=COALESCE($2,country), timezone=COALESCE($3,timezone) WHERE id=$1', [userId, ctx.country?.toUpperCase() ?? null, ctx.timezone ?? null]);
    { const u = (await pool.query<Pick<Row<'users'>, 'country' | 'region'>>('SELECT country, region FROM users WHERE id=$1', [userId])).rows[0]; await residencyService.assignOnSignup(userId, u?.country, u?.region); } // Fase 8: residência por país
    if (ctx.utm && (ctx.utm.utm_source || ctx.utm.referrer) && !ctx.anonId) await attributionService.touch({ userId }, ctx.utm);
    await attributionService.claim(userId, ctx.anonId);
    const pc = ctx.partnerCode ?? (ctx.utm?.utm_source?.startsWith('partner_') ? ctx.utm.utm_source.slice(8) : undefined); let partner = false; if (pc) partner = await partnersService.attach(userId, pc);
    let referred = false; if (ctx.referralCode) { try { await referralsService.convert(userId, { code: ctx.referralCode, clickId: ctx.clickId, ip: ctx.ip ?? '0.0.0.0', deviceId: ctx.deviceId }); referred = true; } catch (e) { logger.info({ err: (e as Error).message }, 'código de indicação não aplicado no cadastro'); } }
    if (ctx.deviceId) await pool.query('INSERT INTO device_fingerprints (user_id, device_hash) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, deviceHash(ctx.deviceId)]); // base do antifraude de indicação (mesmo aparelho)
    await referralsService.codeFor(userId);
    await track(userId, 'user_signed_up', { method: ctx.method ?? 'password', referred, ...(partner && pc ? { partner_code: pc } : {}) });
  }),
  onProjectCreated: (userId: string, projectId: string, p: { category?: string | null; templateId?: string | null; photos?: number }) => safe('onProjectCreated', async () => {
    await track(userId, 'project_created', { project_id: projectId, ...(p.category ? { category: p.category } : {}), ...(p.templateId ? { template_id: p.templateId } : {}), photos: p.photos ?? 0 });
    if (p.templateId) await track(userId, 'template_used', { template_id: p.templateId, ...(p.category ? { category: p.category } : {}) });
  }),
  onVideoAssembled: (userId: string, projectId: string, durationSec?: number) => safe('onVideoAssembled', async () => {
    const n = (await pool.query<{ n: number }>(`SELECT count(*)::int n FROM projects WHERE user_id=$1 AND status='ready' AND deleted_at IS NULL`, [userId])).rows[0].n as number;
    await track(userId, 'video_assembled', { project_id: projectId, is_first: n <= 1, ...(durationSec ? { duration_sec: durationSec } : {}) });
    await referralsService.onActivated(userId);
  }),
  onPublication: (userId: string, projectId: string, publicationId: string, platform: string, ok: boolean, errorCode?: string) => safe('onPublication', async () => {
    await track(userId, ok ? 'video_published' : 'publication_failed', { project_id: projectId, platform, ...(ok ? { publication_id: publicationId } : { error_code: errorCode ?? 'error' }) });
  }),
  /** Receita reconhecida: normaliza para BRL, acumula comissão de parceiro e emite os eventos de monetização. */
  onRevenue: (userId: string, o: { source: string; ref: string; kind: 'subscription' | 'credits'; plan?: string; credits?: number; method?: string }) => safe('onRevenue', async () => {
    const t = (await pool.query<Pick<Row<'transactions'>, 'id' | 'amount_cents' | 'currency' | 'amount_brl_cents'>>(`SELECT id, amount_cents, currency, amount_brl_cents FROM transactions WHERE source=$1 AND external_ref=$2`, [o.source, o.ref])).rows[0]; if (!t) return;
    let brl = t.amount_brl_cents as number | null; if (brl == null) { brl = await toBrlCents(Number(t.amount_cents), String(t.currency).trim()); await pool.query('UPDATE transactions SET amount_brl_cents=$2 WHERE id=$1', [t.id, brl]); }
    await partnersService.accrue(t.id);
    if (o.kind === 'subscription') await track(userId, 'subscription_started', { plan: o.plan ?? 'pro', amount_cents: Number(t.amount_cents), currency: String(t.currency).trim() });
    else await track(userId, 'credits_purchased', { credits: o.credits ?? 0, amount_cents: Number(t.amount_cents), currency: String(t.currency).trim(), ...(o.method ? { method: o.method } : {}) });
    await track(userId, 'revenue_recorded', { kind: o.kind, amount_cents: brl, currency: 'BRL' });
  }),
  onTemplatePurchased: (userId: string, templateId: string, priceCredits: number) => safe('onTemplatePurchased', async () => { await track(userId, 'template_purchased', { template_id: templateId, price_credits: priceCredits }); await pool.query(`INSERT INTO recommendation_events (user_id,surface,item_type,item_id,action) VALUES ($1,'purchase','template',$2,'purchase')`, [userId, templateId]); }),
  onAffiliateConversion: (userId: string, o: { linkId: string; platform: string; amountCents: number; commissionCents: number }) => safe('onAffiliateConversion', async () => { await track(userId, 'affiliate_conversion', { link_id: o.linkId, platform: o.platform, amount_cents: o.amountCents, commission_cents: o.commissionCents }); }),
  onConsent: (userId: string, type: string, accepted: boolean) => safe('onConsent', async () => { await track(userId, 'consent_given', { consent_type: type, accepted }, { forceIdentified: accepted }); }),
};
