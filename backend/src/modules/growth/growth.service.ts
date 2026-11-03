import { z } from 'zod';
import { randomInt } from 'node:crypto';
import { pool } from '../../db/pool.js';
import { env } from '../../config/env.js';
import { conflict, notFound } from '../../utils/errors.js';
import { enqueue, Q } from '../../queues/index.js';
import { isEnabled } from '../flags.service.js';
import { track } from '../analytics/analytics.service.js';
import { experimentsService } from '../experiments/experiments.service.js';
import { referralsService } from '../referrals/referrals.service.js';
import { attributionService, type TouchInput } from '../attribution/attribution.service.js';
import type { Row } from '../../db/rows.generated.js';

export const onboardingBody = z.object({ goal: z.enum(['sell', 'audience', 'test_ai']).optional(), country: z.string().length(2).optional(), timezone: z.string().max(60).optional(), completed: z.boolean().optional(), stepsSeen: z.number().int().min(0).max(20).optional(), durationMs: z.number().int().min(0).max(3_600_000).optional() });
type Step = { id: string; title: string; kind: 'connect' | 'create' | 'learn' | 'publish'; target?: string };
const STEPS: Record<'sell' | 'audience' | 'test_ai', Step[]> = {
  sell: [{ id: 'photocoach', title: 'Fotografe seu produto com o PhotoCoach', kind: 'learn' }, { id: 'template_product', title: 'Escolha um template de produto', kind: 'create', target: 'marketplace?category=produto' }, { id: 'connect_marketplace', title: 'Conecte Mercado Livre ou Shopee', kind: 'connect', target: 'integrations' }, { id: 'first_video', title: 'Gere seu primeiro vídeo', kind: 'create' }, { id: 'publish_marketplace', title: 'Publique no marketplace', kind: 'publish' }],
  audience: [{ id: 'connect_social', title: 'Conecte TikTok, YouTube ou Instagram', kind: 'connect', target: 'integrations' }, { id: 'script_ideas', title: 'Veja ideias de roteiro para o seu nicho', kind: 'learn' }, { id: 'first_video', title: 'Gere seu primeiro vídeo', kind: 'create' }, { id: 'publish_social', title: 'Publique e acompanhe os resultados', kind: 'publish' }],
  test_ai: [{ id: 'demo_project', title: 'Rode um projeto de exemplo em 1 clique', kind: 'create' }, { id: 'see_chaining', title: 'Veja como as cenas se encadeiam', kind: 'learn' }, { id: 'edit_scene', title: 'Edite uma cena e regenere', kind: 'create' }, { id: 'later_connect', title: 'Conecte uma plataforma quando quiser', kind: 'connect', target: 'integrations' }],
};
const INTRO: Record<string, { format: 'slides' | 'video'; count?: number; url?: string; durationSec?: number }> = { control: { format: 'slides', count: 3 }, one_slide: { format: 'slides', count: 1 }, short_video: { format: 'video', url: '/onboarding/intro-15s.mp4', durationSec: 15 } };
export const growthService = {
  async onboardingPlan(userId: string) {
    const u = (await pool.query<Pick<Row<'users'>, 'onboarding_goal' | 'onboarding_completed_at'>>('SELECT onboarding_goal, onboarding_completed_at FROM users WHERE id=$1', [userId])).rows[0]; if (!u) throw notFound('Usuário não encontrado');
    const a = await experimentsService.assign(userId, 'onboarding_flow', { expose: true }); const goal = (u.onboarding_goal ?? 'sell') as keyof typeof STEPS;
    const done = (await pool.query(`SELECT (SELECT count(*) FROM projects WHERE user_id=$1 AND status='ready')::int ready, (SELECT count(*) FROM publications WHERE user_id=$1 AND status='published')::int pub, (SELECT count(*) FROM connected_accounts WHERE user_id=$1)::int conn`, [userId])).rows[0];
    const steps = STEPS[goal].map((s) => ({ ...s, done: s.id === 'first_video' ? done.ready > 0 : s.kind === 'publish' ? done.pub > 0 : s.kind === 'connect' ? done.conn > 0 : false }));
    return { goal, goalSelected: !!u.onboarding_goal, completed: !!u.onboarding_completed_at, intro: INTRO[a.variant] ?? INTRO.control, variant: { experiment: 'onboarding_flow', key: a.variant, inExperiment: a.inExperiment }, steps, nextStep: steps.find((s) => !s.done)?.id ?? null };
  },
  async saveOnboarding(userId: string, b: z.infer<typeof onboardingBody>) {
    const first = !!b.completed && !(await pool.query<Pick<Row<'users'>, 'onboarding_completed_at'>>('SELECT onboarding_completed_at FROM users WHERE id=$1', [userId])).rows.at(0)?.onboarding_completed_at;
    await pool.query(`UPDATE users SET onboarding_goal=COALESCE($2,onboarding_goal), country=COALESCE($3,country), timezone=COALESCE($4,timezone), onboarding_completed_at=CASE WHEN $5 THEN COALESCE(onboarding_completed_at, now()) ELSE onboarding_completed_at END WHERE id=$1`, [userId, b.goal ?? null, b.country?.toUpperCase() ?? null, b.timezone ?? null, !!b.completed]);
    if (first) await track(userId, 'onboarding_completed', { ...(b.goal ? { goal: b.goal } : {}), ...(b.stepsSeen !== undefined ? { steps_seen: b.stepsSeen } : {}), ...(b.durationMs !== undefined ? { duration_ms: b.durationMs } : {}) });
    return this.onboardingPlan(userId);
  },
  /** Política de marca d'água: pagantes sem marca; Free depende do experimento `watermark_free`. */
  async watermark(userId: string) {
    const u = (await pool.query<Pick<Row<'users'>, 'plan' | 'referral_code'>>('SELECT plan, referral_code FROM users WHERE id=$1', [userId])).rows[0]; if (!u) throw notFound('Usuário não encontrado'); const code = await referralsService.codeFor(userId);
    if (u.plan !== 'free') return { enabled: false, reason: 'paid_plan', text: null, qr: false, url: null };
    const a = await experimentsService.assign(userId, 'watermark_free', { expose: true }); const url = `https://nexusreel.com/r/${code}`;
    if (a.variant === 'none') return { enabled: false, reason: 'experiment', text: null, qr: false, url: null, variant: a.variant };
    return { enabled: true, reason: a.inExperiment ? 'experiment' : 'free_default', text: 'nexusreel.com', qr: a.variant === 'qr', url, variant: a.variant };
  },
  async shareInfo(userId: string, projectId: string, channel?: string) {
    const p = (await pool.query<Pick<Row<'projects'>, 'id' | 'title' | 'final_video_url' | 'status'>>(`SELECT id, title, final_video_url, status FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`, [projectId, userId])).rows[0]; if (!p) throw notFound('Projeto não encontrado'); const code = await referralsService.codeFor(userId);
    const q = new URLSearchParams({ ref: code, utm_source: 'share', utm_medium: channel ?? 'app', utm_campaign: 'made_with_nexusreel' }); const url = `${env.PUBLIC_APP_URL}/v/${p.id}?${q.toString()}`;
    await track(userId, 'share_card_created', { project_id: p.id, ...(channel ? { channel } : {}) });
    return { url, watermark: await this.watermark(userId), card: { width: 1080, height: 1920, cta: 'Feito com NexusReel — crie o seu em 1 minuto', svgUrl: `${env.PUBLIC_API_URL}/api/v1/growth/share/${p.id}/card.svg` }, madeWith: { text: 'Made with NexusReel', url: `https://nexusreel.com/r/${code}` } };
  },
  /** Card social 9:16 em SVG (texto escapado; sem recursos externos) — o cliente converte para PNG/MP4 ao compartilhar. */
  async shareCardSvg(userId: string, projectId: string): Promise<string> {
    const p = (await pool.query<Pick<Row<'projects'>, 'title'>>(`SELECT title FROM projects WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL`, [projectId, userId])).rows[0]; if (!p) throw notFound('Projeto não encontrado'); const code = await referralsService.codeFor(userId);
    const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!)); const title = esc(String(p.title).slice(0, 70)); const link = esc(`nexusreel.com/r/${code}`);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" role="img" aria-label="${title}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs><rect width="1080" height="1920" fill="url(#g)"/><text x="540" y="860" font-family="sans-serif" font-size="72" font-weight="700" fill="#fff" text-anchor="middle">${title}</text><text x="540" y="1500" font-family="sans-serif" font-size="48" fill="#e9d5ff" text-anchor="middle">Feito com NexusReel</text><text x="540" y="1580" font-family="sans-serif" font-size="56" font-weight="700" fill="#fff" text-anchor="middle">${link}</text></svg>`;
  },
  // ───────── Waitlist ─────────
  async joinWaitlist(i: { email: string; locale: string; country?: string; ref?: string; utm?: TouchInput; anonId?: string }) {
    if (!(await isEnabled('waitlist_open'))) throw conflict('Waitlist fechada', 'waitlist_closed');
    const email = i.email.trim().toLowerCase(); const ex = (await pool.query<Row<'waitlist_entries'>>('SELECT * FROM waitlist_entries WHERE lower(email)=$1', [email])).rows[0]; if (ex) { // auditoria: não devolve código/posição de outra pessoa a quem só conhece o e-mail — o status vai para a caixa de entrada do dono
      const st = await this.waitlistStatus(ex.referral_code); await enqueue(Q.emails, 'waitlist', { to: email, template: 'waitlist_welcome', locale: ex.locale ?? i.locale, vars: { position: String(st.position), link: st.shareLink } }).catch(() => undefined);
      return { alreadyJoined: true, statusSentByEmail: true };
    }
    const refCode = i.ref ? i.ref.toUpperCase().replace(/[^A-Z0-9]/g, '') : null; const refRow = refCode ? (await pool.query('SELECT 1 FROM waitlist_entries WHERE referral_code=$1', [refCode])).rows[0] : null;
    let code = ''; for (let n = 0; n < 6 && !code; n++) { const c = 'W' + Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[randomInt(32)]).join(''); if (!(await pool.query('SELECT 1 FROM waitlist_entries WHERE referral_code=$1', [c])).rowCount) code = c; }
    await pool.query(`INSERT INTO waitlist_entries (email, locale, country, referral_code, referred_by_code, utm) VALUES ($1,$2,$3,$4,$5,$6)`, [email, i.locale, i.country?.toUpperCase() ?? null, code, refRow ? refCode : null, JSON.stringify(i.utm ?? {})]);
    if (refRow) await pool.query(`UPDATE waitlist_entries SET bonus_positions=LEAST(bonus_positions+5, 50) WHERE referral_code=$1`, [refCode]);
    if (i.anonId && i.utm) await attributionService.touch({ anonId: i.anonId }, i.utm).catch(() => undefined);
    await track(null, 'waitlist_joined', { has_referral: !!refRow }); await enqueue(Q.emails, 'waitlist', { to: email, template: 'waitlist_welcome', locale: i.locale, vars: { position: String((await this.waitlistStatus(code)).position), link: `${env.WAITLIST_PUBLIC_URL}?ref=${code}` } }).catch(() => undefined);
    return { ...(await this.waitlistStatus(code)), alreadyJoined: false };
  },
  async waitlistStatus(code: string) {
    const me = (await pool.query<Pick<Row<'waitlist_entries'>, 'id' | 'bonus_positions' | 'referral_code'>>('SELECT id, bonus_positions, referral_code FROM waitlist_entries WHERE referral_code=$1', [code])).rows[0]; if (!me) throw notFound('Entrada não encontrada');
    const ahead = (await pool.query(`SELECT count(*)::int n FROM waitlist_entries WHERE status='waiting' AND (id - bonus_positions) < $1`, [me.id - me.bonus_positions])).rows[0].n as number; const total = (await pool.query(`SELECT count(*)::int n FROM waitlist_entries WHERE status='waiting'`)).rows[0].n as number;
    const refs = (await pool.query('SELECT count(*)::int n FROM waitlist_entries WHERE referred_by_code=$1', [code])).rows[0].n as number;
    return { position: ahead + 1, total, referralCode: me.referral_code as string, shareLink: `${env.WAITLIST_PUBLIC_URL}?ref=${me.referral_code}`, referrals: refs, bonusPositions: me.bonus_positions as number };
  },
  // ───────── SEO (páginas públicas de templates) ─────────
  async templatePageHtml(id: string): Promise<string> {
    const t = (await pool.query<Pick<Row<'templates'>, 'id' | 'name' | 'description' | 'category' | 'rating_avg' | 'rating_count' | 'usage_count' | 'price_credits'>>(`SELECT id, name, description, category, rating_avg, rating_count, usage_count, price_credits FROM templates WHERE id=$1 AND moderation_status='approved' AND deleted_at IS NULL`, [id])).rows[0]; if (!t) throw notFound('Template não encontrado');
    const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]!)); const cta = `${env.PUBLIC_APP_URL}/create?template=${t.id}&utm_source=seo&utm_medium=template_page&utm_campaign=${encodeURIComponent(t.category)}`;
    const ld = { '@context': 'https://schema.org', '@type': 'CreativeWork', name: t.name, description: t.description, genre: t.category, url: `${env.PUBLIC_APP_URL}/templates/${t.id}`, ...(t.rating_count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(t.rating_avg).toFixed(1), ratingCount: t.rating_count } } : {}), offers: { '@type': 'Offer', price: String(t.price_credits), priceCurrency: 'CREDITS' } };
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t.name)} — template de vídeo | NexusReel</title><meta name="description" content="${esc(String(t.description).slice(0, 155))}"><link rel="canonical" href="${esc(`${env.PUBLIC_APP_URL}/templates/${t.id}`)}"><meta property="og:title" content="${esc(t.name)}"><meta property="og:description" content="${esc(String(t.description).slice(0, 155))}"><meta property="og:type" content="website"><meta name="twitter:card" content="summary_large_image"><script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script><style>body{font:16px/1.5 system-ui;max-width:640px;margin:2rem auto;padding:0 1rem}a.cta{display:inline-block;background:#6d28d9;color:#fff;padding:.8rem 1.2rem;border-radius:.6rem;text-decoration:none}</style></head><body><h1>${esc(t.name)}</h1><p>${esc(t.description)}</p><p>Categoria: ${esc(t.category)} · ${t.usage_count} usos${t.rating_count ? ` · ★ ${Number(t.rating_avg).toFixed(1)} (${t.rating_count})` : ''}</p><p><a class="cta" href="${esc(cta)}">Criar meu vídeo com este template</a></p></body></html>`;
  },
  async sitemapXml(): Promise<string> { const rows = (await pool.query<Pick<Row<'templates'>, 'id' | 'created_at'>>(`SELECT id, created_at FROM templates WHERE moderation_status='approved' AND deleted_at IS NULL ORDER BY usage_count DESC LIMIT 5000`)).rows; return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.map((r) => `<url><loc>${env.PUBLIC_APP_URL}/templates/${r.id}</loc><lastmod>${new Date(r.created_at).toISOString().slice(0, 10)}</lastmod></url>`).join('')}</urlset>`; },
};
