import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { isEnabled } from '../flags.service.js';
import { growthSettings } from '../growth/settings.js';
import { experimentsService } from '../experiments/experiments.service.js';
import { retentionService } from '../retention/retention.service.js';
import { track } from '../analytics/analytics.service.js';
import { pricingRegions, quote, type Quote } from './pricing.js';
import { chain } from '../retention/templates.js';
import { m } from '../../observability/metrics.js';
import { notFound } from '../../utils/errors.js';
import type { Row } from '../../db/rows.generated.js';

export const TRIGGERS = ['first_generation', 'third_generation', 'download_no_watermark', 'credits_exhausted', 'credits_80pct', 'third_platform_free', 'three_videos_day'] as const;
export type Trigger = (typeof TRIGGERS)[number];
const TIMING: Trigger[] = ['first_generation', 'third_generation', 'download_no_watermark']; const CREDIT_TRIGGERS: Trigger[] = ['credits_exhausted', 'credits_80pct'];
/** Fatos do usuário no servidor — o cliente só diz QUAL gatilho disparou; o servidor confirma (não dá para forjar um paywall). */
export async function facts(userId: string) {
  const r = (await pool.query<{ plan: ('free' | 'pro' | 'business'); credits: number; region: string; country: string | null; locale: string; churn_risk: number | null; ready: number; today: number; platforms: number; consumed30: number }>(`SELECT u.plan, u.credits, u.region, u.country, u.locale, u.churn_risk,
    (SELECT count(*) FROM projects p WHERE p.user_id=u.id AND p.status='ready' AND p.deleted_at IS NULL)::int ready,
    (SELECT count(*) FROM projects p WHERE p.user_id=u.id AND p.created_at >= date_trunc('day', now()) AND p.deleted_at IS NULL)::int today,
    (SELECT count(DISTINCT b.platform) FROM publications b WHERE b.user_id=u.id AND b.status <> 'failed')::int platforms,
    (SELECT COALESCE(-sum(credits_delta),0) FROM transactions t WHERE t.user_id=u.id AND t.credits_delta < 0 AND t.created_at > now() - interval '30 days')::int consumed30
    FROM users u WHERE u.id=$1 AND u.deleted_at IS NULL`, [userId])).rows[0]; if (!r) throw notFound('Usuário não encontrado'); return r as { plan: string; credits: number; region: string; country: string | null; locale: string; churn_risk: number | null; ready: number; today: number; platforms: number; consumed30: number };
}
export function triggerMet(t: Trigger, f: Awaited<ReturnType<typeof facts>>): boolean {
  switch (t) {
    case 'first_generation': return f.ready >= 1; case 'third_generation': return f.ready >= 3; case 'download_no_watermark': return f.plan === 'free';
    case 'credits_exhausted': return f.credits === 0; case 'credits_80pct': return f.consumed30 >= 8 && f.consumed30 / (f.consumed30 + f.credits) >= 0.8;
    case 'third_platform_free': return f.plan === 'free' && f.platforms >= 2; case 'three_videos_day': return f.today >= 3;
  }
}
const COPY: Record<Trigger, Record<string, (v: Record<string, string | number>) => { title: string; body: string; cta: string }>> = {
  first_generation: { 'pt-BR': () => ({ title: 'Seu primeiro vídeo ficou pronto!', body: 'Desbloqueie vídeos sem marca d’água e mais plataformas com o Pro.', cta: 'Conhecer o Pro' }), en: () => ({ title: 'Your first video is ready!', body: 'Unlock watermark-free videos and more platforms with Pro.', cta: 'See Pro' }), es: () => ({ title: '¡Tu primer video está listo!', body: 'Desbloquea videos sin marca de agua y más plataformas con Pro.', cta: 'Conocer Pro' }) },
  third_generation: { 'pt-BR': (v) => ({ title: `Você já criou ${v.n} vídeos`, body: 'Passe para o Pro: mais vídeos por mês, sem marca d’água e publicação em todas as plataformas.', cta: 'Assinar Pro' }), en: (v) => ({ title: `You have created ${v.n} videos`, body: 'Go Pro: more videos per month, no watermark and publishing to every platform.', cta: 'Get Pro' }), es: (v) => ({ title: `Ya creaste ${v.n} videos`, body: 'Pásate a Pro: más videos al mes, sin marca de agua y publicación en todas las plataformas.', cta: 'Suscribirme a Pro' }) },
  download_no_watermark: { 'pt-BR': () => ({ title: 'Baixar sem marca d’água', body: 'Disponível no Pro. Seu vídeo, sua marca.', cta: 'Desbloquear' }), en: () => ({ title: 'Download without watermark', body: 'Available on Pro. Your video, your brand.', cta: 'Unlock' }), es: () => ({ title: 'Descargar sin marca de agua', body: 'Disponible en Pro. Tu video, tu marca.', cta: 'Desbloquear' }) },
  credits_exhausted: { 'pt-BR': () => ({ title: 'Seus créditos acabaram', body: 'Recarregue em segundos e continue criando.', cta: 'Comprar créditos' }), en: () => ({ title: 'You are out of credits', body: 'Top up in seconds and keep creating.', cta: 'Buy credits' }), es: () => ({ title: 'Se acabaron tus créditos', body: 'Recarga en segundos y sigue creando.', cta: 'Comprar créditos' }) },
  credits_80pct: { 'pt-BR': () => ({ title: 'Você usou 80% dos seus créditos', body: 'Garanta um pacote com desconto antes de acabar.', cta: 'Ver pacotes' }), en: () => ({ title: 'You have used 80% of your credits', body: 'Grab a discounted pack before you run out.', cta: 'See packs' }), es: () => ({ title: 'Usaste el 80% de tus créditos', body: 'Consigue un paquete con descuento antes de que se acaben.', cta: 'Ver paquetes' }) },
  third_platform_free: { 'pt-BR': () => ({ title: 'Publique em mais plataformas', body: 'O plano Free publica em até 2 plataformas. O Pro libera todas.', cta: 'Liberar todas' }), en: () => ({ title: 'Publish on more platforms', body: 'Free publishes to up to 2 platforms. Pro unlocks all of them.', cta: 'Unlock all' }), es: () => ({ title: 'Publica en más plataformas', body: 'Free publica en hasta 2 plataformas. Pro las desbloquea todas.', cta: 'Desbloquear todas' }) },
  three_videos_day: { 'pt-BR': () => ({ title: 'Dia produtivo! 🔥', body: 'Você já gerou 3 vídeos hoje. O Pro dá mais espaço para criar sem limites.', cta: 'Ver Pro' }), en: () => ({ title: 'Productive day! 🔥', body: 'You have generated 3 videos today. Pro gives you room to create without limits.', cta: 'See Pro' }), es: () => ({ title: '¡Día productivo! 🔥', body: 'Ya generaste 3 videos hoy. Pro te da espacio para crear sin límites.', cta: 'Ver Pro' }) },
};
const copyFor = (t: Trigger, locale: string, country: string | null, v: Record<string, string | number>) => { for (const l of chain(locale, country)) { const key = l === 'es-MX' ? 'es' : l; const f = COPY[t][key]; if (f) return f(v); } return COPY[t]['pt-BR']!(v); };
const RATIO: Record<string, number> = { control: 1, low: 0.8, high: 1.2 };
export type Offer = { kind: 'plan' | 'credits' | 'bundle'; plan?: 'pro'; billing: 'monthly' | 'annual'; trialDays?: number; priceKey?: string; quote: Quote; packId?: string; bundle?: { plan: 'pro'; bonusCredits: number; premiumTemplateId: string | null }; copy: { title: string; body: string; cta: string } };
export interface Decision { show: boolean; reason?: string; trigger: Trigger; blocking: false; offer?: Offer; experiments?: Record<string, { variant: string; inExperiment: boolean }> }

export const paywallService = {
  /** Decide se/qual oferta mostrar. Não-bloqueante por contrato (`blocking:false`). `peek` não consome o limite de frequência. */
  async evaluate(userId: string, trigger: Trigger, o: { peek?: boolean } = {}): Promise<Decision> {
    const none = (reason: string): Decision => { m.paywallDecisions.inc({ trigger, shown: 'false' }); return { show: false, reason, trigger, blocking: false }; };
    if (!(await isEnabled('paywall_contextual', { userId }))) return none('feature_off'); const f = await facts(userId); const gs = await growthSettings();
    if (f.plan !== 'free' && !CREDIT_TRIGGERS.includes(trigger)) return none('paid_plan'); if (f.plan === 'business') return none('paid_plan');
    if (!triggerMet(trigger, f)) return none('trigger_not_met');
    const experiments: NonNullable<Decision['experiments']> = {};
    if (TIMING.includes(trigger)) { const a = await experimentsService.assign(userId, 'paywall_trigger_timing', { expose: false }); experiments.paywall_trigger_timing = { variant: a.variant, inExperiment: a.inExperiment }; const want: Trigger = a.variant === 'after_first' ? 'first_generation' : a.variant === 'on_download' ? 'download_no_watermark' : 'third_generation'; if (trigger !== want) return none('experiment_timing'); }
    const day = new Date().toISOString().slice(0, 10); const dk = `pw:d:${userId}:${trigger}:${day}`; const wk = `pw:w:${userId}:${day.slice(0, 4)}-${Math.floor(new Date().getTime() / (7 * 86_400_000))}`;
    const [dn, wn] = await Promise.all([redis.get(dk), redis.get(wk)]).then((x) => x.map((v) => Number(v ?? 0)) as [number, number]).catch(() => [0, 0] as [number, number]);
    if (dn >= gs.paywall.capPerDayPerTrigger) return none('frequency_cap_day'); if (wn >= gs.paywall.capPerWeek) return none('frequency_cap_week');
    const regs = await pricingRegions(); const credit = CREDIT_TRIGGERS.includes(trigger); let offer: Offer; let churn = f.churn_risk ?? 0;
    if (!credit) { const a = await experimentsService.assign(userId, 'paywall_price', { expose: true }); const b = await experimentsService.assign(userId, 'paywall_trial_structure', { expose: true }); experiments.paywall_price = { variant: a.variant, inExperiment: a.inExperiment }; experiments.paywall_trial_structure = { variant: b.variant, inExperiment: b.inExperiment };
      if (TIMING.includes(trigger)) { await experimentsService.assign(userId, 'paywall_trigger_timing', { expose: true }); }
      const billing = b.variant === 'annual' ? 'annual' : 'monthly'; const q = await quote(regs, { item: { kind: 'plan', plan: 'pro', billing }, country: f.country, userRegion: f.region, priceRatio: RATIO[a.variant] ?? 1 });
      const premium = (await pool.query<Pick<Row<'templates'>, 'id'>>(`SELECT id FROM templates WHERE moderation_status='approved' AND deleted_at IS NULL AND price_credits > 0 ORDER BY usage_count DESC LIMIT 1`)).rows.at(0)?.id as string | undefined;
      try { churn = (await retentionService.churnFor(userId)).score; } catch { /* sem score → oferta padrão */ }
      const bundle = churn >= gs.churn.highRisk || trigger === 'third_platform_free' ? { plan: 'pro' as const, bonusCredits: 20, premiumTemplateId: premium ?? null } : undefined;
      offer = { kind: bundle ? 'bundle' : 'plan', plan: 'pro', billing, ...(b.variant === 'trial_7d' ? { trialDays: 7 } : {}), priceKey: a.variant === 'control' ? 'pro' : `pro_${a.variant}`, quote: q, ...(bundle ? { bundle } : {}), copy: copyFor(trigger, f.locale, f.country, { n: f.ready }) };
    } else { const q = await quote(regs, { item: { kind: 'credits', packId: trigger === 'credits_exhausted' ? 'c50' : 'c200' }, country: f.country, userRegion: f.region }); offer = { kind: 'credits', billing: 'monthly', packId: q.item.kind === 'credits' ? q.item.packId : undefined, quote: q, copy: copyFor(trigger, f.locale, f.country, {}) }; }
    if (!o.peek) { await redis.multi().incr(dk).expire(dk, 2 * 86400).incr(wk).expire(wk, 8 * 86400).exec().catch(() => undefined); await track(userId, 'paywall_viewed', { trigger, offer: offer.kind, blocking: false }); }
    m.paywallDecisions.inc({ trigger, shown: 'true' }); return { show: true, trigger, blocking: false, offer, experiments };
  },
};
