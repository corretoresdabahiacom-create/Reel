import { pool, asSystem } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import { encrypt, hashIp } from '../../utils/crypto.js';
import { AppError, notFound, unprocessable } from '../../utils/errors.js';
import { usersRepo } from '../users/users.repository.js';
import { isEnabled } from '../flags.service.js';
import { audit } from '../../repositories/audit.js';
import { m } from '../../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import type { Row } from '../../db/rows.generated.js';

export type AffPlatform = 'shopee' | 'mercadolivre';
export const AFF_RATE: Record<AffPlatform, number> = { shopee: 6, mercadolivre: 5 };
export const PLATFORM_FEE_PCT = 10;
export const pct = (cents: number, p: number) => Math.round((cents * p) / 100);
/** gross = % da venda; fee = 10% da comissão; net = gross − fee (idêntico ao front, Fase 4). */
export function commissionOf(platform: AffPlatform, saleCents: number) { const gross = pct(saleCents, AFF_RATE[platform]); const fee = pct(gross, PLATFORM_FEE_PCT); return { gross, fee, net: gross - fee }; }
const isAff = (p: string): p is AffPlatform => p === 'shopee' || p === 'mercadolivre';
const BUF = 'aff:clickbuf';
const linkDto = (r: Row<'affiliate_links'>) => ({ id: r.id, publicationId: r.publication_id, platform: r.platform, originalUrl: r.original_url, trackingUrl: r.tracking_url, priceCents: r.price_cents, clicks: r.clicks, conversions: r.conversions, commissionCents: r.commission_cents, status: r.status, createdAt: r.created_at });

export const affiliatesService = {
  async enabled(userId: string) { const u = await usersRepo.byId(pool, userId); return isEnabled('affiliates_enabled', { userId, region: u?.region, plan: u?.plan }); },
  async connectAccount(userId: string, platform: string, externalUserId: string, token: string) {
    if (!isAff(platform)) throw unprocessable('Plataforma sem programa de afiliados'); if (!(await this.enabled(userId))) throw new AppError(503, 'affiliates_disabled', 'Afiliados temporariamente desativado');
    await pool.query(`INSERT INTO affiliate_accounts (user_id,platform,external_user_id,token_enc) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,platform) DO UPDATE SET external_user_id=EXCLUDED.external_user_id, token_enc=EXCLUDED.token_enc`, [userId, platform, externalUserId, encrypt(token)]);
    await audit(pool, userId, 'affiliate.account_connect', 'affiliate_account', platform); return { platform, externalUserId, connected: true };
  },
  async accounts(userId: string) { return { items: (await pool.query<Pick<Row<'affiliate_accounts'>, 'platform' | 'external_user_id' | 'created_at'>>('SELECT platform, external_user_id, created_at FROM affiliate_accounts WHERE user_id=$1', [userId])).rows.map((r) => ({ platform: r.platform, externalUserId: r.external_user_id, connectedAt: r.created_at })) }; },
  async createLink(userId: string, p: { platform: string; originalUrl: string; priceCents?: number; publicationId?: string }) {
    if (!isAff(p.platform)) throw unprocessable('Plataforma sem programa de afiliados'); if (!(await this.enabled(userId))) throw new AppError(503, 'affiliates_disabled', 'Afiliados temporariamente desativado');
    if (!/^https?:\/\//i.test(p.originalUrl)) throw unprocessable('URL inválida');
    const id = (await pool.query<{ id: string | null }>(`SELECT gen_random_uuid() id`)).rows[0].id as string; const tracking = `${env.PUBLIC_API_URL}/r/${id}`;
    const r = await pool.query<Row<'affiliate_links'>>(`INSERT INTO affiliate_links (id,publication_id,user_id,platform,original_url,tracking_url,price_cents) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [id, p.publicationId ?? null, userId, p.platform, p.originalUrl, tracking, p.priceCents ?? 0]);
    return linkDto(r.rows[0]);
  },
  /** Chamado pelo worker após publicar com `metadata.affiliate`. Idempotente por publicação. */
  async autoLink(userId: string, publicationId: string, platform: AffPlatform, url: string, priceCents: number) {
    const ex = (await pool.query<Row<'affiliate_links'>>('SELECT * FROM affiliate_links WHERE publication_id=$1', [publicationId])).rows[0]; if (ex) return linkDto(ex);
    if (!(await pool.query<{ "?column?": number | null }>('SELECT 1 FROM affiliate_accounts WHERE user_id=$1 AND platform=$2', [userId, platform])).rowCount) { logger.info({ userId, platform }, 'sem conta de afiliado — link não criado'); return null; }
    return this.createLink(userId, { platform, originalUrl: url || `https://${platform}.example/produto`, priceCents, publicationId });
  },
  async links(userId: string) { return { items: (await pool.query<Row<'affiliate_links'>>('SELECT * FROM affiliate_links WHERE user_id=$1 ORDER BY created_at DESC LIMIT 200', [userId])).rows.map(linkDto) }; },
  async earnings(userId: string) {
    const u = (await usersRepo.byId(pool, userId))!;
    const t = (await pool.query<{ clicks: number; conv: number; total: number }>(`SELECT COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(conversions),0) conv, COALESCE(SUM(commission_cents),0) total FROM affiliate_links WHERE user_id=$1`, [userId])).rows[0];
    const byPlatform = (await pool.query<{ platform: string; clicks: number | null; conversions: number | null; commission_cents: number | null }>(`SELECT platform, SUM(clicks) clicks, SUM(conversions) conversions, SUM(commission_cents) commission_cents FROM affiliate_links WHERE user_id=$1 GROUP BY platform`, [userId])).rows;
    return { balanceCents: u.affiliate_balance_cents, totalCommissionCents: t.total, clicks: t.clicks, conversions: t.conv, byPlatform, platformFeePct: PLATFORM_FEE_PCT, rates: AFF_RATE };
  },
  /** Resolve destino do redirecionamento com cache Redis (p95 < 150ms): GET + LPUSH, nada de escrita síncrona no Postgres. */
  async resolve(linkId: string): Promise<string | null> {
    const c = await redis.get(`aff:url:${linkId}`); if (c) return c === '-' ? null : c;
    const r = (await pool.query<Pick<Row<'affiliate_links'>, 'original_url'>>(`SELECT original_url FROM affiliate_links WHERE id=$1 AND status='active'`, [linkId])).rows[0];
    await redis.set(`aff:url:${linkId}`, r?.original_url ?? '-', 'EX', r ? 3600 : 60); return r?.original_url ?? null;
  },
  async recordClick(linkId: string, ip: string, ua: string | undefined) { await redis.lpush(BUF, JSON.stringify({ linkId, ip: hashIp(ip), ua: (ua ?? '').slice(0, 200), at: Date.now() })); },
  /** Worker de tracking: esvazia o buffer em lote (INSERT multi-linha + UPDATE agregado). */
  async flushClicks(max = 5000): Promise<number> {
    const raw: string[] = []; for (let i = 0; i < max; i++) { const x = await redis.rpop(BUF); if (!x) break; raw.push(x); } if (!raw.length) return 0;
    const ev = raw.map((x) => JSON.parse(x) as { linkId: string; ip: string; ua: string; at: number });
    const ids = [...new Set(ev.map((e) => e.linkId))]; const valid = new Set((await pool.query<{ id: string }>('SELECT id FROM affiliate_links WHERE id = ANY($1::uuid[])', [ids])).rows.map((r) => r.id as string)); const good = ev.filter((e) => valid.has(e.linkId));
    if (!good.length) return raw.length;
    try {
      await pool.query(`INSERT INTO affiliate_clicks (link_id, ip_hash, user_agent, created_at) SELECT * FROM unnest($1::uuid[], $2::text[], $3::text[], $4::timestamptz[])`, [good.map((e) => e.linkId), good.map((e) => e.ip), good.map((e) => e.ua), good.map((e) => new Date(e.at).toISOString())]);
      const counts = new Map<string, number>(); for (const e of good) counts.set(e.linkId, (counts.get(e.linkId) ?? 0) + 1);
      await pool.query(`UPDATE affiliate_links l SET clicks = l.clicks + v.n FROM unnest($1::uuid[], $2::int[]) AS v(id, n) WHERE l.id = v.id`, [[...counts.keys()], [...counts.values()]]);
    } catch (e) { for (const x of raw) await redis.rpush(BUF, x); throw e; } // devolve ao buffer: nenhum clique perdido
    return raw.length;
  },
  /** Conversão confirmada pela plataforma. Idempotente por (link, order). Credita comissão líquida no saldo do afiliado. */
  async recordConversion(p: { linkId: string; orderId: string; amountCents: number }) {
    return asSystem(async (db) => {
      const link = (await db.query<Row<'affiliate_links'>>('SELECT * FROM affiliate_links WHERE id=$1 FOR UPDATE', [p.linkId])).rows[0]; if (!link) throw notFound('Link de afiliado não encontrado');
      const c = commissionOf(link.platform as AffPlatform, p.amountCents) // links só são criados para plataformas de afiliado (isAff);
      const ins = await db.query<{ id: string }>(`INSERT INTO affiliate_conversions (link_id, order_id, amount_cents, commission_cents) VALUES ($1,$2,$3,$4) ON CONFLICT (link_id, order_id) DO NOTHING RETURNING id`, [p.linkId, p.orderId, p.amountCents, c.net]);
      if (!ins.rowCount) return { duplicate: true, commissionCents: 0 };
      await db.query('UPDATE affiliate_links SET conversions=conversions+1, commission_cents=commission_cents+$2 WHERE id=$1', [p.linkId, c.net]);
      await db.query('UPDATE users SET affiliate_balance_cents=affiliate_balance_cents+$2 WHERE id=$1', [link.user_id, c.net]);
      await usersRepo.tx(db, { userId: link.user_id, type: 'affiliate_commission', amountCents: c.net, source: 'affiliate', externalRef: `conv-${ins.rows[0].id}` });
      m.affCommission.inc(c.net); return { duplicate: false, commissionCents: c.net, gross: c.gross, fee: c.fee };
    });
  },
};
