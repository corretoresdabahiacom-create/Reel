import { pool } from '../../db/pool.js';
import { systemScope } from '../../db/context.js';
import { env } from '../../config/env.js';
import { hmacHex } from '../../utils/crypto.js';
import { logger } from '../../observability/logger.js';
import { validateEvent, TAXONOMY_VERSION } from './taxonomy.js';
import { hasAnalyticsConsent } from '../growth/consent.js';

/** user_id pseudonimizado (HMAC com sal próprio): é o único identificador que sai para o warehouse. */
export const pseudo = (userId: string) => hmacHex(env.ANALYTICS_PSEUDO_SALT, userId).slice(0, 32);
export interface IngestEvent { name: string; props: Record<string, unknown>; eventId?: string }
export interface IngestResult { accepted: number; quarantined: number; rejected: Array<{ index: number; reason: string }> }
type Hook = (userId: string, name: string, props: Record<string, unknown>) => Promise<void>;
const hooks: Hook[] = []; /** Assinantes de eventos de negócio (experimentos). Evita import circular. */
export const onEvent = (h: Hook) => { hooks.push(h); };

async function insert(rows: Array<{ userId: string | null; name: string; props: object; anonId?: string; sessionId?: string; version: number; source: string; eventId?: string }>): Promise<number> {
  if (!rows.length) return 0;
  const r = await systemScope('analytics: pipeline de telemetria grava eventos já validados/pseudonimizados', () => pool.query(`INSERT INTO analytics_events (user_id, pseudo_id, name, props, anon_id, session_id, schema_version, source, event_id)
    SELECT u, p, n, pr::jsonb, a, s, v, src, e FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::smallint[], $8::text[], $9::uuid[]) AS t(u,p,n,pr,a,s,v,src,e)
    ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING`,
  [rows.map((x) => x.userId), rows.map((x) => (x.userId ? pseudo(x.userId) : null)), rows.map((x) => x.name), rows.map((x) => JSON.stringify(x.props)), rows.map((x) => x.anonId ?? null), rows.map((x) => x.sessionId ?? null), rows.map((x) => x.version), rows.map((x) => x.source), rows.map((x) => x.eventId ?? null)]));
  return r.rowCount ?? 0;
}
/** Ingestão vinda do client (lote). Sem consentimento ativo de `cookies` → user_id/pseudo_id nulos (só agregado). */
export async function ingestClient(userId: string | null, events: IngestEvent[], ctx: { anonId?: string; sessionId?: string } = {}): Promise<IngestResult> {
  const consent = userId ? await hasAnalyticsConsent(userId) : false; const uid = userId && consent ? userId : null; const rejected: IngestResult['rejected'] = []; let quarantined = 0;
  const rows: Parameters<typeof insert>[0] = []; events.forEach((ev, index) => {
    const v = validateEvent(ev.name, ev.props, 'client'); if (!v.ok) { rejected.push({ index, reason: v.reason }); return; } if (v.quarantine) quarantined++;
    rows.push({ userId: uid, name: ev.name, props: v.props, anonId: uid ? undefined : ctx.anonId, sessionId: ctx.sessionId, version: v.quarantine ? 0 : TAXONOMY_VERSION, source: 'client', eventId: ev.eventId });
  });
  await insert(rows);
  if (userId) for (const row of rows) if (!row.name.startsWith('experiment_')) for (const h of hooks) h(userId, row.name, row.props as Record<string, unknown>).catch(() => undefined); // conversões de experimento só para eventos permitidos ao client
  return { accepted: rows.length, quarantined, rejected };
}
/** Evento de servidor (fonte da verdade para dinheiro/ativação). Nunca lança: analytics jamais derruba o fluxo de negócio. */
export async function track(userId: string | null, name: string, props: Record<string, unknown> = {}, opts: { forceIdentified?: boolean } = {}): Promise<void> {
  try {
    const v = validateEvent(name, props, 'server'); if (!v.ok) { logger.warn({ name, reason: v.reason }, 'evento de servidor inválido descartado'); return; }
    const identified = !!userId && (opts.forceIdentified || (await hasAnalyticsConsent(userId)));
    await insert([{ userId: identified ? userId : null, name, props: v.props, version: v.quarantine ? 0 : TAXONOMY_VERSION, source: 'server' }]);
    if (userId) for (const h of hooks) await h(userId, name, v.props).catch((e) => logger.warn({ err: (e as Error).message }, 'hook de evento falhou'));
  } catch (e) { logger.warn({ name, err: (e as Error).message }, 'track falhou (ignorado)'); }
}
