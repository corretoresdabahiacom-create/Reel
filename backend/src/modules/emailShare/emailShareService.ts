import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { isEnabled } from '../flags.service.js';
import { enqueue, Q } from '../../queues/index.js';
import { storage, refLocation, safeFileName } from '../../providers/storage.js';
import { audioService } from '../audio/audio.service.js';
import { emailHash } from '../emails/email.service.js';
import { decrypt, encrypt } from '../../utils/crypto.js';
import { hashPassword, verifyPassword } from '../../utils/password.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { notFound } from '../../utils/errors.js';
import { zipStore } from '../export/zip.js';
import { isDisposable } from './disposable.js';
import { shareError, SHARE_MESSAGES } from './messages.js';
import { fmtDate, renderTemplate, t } from './template.js';

/**
 * Módulo 7 — Envio por e-mail (`ff_email`): `createSignedLink`, `sendEmail`, `sendBatch`.
 * - Link = `<shareId>.<exp>.<HMAC-SHA256(segredo, shareId.exp)>`, validade ≤ 7 dias, senha opcional (argon2id, o hash de
 *   senha já usado no projeto; recomendação atual da OWASP acima do bcrypt — sem biblioteca nova).
 * - Destinatários NUNCA em texto no banco, na auditoria ou nos logs: só `emailHash` (HMAC-SHA256 com pepper). Na fila de
 *   envio o endereço vai cifrado (AES-256-GCM, `toEnc`) e o log do driver leva só o hash.
 * - Anti-spam: ≤20 destinatários por envio (contando a cópia para si), domínios descartáveis bloqueados, mensagem sem
 *   links, teto diário por usuário, e um e-mail por destinatário (ninguém vê o endereço dos outros).
 */
export const FLAG = 'ff_email';
const recipient = z.string().trim().toLowerCase().email().max(254);
const common = {
  recipients: z.array(recipient).max(50).default([]),
  includeSelf: z.boolean().default(false),
  message: z.string().trim().max(280).optional(),
  senderName: z.string().trim().max(60).optional(),
  password: z.string().min(4).max(64).optional(),
};
export const sendBodySchema = z.object({ ...common, assetId: z.string().uuid().optional() }).strict();
export const batchBodySchema = z.object({ ...common, mode: z.enum(['per_item', 'zip']), itemIds: z.array(z.string().uuid()).min(1).max(200).optional() }).strict();
export type SendBody = z.infer<typeof sendBodySchema>;
export type BatchBody = z.infer<typeof batchBodySchema>;
interface UserLite { id: string; email: string; name: string; locale: string; timezone: string | null; region: string; plan: string }
interface ShareRow { id: string; user_id: string; asset_id: string | null; recipients_hash: string[]; sent_at: string | null; expires_at: string; password_hash: string | null; access_count: number; project_id: string | null;
  asset_kind: string; catalog_id: string | null; catalog_item_id: string | null; batch_id: string | null; file_ref: string | null; file_name: string | null; sender_name: string; message: string; locale: string;
  recipient_count: number; include_self: boolean; status: string; last_access_at: string | null; revoked_at: string | null; created_at: string }

const secret = () => env.EMAIL_SHARE_SECRET || createHmac('sha256', env.JWT_SECRET).update('nexusreel-email-share-v1').digest('hex'); // chave própria derivada
const sign = (id: string, exp: number) => createHmac('sha256', secret()).update(`${id}.${exp}`).digest('base64url');
export const linkUrl = (token: string) => `${env.PUBLIC_API_URL}/api/v1/s/${token}`;
/** Link assinado: HMAC sobre id + expiração. Mexer em qualquer parte invalida a assinatura. */
export function createSignedLink(shareId: string, expiresAt: Date): { token: string; url: string; expiresAt: string } {
  const exp = Math.floor(expiresAt.getTime() / 1000); const token = `${shareId}.${exp}.${sign(shareId, exp)}`;
  return { token, url: linkUrl(token), expiresAt: expiresAt.toISOString() };
}
export function verifyToken(token: string): { shareId: string; exp: number } | null {
  const m = /^([0-9a-f-]{36})\.(\d{9,11})\.([A-Za-z0-9_-]{43})$/.exec(token); if (!m) return null;
  const [, id, e, sig] = m; const exp = Number(e); const good = Buffer.from(sign(id!, exp)), got = Buffer.from(sig!);
  if (good.length !== got.length || !timingSafeEqual(good, got)) return null;
  return exp * 1000 > Date.now() ? { shareId: id!, exp } : null;
}

const lite = async (userId: string): Promise<UserLite> => {
  const u = await asSystem(async (db) => (await db.query<UserLite>('SELECT id, email, name, locale, timezone, region, plan FROM users WHERE id=$1 AND deleted_at IS NULL', [userId])).rows[0]);
  if (!u) throw notFound(); return u;
};
export async function requireEmail(userId: string): Promise<UserLite> {
  const u = await lite(userId); if (!(await isEnabled(FLAG, { userId, region: u.region, plan: u.plan }))) throw notFound(); return u;
}
const ownerFlagOn = async (userId: string) => { try { const u = await lite(userId); return isEnabled(FLAG, { userId, region: u.region, plan: u.plan }); } catch { return false; } };
/** Valida destinatários (anti-spam) e devolve a lista final (com a cópia para si, se pedida). */
async function checkRecipients(u: UserLite, b: { recipients: string[]; includeSelf: boolean; message?: string }, multiplier = 1): Promise<string[]> {
  const list = [...new Set(b.recipients)].filter((r) => r !== u.email.toLowerCase());
  const total = list.length + (b.includeSelf ? 1 : 0);
  if (total === 0) throw shareError(422, 'no_recipients');
  if (total > env.EMAIL_SHARE_MAX_RECIPIENTS) throw shareError(422, 'too_many_recipients', { max: env.EMAIL_SHARE_MAX_RECIPIENTS });
  const blocked = list.map((r, i) => (isDisposable(r) ? i : -1)).filter((i) => i >= 0);
  if (blocked.length) throw shareError(422, 'disposable_domain', { positions: blocked });
  if (b.message && /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ly|me|br|xyz|app)\b)/i.test(b.message)) throw shareError(422, 'message_has_link');
  const today = await asUser(u.id, async (db) => Number((await db.query<{ n: number }>(`SELECT COALESCE(SUM(recipient_count),0) AS n FROM email_shares WHERE user_id=$1 AND created_at > now() - interval '24 hours'`, [u.id])).rows[0].n));
  if (today + total * multiplier > env.EMAIL_SHARE_DAILY_RECIPIENTS) throw shareError(429, 'daily_limit', { limit: env.EMAIL_SHARE_DAILY_RECIPIENTS });
  return list;
}
const cleanName = (s: string | undefined, fallback: string) => ((s ?? fallback).replace(/[^\p{L}\p{N} .'-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'NexusReel');
/** Monta e enfileira um e-mail por destinatário (cifrado na fila; log só com hash). */
async function deliver(u: UserLite, s: Pick<ShareRow, 'id' | 'file_name' | 'sender_name' | 'message' | 'locale' | 'password_hash' | 'expires_at' | 'asset_kind'>, link: string, recipients: string[], self: boolean): Promise<void> {
  const l = s.locale; const date = fmtDate(new Date(s.expires_at), l, u.timezone); const file = s.file_name ?? 'video.mp4';
  const build = (isSelf: boolean) => {
    const heading = isSelf ? t(l, 'headingSelf') : t(l, 'heading', { name: s.sender_name }); const subject = isSelf ? t(l, 'subjectSelf', { file }) : t(l, 'subject', { name: s.sender_name });
    const vars = { lang: l, subject, heading, message: s.message, fileLabel: t(l, 'file'), fileName: file, link, button: t(l, s.asset_kind === 'zip' ? 'buttonZip' : 'button'), expires: t(l, 'expires', { date }),
      passwordNote: s.password_hash ? t(l, 'password') : '', footer: t(l, 'footer') };
    const text = t(l, 'text', { heading, message: s.message ? s.message + '\n\n' : '', file: t(l, 'file'), fileName: file, link, expires: t(l, 'expires', { date }), password: s.password_hash ? '\n' + t(l, 'password') : '' });
    return { template: 'raw', locale: l, vars: { subject, text }, html: renderTemplate('share.html', vars), logAs: 'hash' as const };
  };
  const other = build(false);
  for (const r of recipients) await enqueue(Q.emails, 'share', { ...other, toEnc: encrypt(r) }, { userId: u.id });
  if (self) await enqueue(Q.emails, 'share-self', { ...build(true), toEnc: encrypt(u.email) }, { userId: u.id });
}
async function videoOf(userId: string, projectId: string, u: UserLite) {
  const p = await asUser(userId, async (db) => (await db.query<{ id: string; title: string; status: string; final_video_url: string | null; active_audio_version_id: string | null; deleted_at: string | null }>(
    'SELECT id, title, status, final_video_url, active_audio_version_id, deleted_at FROM projects WHERE id=$1', [projectId])).rows[0]);
  if (!p || p.deleted_at) throw shareError(404, 'project_not_found', undefined, 'not_found');
  if (p.status !== 'ready' || !p.final_video_url) throw shareError(409, 'video_not_assembled');
  return { p, ref: (await audioService.effectiveVideoRef(p, u)) ?? p.final_video_url };
}

export const emailShareService = {
  createSignedLink,
  /** POST /projects/:projectId/email — vídeo do projeto (ou um asset do Módulo 6) para até 20 pessoas. */
  async sendEmail(userId: string, projectId: string, b: SendBody) {
    const u = await requireEmail(userId); const v = await videoOf(userId, projectId, u);
    let fileRef = v.ref, fileName = `${safeFileName(v.p.title)}.mp4`, kind = 'video', assetId: string | null = null;
    if (b.assetId) {
      const a = await asUser(userId, async (db) => (await db.query<{ id: string; file_url: string | null; file_name: string | null; status: string; source_project_id: string }>(
        'SELECT id, file_url, file_name, status, source_project_id FROM derived_assets WHERE id=$1', [b.assetId])).rows[0]);
      if (!a || a.source_project_id !== projectId) throw shareError(404, 'project_not_found', undefined, 'not_found');
      if (a.status !== 'done' || !a.file_url) throw shareError(409, 'asset_not_ready');
      fileRef = a.file_url; fileName = a.file_name ?? 'asset'; kind = 'derived_asset'; assetId = a.id;
    }
    const recipients = await checkRecipients(u, b);
    const expiresAt = new Date(Date.now() + env.EMAIL_SHARE_TTL_DAYS * 86400_000);
    const s = await tx({ userId }, async (db) => {
      const r = await db.query<ShareRow>(`INSERT INTO email_shares (user_id, asset_id, project_id, asset_kind, recipients_hash, recipient_count, include_self, expires_at, password_hash, file_ref, file_name, sender_name, message, locale, status, sent_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'sent',now()) RETURNING *`,
        [userId, assetId, projectId, kind, recipients.map(emailHash), recipients.length + (b.includeSelf ? 1 : 0), b.includeSelf, expiresAt, b.password ? await hashPassword(b.password) : null, fileRef, fileName,
          cleanName(b.senderName, u.name), b.message ?? '', u.locale]);
      await audit(db, userId, 'email_share.send', kind === 'derived_asset' ? 'derived_asset' : 'project', (assetId ?? projectId), { shareId: r.rows[0]!.id, recipientsHash: r.rows[0]!.recipients_hash, includeSelf: b.includeSelf, hasPassword: !!b.password, expiresAt: expiresAt.toISOString(), file: fileName });
      return r.rows[0]!;
    });
    const link = createSignedLink(s.id, expiresAt);
    await deliver(u, s, link.url, recipients, b.includeSelf);
    logger.info({ shareId: s.id, recipients: s.recipient_count, hasPassword: !!b.password, kind }, 'envio por e-mail'); // R7: sem e-mail nenhum
    return { shareId: s.id, status: 'sent', recipients: s.recipient_count, expiresAt: link.expiresAt, hasPassword: !!b.password, link: link.url, fileName };
  },
  /** POST /catalogs/:catalogId/email — B2B: um e-mail por produto (`per_item`) ou um único ZIP (`zip`). */
  async sendBatch(userId: string, catalogId: string, b: BatchBody) {
    const u = await requireEmail(userId);
    const cat = await asUser(userId, async (db) => (await db.query<{ id: string; name: string }>('SELECT id, name FROM catalogs WHERE id=$1', [catalogId])).rows[0]);
    if (!cat) throw shareError(404, 'catalog_not_found', undefined, 'not_found');
    const items = await asUser(userId, async (db) => (await db.query<{ id: string; sku: string; name: string; project_id: string | null; pstatus: string | null; final_video_url: string | null }>(
      `SELECT ci.id, ci.sku, ci.name, ci.project_id, p.status AS pstatus, p.final_video_url FROM catalog_items ci LEFT JOIN projects p ON p.id = ci.project_id AND p.deleted_at IS NULL
       WHERE ci.catalog_id=$1 AND ($2::uuid[] IS NULL OR ci.id = ANY($2)) ORDER BY ci.sku`, [catalogId, b.itemIds ?? null])).rows);
    const ready = items.filter((i) => i.project_id && i.pstatus === 'ready' && i.final_video_url);
    if (!ready.length) throw shareError(409, 'batch_empty');
    const perItem = b.mode === 'per_item';
    const totalRecipients = [...new Set(b.recipients)].length + (b.includeSelf ? 1 : 0);
    if (perItem && totalRecipients * ready.length > 100) throw shareError(422, 'batch_too_large', { max: 100 });
    const recipients = await checkRecipients(u, b, perItem ? ready.length : 1);
    const expiresAt = new Date(Date.now() + env.EMAIL_SHARE_TTL_DAYS * 86400_000); const batchId = randomUUID();
    const pw = b.password ? await hashPassword(b.password) : null; const sender = cleanName(b.senderName, u.name);
    const rows = await tx({ userId }, async (db) => {
      const out: ShareRow[] = [];
      const targets = perItem ? ready : [null];
      for (const it of targets) {
        const r = await db.query<ShareRow>(`INSERT INTO email_shares (user_id, project_id, asset_kind, catalog_id, catalog_item_id, batch_id, recipients_hash, recipient_count, include_self, expires_at, password_hash, file_ref, file_name, sender_name, message, locale, status, sent_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
          [userId, it?.project_id ?? null, it ? 'video' : 'zip', catalogId, it?.id ?? null, batchId, recipients.map(emailHash), recipients.length + (b.includeSelf ? 1 : 0), b.includeSelf, expiresAt, pw,
            it ? it.final_video_url : null, it ? `${safeFileName(cat.name)}-${safeFileName(it.sku)}.mp4` : `${safeFileName(cat.name)}.zip`, sender, b.message ?? '', u.locale, it ? 'sent' : 'preparing', it ? new Date() : null]);
        out.push(r.rows[0]!);
      }
      await audit(db, userId, 'email_share.batch', 'catalog', catalogId, { batchId, mode: b.mode, shares: out.map((x) => x.id), items: ready.length, recipientsHash: out[0]!.recipients_hash, hasPassword: !!pw });
      return out;
    });
    if (perItem) for (const s of rows) await deliver(u, s, createSignedLink(s.id, expiresAt).url, recipients, b.includeSelf);
    else await enqueue(Q.emailShare, 'zip', { shareId: rows[0]!.id, userId, recipientsEnc: recipients.map(encrypt), itemIds: ready.map((i) => i.id) }, { userId, jobId: `share-zip-${rows[0]!.id}` });
    logger.info({ batchId, mode: b.mode, shares: rows.length, items: ready.length, recipients: rows[0]!.recipient_count }, 'envio em lote por e-mail');
    return { batchId, mode: b.mode, status: perItem ? 'sent' : 'preparing', shares: rows.map((s) => ({ shareId: s.id, catalogItemId: s.catalog_item_id, fileName: s.file_name })), items: ready.length,
      skipped: items.filter((i) => !ready.includes(i)).map((i) => ({ itemId: i.id, sku: i.sku, reason: 'video_not_ready' })), expiresAt: expiresAt.toISOString() };
  },
  /** Worker `email-share` (lote ZIP): um ZIP com todos os produtos no bucket `exports` (some sozinho em 7 dias) → e-mails. */
  async processZip(d: { shareId: string; userId: string; recipientsEnc: string[]; itemIds: string[] }) {
    const s = await asSystem(async (db) => (await db.query<ShareRow>('SELECT * FROM email_shares WHERE id=$1', [d.shareId])).rows[0]);
    if (!s || s.status !== 'preparing') return { skipped: true };
    const u = await lite(s.user_id);
    const items = await asSystem(async (db) => (await db.query<{ sku: string; name: string; description: string; price: string; final_video_url: string; owner_id: string; catalog_name: string }>(
      `SELECT ci.sku, ci.name, ci.description, ci.price, p.final_video_url, c.owner_id, c.name AS catalog_name FROM catalog_items ci JOIN catalogs c ON c.id = ci.catalog_id JOIN projects p ON p.id = ci.project_id
       WHERE ci.id = ANY($1) AND c.id=$2 AND p.status='ready' AND p.deleted_at IS NULL ORDER BY ci.sku`, [d.itemIds, s.catalog_id])).rows);
    const entries = [];
    for (const it of items) {
      if (it.owner_id !== s.user_id) continue; // dono conferido de novo no worker
      const l = refLocation(it.final_video_url); const base = safeFileName(it.sku);
      entries.push({ name: `${base}/${base}.mp4`, data: await storage.get(l.bucket, l.key) }, { name: `${base}/ficha.json`, data: Buffer.from(JSON.stringify({ sku: it.sku, nome: it.name, descricao: it.description, preco: Number(it.price), catalogo: it.catalog_name }, null, 2)) });
    }
    const key = `${s.user_id}/share-${s.id}.zip`; await storage.put('exports', key, zipStore(entries), 'application/zip');
    await asSystem((db) => db.query(`UPDATE email_shares SET status='sent', sent_at=now(), file_ref=$2 WHERE id=$1`, [s.id, `exports:${key}`]));
    await deliver(u, s, createSignedLink(s.id, new Date(s.expires_at)).url, d.recipientsEnc.map(decrypt), s.include_self);
    logger.info({ shareId: s.id, items: items.length }, 'ZIP do lote enviado por e-mail'); return { ok: true };
  },
  /** Abre um link: valida HMAC + validade + revogação + flag do dono. */
  async open(token: string): Promise<ShareRow> {
    const v = verifyToken(token); if (!v) throw shareError(404, 'link_invalid', undefined, 'not_found');
    const s = await asSystem(async (db) => (await db.query<ShareRow>('SELECT * FROM email_shares WHERE id=$1', [v.shareId])).rows[0]);
    if (!s || s.status !== 'sent' || s.revoked_at || new Date(s.expires_at).getTime() <= Date.now() || Math.floor(new Date(s.expires_at).getTime() / 1000) !== v.exp) throw shareError(404, 'link_invalid', undefined, 'not_found');
    if (!(await ownerFlagOn(s.user_id))) throw shareError(404, 'link_invalid', undefined, 'not_found'); // flag desligada = link não funciona
    return s;
  },
  info(s: ShareRow) { return { fileName: s.file_name, senderName: s.sender_name, message: s.message, expiresAt: s.expires_at, needsPassword: !!s.password_hash, locale: s.locale }; },
  /** URL assinada curta (5 min) do arquivo; conta o acesso e audita. Senha (se houver) conferida antes, com limite de tentativas. */
  async download(token: string, password?: string): Promise<{ url: string; share: ShareRow }> {
    const s = await this.open(token);
    if (s.password_hash) {
      const k = `share:pw:${s.id}`; const n = Number((await redis.get(k)) ?? 0);
      if (n >= 5) throw shareError(429, 'too_many_attempts');
      if (!password || !(await verifyPassword(s.password_hash, password))) { await redis.multi().incr(k).expire(k, 900).exec(); throw shareError(401, 'wrong_password'); }
      await redis.del(k);
    }
    const ref = s.file_ref!; const l = ref.startsWith('exports:') ? { bucket: 'exports' as const, key: ref.slice(8) } : refLocation(ref);
    const url = await storage.signedGetUrl(l.bucket, l.key, 300, { downloadName: s.file_name ?? undefined });
    await asSystem(async (db) => { await db.query(`UPDATE email_shares SET access_count = access_count + 1, last_access_at = now() WHERE id=$1`, [s.id]); await audit(db, null, 'email_share.access', 'email_share', s.id, { shareId: s.id }); });
    return { url, share: s };
  },
  async list(userId: string) {
    await requireEmail(userId);
    const rows = await asUser(userId, async (db) => (await db.query<ShareRow>('SELECT * FROM email_shares WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100', [userId])).rows);
    return { items: rows.map((s) => ({ shareId: s.id, projectId: s.project_id, assetId: s.asset_id, kind: s.asset_kind, batchId: s.batch_id, fileName: s.file_name, recipients: s.recipient_count, includeSelf: s.include_self,
      hasPassword: !!s.password_hash, status: s.revoked_at ? 'revoked' : new Date(s.expires_at) < new Date() ? 'expired' : s.status, sentAt: s.sent_at, expiresAt: s.expires_at, accessCount: s.access_count, lastAccessAt: s.last_access_at })) };
  },
  /** Revoga um link antes do prazo. */
  async revoke(userId: string, shareId: string) {
    await requireEmail(userId);
    const n = await tx({ userId }, async (db) => { const r = await db.query(`UPDATE email_shares SET status='revoked', revoked_at=now() WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL`, [shareId, userId]);
      if (r.rowCount) await audit(db, userId, 'email_share.revoke', 'email_share', shareId); return r.rowCount ?? 0; });
    if (!n) throw shareError(404, 'share_not_found', undefined, 'not_found');
  },
  async config(userId: string) {
    await requireEmail(userId);
    return { maxRecipients: env.EMAIL_SHARE_MAX_RECIPIENTS, dailyRecipients: env.EMAIL_SHARE_DAILY_RECIPIENTS, ttlDays: env.EMAIL_SHARE_TTL_DAYS, messageMax: 280, passwordMin: 4, rateLimit: { perUserPerMin: 10, perIpPerMin: 30 }, messages: SHARE_MESSAGES };
  },
};
