import { z } from 'zod';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { recordUsage } from '../../providers/ai/router.js';
import { signRef } from '../../providers/storage.js';
import { audit } from '../../repositories/audit.js';
import { hashIp, sha256 } from '../../utils/crypto.js';
import { env } from '../../config/env.js';
import { m10Error, requireM10 } from '../m10/common.js';
import { AVATAR_PRESETS, mockAvatar } from './avatarProvider.js';

/**
 * Módulo 10 — Live commerce com avatar de IA (`ff_live`, B2B = plano Business). Vitrine ao vivo 24/7 com o catálogo.
 * Transparência e consentimento (AI Act / CDC / LGPD):
 * - rótulo "IA" OBRIGATÓRIO: `ai_label_enabled` só aceita true (CHECK no banco + 422 na API); o feed público SEMPRE devolve
 *   `aiLabel.visible = true`, e cada exibição soma em `label_impressions` (registro);
 * - aviso no início da transmissão: `startLive` grava o evento `ai_disclosure_shown` com o texto exibido ANTES de `started`;
 * - opt-in do lojista (`merchantOptIn: true`, gravado em `merchant_opt_in_at`);
 * - avatar com a imagem/voz do lojista (`source: 'custom'`) exige consentimento `avatar_live` ativo; os pré-prontos não usam
 *   dado de ninguém. Nenhum dado do usuário treina avatar sem esse consentimento.
 * Limites: `createLiveSession` 5/h por usuário (rota) e até 3 lives ao vivo ao mesmo tempo. `ai_usage`: `avatar_live_script`.
 */
export const LIVE_CONSENT_VERSION = 'avatar-live-v1';
export const ROTATE_SEC = 30;
export const createSchema = z.object({
  catalogId: z.string().uuid(), title: z.string().trim().min(1).max(120), locale: z.enum(['pt-BR', 'en', 'es']).optional(),
  avatar: z.object({ source: z.enum(['preset', 'custom']).default('preset'), preset: z.enum(AVATAR_PRESETS).optional(), voice: z.enum(['female', 'male', 'neutral']).default('female') }).strict(),
  aiLabelEnabled: z.boolean(), merchantOptIn: z.boolean(),
}).strict();
const DISCLOSURE = {
  'pt-BR': (store: string) => `Aviso: esta live é apresentada por um avatar de inteligência artificial (IA). Os produtos e preços são da loja ${store}.`,
  en: (store: string) => `Notice: this live is presented by an artificial intelligence (AI) avatar. Products and prices are from ${store}.`,
  es: (store: string) => `Aviso: este directo lo presenta un avatar de inteligencia artificial (IA). Los productos y precios son de la tienda ${store}.`,
} as const;
const LABEL_TEXT = { 'pt-BR': 'IA', en: 'AI', es: 'IA' } as const;
const LABEL_DESC = { 'pt-BR': 'Apresentado por um avatar de IA', en: 'Presented by an AI avatar', es: 'Presentado por un avatar de IA' } as const;
interface LRow { id: string; owner_id: string; catalog_id: string; avatar_config: { source: string; preset: string | null; voice: string; locale: 'pt-BR' | 'en' | 'es'; consentId?: string | null; provider: string };
  ai_label_enabled: boolean; status: 'draft' | 'live' | 'ended'; started_at: string | null; ended_at: string | null; title: string; disclosure_text: string; merchant_opt_in_at: string; label_impressions: string; created_at: string }
const get = async (userId: string, id: string) => { const r = await asUser(userId, async (db) => (await db.query<LRow>('SELECT * FROM live_sessions WHERE id=$1', [id])).rows[0]); if (!r) throw m10Error(404, 'live_not_found', undefined, 'not_found'); return r; };
const items = (catalogId: string) => asSystem(async (db) => (await db.query<{ id: string; name: string; price: string; photo_urls: string[] }>('SELECT id, name, price, photo_urls FROM catalog_items WHERE catalog_id=$1 ORDER BY name LIMIT 50', [catalogId])).rows);
const activeConsent = (userId: string) => asUser(userId, async (db) => (await db.query<{ id: string }>(`SELECT id FROM consents WHERE user_id=$1 AND type='avatar_live' AND revoked_at IS NULL ORDER BY accepted_at DESC LIMIT 1`, [userId])).rows.at(0) ?? null);
async function events(userId: string, id: string) { return asUser(userId, async (db) => (await db.query<{ type: string; payload: unknown; created_at: string }>('SELECT type, payload, created_at FROM live_session_events WHERE session_id=$1 ORDER BY created_at, type', [id])).rows); }
function dto(r: LRow) {
  return { sessionId: r.id, title: r.title, catalogId: r.catalog_id, status: r.status, startedAt: r.started_at, endedAt: r.ended_at, createdAt: r.created_at,
    avatar: { source: r.avatar_config.source, preset: r.avatar_config.preset, voice: r.avatar_config.voice, provider: r.avatar_config.provider },
    aiLabel: { enabled: r.ai_label_enabled, visible: true, text: LABEL_TEXT[r.avatar_config.locale] ?? 'IA', impressions: Number(r.label_impressions) },
    disclosure: r.disclosure_text, merchantOptInAt: r.merchant_opt_in_at, watchPath: `/api/v1/live/${r.id}/watch` };
}
export const liveCommerceService = {
  /** Consentimento `avatar_live` (só para avatar com a própria imagem/voz). */
  async acceptConsent(userId: string, meta: { ip: string; userAgent?: string }) {
    await requireM10('ff_live', userId);
    return tx({ userId }, async (db) => { const at = new Date(); const ipH = hashIp(meta.ip); const ua = meta.userAgent ? sha256(meta.userAgent) : null;
      const r = (await db.query<{ id: string }>(`INSERT INTO consents (user_id,type,version,ip_hash,accepted_at,user_agent_hash,proof_hash) VALUES ($1,'avatar_live',$2,$3,$4,$5,$6) RETURNING id`,
        [userId, LIVE_CONSENT_VERSION, ipH, at, ua, sha256([userId, 'avatar_live', LIVE_CONSENT_VERSION, at.toISOString(), ipH, ua ?? ''].join('|'))])).rows[0]!;
      await audit(db, userId, 'consent.avatar_live.accept', 'consent', r.id, { version: LIVE_CONSENT_VERSION }); return { consentId: r.id, type: 'avatar_live', version: LIVE_CONSENT_VERSION, acceptedAt: at.toISOString() }; });
  },
  async revokeConsent(userId: string) {
    await requireM10('ff_live', userId);
    await tx({ userId }, async (db) => { const n = (await db.query(`UPDATE consents SET revoked_at=now() WHERE user_id=$1 AND type='avatar_live' AND revoked_at IS NULL`, [userId])).rowCount;
      // revogar encerra as lives com avatar próprio (o avatar deixa de poder usar a imagem/voz)
      await db.query(`UPDATE live_sessions SET status='ended', ended_at=now(), updated_at=now() WHERE owner_id=$1 AND status <> 'ended' AND avatar_config->>'source' = 'custom'`, [userId]);
      await audit(db, userId, 'consent.avatar_live.revoke', 'user', userId, { revoked: n }); });
  },
  /** createLiveSession — 5/h por usuário (rota). B2B (Business), opt-in do lojista e rótulo "IA" obrigatórios. */
  async createLiveSession(userId: string, b: z.infer<typeof createSchema>) {
    await requireM10('ff_live', userId);
    const plan = await asSystem(async (db) => (await db.query<{ plan: string }>('SELECT plan FROM users WHERE id=$1', [userId])).rows.at(0)?.plan);
    if (plan !== 'business') throw m10Error(403, 'b2b_plan_required');
    if (b.aiLabelEnabled !== true) throw m10Error(422, 'ai_label_required');
    if (b.merchantOptIn !== true) throw m10Error(422, 'merchant_opt_in_required');
    const cat = await asUser(userId, async (db) => (await db.query<{ name: string }>('SELECT name FROM catalogs WHERE id=$1', [b.catalogId])).rows[0]); // RLS: catálogo de outra empresa não aparece
    if (!cat) throw m10Error(404, 'catalog_not_found', undefined, 'not_found');
    if (!(await items(b.catalogId)).length) throw m10Error(422, 'catalog_empty');
    let consentId: string | null = null; if (b.avatar.source === 'custom') { const c = await activeConsent(userId); if (!c) throw m10Error(403, 'consent_required'); consentId = c.id; }
    const locale = b.locale ?? 'pt-BR';
    const r = await tx({ userId }, async (db) => {
      const x = (await db.query<LRow>(`INSERT INTO live_sessions (owner_id, catalog_id, avatar_config, ai_label_enabled, title, disclosure_text, merchant_opt_in_at) VALUES ($1,$2,$3,true,$4,$5,now()) RETURNING *`,
        [userId, b.catalogId, { source: b.avatar.source, preset: b.avatar.source === 'preset' ? (b.avatar.preset ?? 'ana') : null, voice: b.avatar.voice, locale, consentId, provider: env.LIVE_AVATAR_PROVIDER }, b.title, DISCLOSURE[locale](cat.name.slice(0, 80))])).rows[0]!;
      await db.query(`INSERT INTO live_session_events (session_id, owner_id, type, payload) VALUES ($1,$2,'created',$3)`, [x.id, userId, { aiLabelEnabled: true, merchantOptIn: true, avatarSource: b.avatar.source }]);
      await audit(db, userId, 'live.create', 'live_session', x.id, { aiLabelEnabled: true, merchantOptIn: true, avatarSource: b.avatar.source }); return x;
    });
    return dto(r);
  },
  /** Inicia: grava o AVISO de IA (evento antes de `started`), gera as falas do avatar (mock) e entra no ar. */
  async startLive(userId: string, id: string) {
    await requireM10('ff_live', userId); const r = await get(userId, id); if (r.status !== 'draft') throw m10Error(409, 'live_invalid_state');
    if (r.avatar_config.source === 'custom' && !(await activeConsent(userId))) throw m10Error(403, 'consent_required');
    const live = await asUser(userId, async (db) => (await db.query<{ n: number }>(`SELECT count(*)::int n FROM live_sessions WHERE owner_id=$1 AND status='live'`, [userId])).rows[0]!.n);
    if (live >= 3) throw m10Error(429, 'too_many_lives');
    const its = await items(r.catalog_id); const t0 = Date.now(); const script = mockAvatar.script(its.map((i) => ({ name: i.name, price: Number(i.price) })), r.avatar_config.locale);
    await recordUsage({ provider: env.LIVE_AVATAR_PROVIDER, operation: 'avatar_live_script', costCents: 0, latencyMs: Date.now() - t0, userId, status: 'ok' });
    const out = await tx({ userId }, async (db) => {
      await db.query(`INSERT INTO live_session_events (session_id, owner_id, type, payload, created_at) VALUES ($1,$2,'ai_disclosure_shown',$3, clock_timestamp())`, [id, userId, { text: r.disclosure_text, label: LABEL_TEXT[r.avatar_config.locale] }]);
      await db.query(`INSERT INTO live_session_events (session_id, owner_id, type, payload, created_at) VALUES ($1,$2,'started',$3, clock_timestamp())`, [id, userId, { products: its.length, lines: script.length, provider: env.LIVE_AVATAR_PROVIDER }]);
      const x = (await db.query<LRow>(`UPDATE live_sessions SET status='live', started_at=now(), updated_at=now() WHERE id=$1 RETURNING *`, [id])).rows[0]!;
      await audit(db, userId, 'live.start', 'live_session', id, { aiDisclosureShown: true, products: its.length }); return x;
    });
    return { ...dto(out), disclosureShown: true };
  },
  async stopLive(userId: string, id: string) {
    await requireM10('ff_live', userId); const r = await get(userId, id); if (r.status === 'ended') throw m10Error(409, 'live_invalid_state');
    const out = await tx({ userId }, async (db) => {
      await db.query(`INSERT INTO live_session_events (session_id, owner_id, type, payload, created_at) VALUES ($1,$2,'stopped',$3, clock_timestamp())`, [id, userId, { labelImpressions: Number(r.label_impressions) }]);
      const x = (await db.query<LRow>(`UPDATE live_sessions SET status='ended', ended_at=now(), updated_at=now() WHERE id=$1 RETURNING *`, [id])).rows[0]!;
      await audit(db, userId, 'live.stop', 'live_session', id, {}); return x;
    });
    return dto(out);
  },
  async get(userId: string, id: string) { await requireM10('ff_live', userId); const r = await get(userId, id); return { ...dto(r), events: await events(userId, id) }; },
  async list(userId: string) {
    await requireM10('ff_live', userId);
    const rows = await asUser(userId, async (db) => (await db.query<LRow>('SELECT * FROM live_sessions ORDER BY created_at DESC LIMIT 50')).rows);
    return { items: rows.map(dto), consent: { avatarLive: !!(await activeConsent(userId)), version: LIVE_CONSENT_VERSION } };
  },
  /** Feed PÚBLICO do consumidor (sem login). Só lives no ar. O rótulo "IA" e o aviso vêm SEMPRE — e cada exibição é registrada. */
  async watch(id: string) {
    const r = await asSystem(async (db) => (await db.query<LRow>(`UPDATE live_sessions SET label_impressions = label_impressions + 1 WHERE id=$1 AND status='live' RETURNING *`, [id])).rows[0]);
    if (!r) throw m10Error(404, 'live_not_found', undefined, 'not_found');
    const its = await items(r.catalog_id); const loc = r.avatar_config.locale; const script = mockAvatar.script(its.map((i) => ({ name: i.name, price: Number(i.price) })), loc);
    const idx = its.length ? Math.floor((Date.now() - new Date(r.started_at!).getTime()) / 1000 / ROTATE_SEC) % its.length : 0; const cur = its[idx];
    return { sessionId: r.id, title: r.title, status: r.status, startedAt: r.started_at,
      aiLabel: { visible: true, text: LABEL_TEXT[loc] ?? 'IA', position: 'top-start', description: LABEL_DESC[loc] ?? LABEL_DESC['pt-BR'] },
      disclosure: { text: r.disclosure_text, shownAtStart: true },
      avatar: { source: r.avatar_config.source, preset: r.avatar_config.preset, provider: r.avatar_config.provider, synthetic: true },
      now: cur ? { productId: cur.id, name: cur.name, price: Number(cur.price), line: script[idx]?.line ?? '', photoUrl: cur.photo_urls[0] ? await signRef(cur.photo_urls[0], 600).catch(() => null) : null } : null,
      products: its.map((i) => ({ productId: i.id, name: i.name, price: Number(i.price) })), rotateSec: ROTATE_SEC };
  },
};
