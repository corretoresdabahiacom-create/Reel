import { z } from 'zod';
import { asUser, tx } from '../../db/pool.js';
import { audit } from '../../repositories/audit.js';
import { m10Error, requireM10 } from '../m10/common.js';

/**
 * Módulo 10 — Conteúdo seriado / mininovelas (`ff_series`). Cada episódio é um projeto do usuário, em ordem, com CTA
 * próprio por capítulo e continuidade ("Anteriormente…" + "Próximo capítulo") montada por `linkEpisodes`.
 * Templates definem o tom da continuidade (mininovela, tutorial, lançamento, livre). Tudo só do dono (RLS).
 */
export const MAX_EPISODES = 50;
export const TEMPLATES = {
  mininovela: { recap: { 'pt-BR': 'Anteriormente em {{series}}: {{prev}}', en: 'Previously on {{series}}: {{prev}}', es: 'Anteriormente en {{series}}: {{prev}}' }, next: { 'pt-BR': 'Assista ao capítulo {{n}}', en: 'Watch chapter {{n}}', es: 'Mira el capítulo {{n}}' } },
  tutorial: { recap: { 'pt-BR': 'Na aula anterior: {{prev}}', en: 'In the previous lesson: {{prev}}', es: 'En la clase anterior: {{prev}}' }, next: { 'pt-BR': 'Ir para a aula {{n}}', en: 'Go to lesson {{n}}', es: 'Ir a la clase {{n}}' } },
  lancamento: { recap: { 'pt-BR': 'Você viu: {{prev}}', en: 'You saw: {{prev}}', es: 'Viste: {{prev}}' }, next: { 'pt-BR': 'Parte {{n}}: a revelação', en: 'Part {{n}}: the reveal', es: 'Parte {{n}}: la revelación' } },
  livre: { recap: { 'pt-BR': 'Antes: {{prev}}', en: 'Before: {{prev}}', es: 'Antes: {{prev}}' }, next: { 'pt-BR': 'Continua no episódio {{n}}', en: 'Continues in episode {{n}}', es: 'Continúa en el episodio {{n}}' } },
} as const;
const httpsUrl = z.string().trim().max(2048).url().refine((u) => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password; } catch { return false; } }, 'invalid_cta_url');
export const createSchema = z.object({ title: z.string().trim().min(1).max(120), description: z.string().trim().max(1000).optional(), template: z.enum(['mininovela', 'tutorial', 'lancamento', 'livre']).optional() }).strict();
export const episodeSchema = z.object({ projectId: z.string().uuid(), ctaUrl: z.string().optional(), ctaLabel: z.string().trim().min(1).max(60).optional() }).strict();
export const linkSchema = z.object({ episodeIds: z.array(z.string().uuid()).min(1).max(MAX_EPISODES) }).strict();
export const ctaSchema = z.object({ ctaUrl: z.string().nullable().optional(), ctaLabel: z.string().trim().min(1).max(60).nullable().optional() }).strict();
const checkCta = (u: string | null | undefined) => { if (u === undefined || u === null || u === '') return null; const r = httpsUrl.safeParse(u); if (!r.success) throw m10Error(422, 'invalid_cta_url'); return r.data; };
type Tpl = keyof typeof TEMPLATES; type Loc = 'pt-BR' | 'en' | 'es';
interface SRow { id: string; user_id: string; title: string; description: string; template: Tpl; created_at: string; updated_at: string }
interface ERow { id: string; series_id: string; project_id: string; order: number; cta_url: string | null; cta_label: string | null; recap_text: string | null; title: string; status: string; duration_sec: number | null; last_text: string | null }
const fill = (t: string, v: Record<string, string | number>) => t.replace(/\{\{(\w+)\}\}/g, (_, k) => String(v[k] ?? ''));
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const getSeries = async (userId: string, id: string) => { const s = await asUser(userId, async (db) => (await db.query<SRow>('SELECT * FROM series WHERE id=$1', [id])).rows[0]); if (!s) throw m10Error(404, 'series_not_found', undefined, 'not_found'); return s; };
const episodes = (userId: string, seriesId: string) => asUser(userId, async (db) => (await db.query<ERow>(`SELECT e.id, e.series_id, e.project_id, e."order", e.cta_url, e.cta_label, e.recap_text, p.title, p.status, p.duration_sec,
  (SELECT s.text FROM scenes s WHERE s.project_id = p.id ORDER BY s.index DESC, s.selected DESC, s.version DESC LIMIT 1) AS last_text
  FROM series_episodes e JOIN projects p ON p.id = e.project_id WHERE e.series_id=$1 AND p.deleted_at IS NULL ORDER BY e."order"`, [seriesId])).rows);
/** Recalcula "Anteriormente…" de cada episódio a partir do anterior (título + fim do último texto). */
async function relink(db: import('pg').PoolClient, s: SRow, eps: ERow[], loc: Loc) {
  for (const [i, e] of eps.entries()) {
    const recap = recapOf(s, eps[i - 1], loc);
    await db.query('UPDATE series_episodes SET recap_text=$2 WHERE id=$1', [e.id, recap]); e.recap_text = recap;
  }
}
const recapOf = (s: SRow, prev: ERow | undefined, loc: Loc) => (prev ? cut(fill(TEMPLATES[s.template].recap[loc], { series: s.title, prev: cut(prev.last_text?.trim() || prev.title, 140) }), 280) : null);
function view(s: SRow, eps: ERow[], loc: Loc) {
  return { seriesId: s.id, title: s.title, description: s.description, template: s.template, createdAt: s.created_at, episodeCount: eps.length,
    // `eps[i ± 1]` pode não existir (sem noUncheckedIndexedAccess o TS acharia que sempre existe): expressão explícita → `ERow | undefined`
    episodes: eps.map((e, i) => { const next = i + 1 < eps.length ? eps[i + 1] : undefined; const prev = i > 0 ? eps[i - 1] : undefined;
      return { episodeId: e.id, order: e.order, projectId: e.project_id, title: e.title, ready: e.status === 'ready', durationSec: e.duration_sec, recap: recapOf(s, prev, loc), // no idioma pedido; `recap_text` guarda a versão gravada no último encadeamento
        prevEpisodeId: prev?.id ?? null, nextEpisodeId: next?.id ?? null,
        cta: { url: e.cta_url, label: e.cta_label ?? (next ? fill(TEMPLATES[s.template].next[loc], { n: next.order }) : null), kind: e.cta_url ? 'custom' : next ? 'next_episode' : 'none' } }; }) };
}
const locOf = (l?: string): Loc => (l === 'en' || l === 'es' ? l : 'pt-BR');
export const seriesService = {
  async createSeries(userId: string, b: z.infer<typeof createSchema>) {
    await requireM10('ff_series', userId);
    const s = await tx({ userId }, async (db) => { const r = (await db.query<SRow>('INSERT INTO series (user_id, title, description, template) VALUES ($1,$2,$3,$4) RETURNING *', [userId, b.title, b.description ?? '', b.template ?? 'mininovela'])).rows[0]!;
      await audit(db, userId, 'series.create', 'series', r.id, { template: r.template }); return r; });
    return view(s, [], 'pt-BR');
  },
  async addEpisode(userId: string, seriesId: string, b: z.infer<typeof episodeSchema>, locale?: string) {
    await requireM10('ff_series', userId); const s = await getSeries(userId, seriesId); const cta = checkCta(b.ctaUrl);
    await tx({ userId }, async (db) => {
      await db.query('SELECT 1 FROM series WHERE id=$1 FOR UPDATE', [seriesId]);
      const p = (await db.query<{ "?column?": number | null }>('SELECT 1 FROM projects WHERE id=$1 AND deleted_at IS NULL', [b.projectId])).rowCount; if (!p) throw m10Error(404, 'project_not_found', undefined, 'not_found'); // RLS: projeto de outra pessoa não aparece
      const n = (await db.query<{ n: number; mx: number }>('SELECT count(*)::int n, COALESCE(max("order"),0)::int mx FROM series_episodes WHERE series_id=$1', [seriesId])).rows[0]!;
      if (n.n >= MAX_EPISODES) throw m10Error(422, 'too_many_episodes');
      if ((await db.query<{ "?column?": number | null }>('SELECT 1 FROM series_episodes WHERE series_id=$1 AND project_id=$2', [seriesId, b.projectId])).rowCount) throw m10Error(409, 'episode_exists');
      await db.query('INSERT INTO series_episodes (series_id, project_id, "order", cta_url, cta_label, user_id) VALUES ($1,$2,$3,$4,$5,$6)', [seriesId, b.projectId, n.mx + 1, cta, b.ctaLabel ?? null, userId]);
      await db.query('UPDATE series SET updated_at=now() WHERE id=$1', [seriesId]);
      await relink(db, s, await episodesIn(db, seriesId), locOf(locale));
    });
    return view(s, await episodes(userId, seriesId), locOf(locale));
  },
  /** Reordena (lista completa de episódios) e refaz a continuidade. A troca é atômica (UNIQUE adiável). */
  async linkEpisodes(userId: string, seriesId: string, ids: string[], locale?: string) {
    await requireM10('ff_series', userId); const s = await getSeries(userId, seriesId);
    await tx({ userId }, async (db) => {
      await db.query('SELECT 1 FROM series WHERE id=$1 FOR UPDATE', [seriesId]);
      const cur = (await db.query<{ id: string }>('SELECT id FROM series_episodes WHERE series_id=$1', [seriesId])).rows.map((r) => r.id);
      if (ids.length !== cur.length || new Set(ids).size !== ids.length || !ids.every((x) => cur.includes(x))) throw m10Error(422, 'invalid_order');
      await db.query('SET CONSTRAINTS series_episodes_order_key DEFERRED');
      for (const [i, id] of ids.entries()) await db.query('UPDATE series_episodes SET "order"=$2 WHERE id=$1', [id, i + 1]);
      await relink(db, s, await episodesIn(db, seriesId), locOf(locale));
      await audit(db, userId, 'series.link', 'series', seriesId, { episodes: ids.length });
    });
    return view(s, await episodes(userId, seriesId), locOf(locale));
  },
  async updateEpisode(userId: string, seriesId: string, episodeId: string, b: z.infer<typeof ctaSchema>, locale?: string) {
    await requireM10('ff_series', userId); const s = await getSeries(userId, seriesId);
    const sets: string[] = []; const vals: unknown[] = [episodeId, seriesId];
    if (b.ctaUrl !== undefined) { vals.push(checkCta(b.ctaUrl)); sets.push(`cta_url=$${vals.length}`); }
    if (b.ctaLabel !== undefined) { vals.push(b.ctaLabel); sets.push(`cta_label=$${vals.length}`); }
    if (sets.length) { const n = await asUser(userId, async (db) => (await db.query(`UPDATE series_episodes SET ${sets.join(', ')} WHERE id=$1 AND series_id=$2`, vals)).rowCount); if (!n) throw m10Error(404, 'episode_not_found', undefined, 'not_found'); }
    return view(s, await episodes(userId, seriesId), locOf(locale));
  },
  async removeEpisode(userId: string, seriesId: string, episodeId: string, locale?: string) {
    await requireM10('ff_series', userId); const s = await getSeries(userId, seriesId);
    await tx({ userId }, async (db) => {
      const n = (await db.query('DELETE FROM series_episodes WHERE id=$1 AND series_id=$2', [episodeId, seriesId])).rowCount; if (!n) throw m10Error(404, 'episode_not_found', undefined, 'not_found');
      const rest = await episodesIn(db, seriesId); await db.query('SET CONSTRAINTS series_episodes_order_key DEFERRED');
      for (const [i, e] of rest.entries()) { await db.query('UPDATE series_episodes SET "order"=$2 WHERE id=$1', [e.id, i + 1]); e.order = i + 1; }
      await relink(db, s, rest, locOf(locale));
    });
    return view(s, await episodes(userId, seriesId), locOf(locale));
  },
  async get(userId: string, seriesId: string, locale?: string) { await requireM10('ff_series', userId); const s = await getSeries(userId, seriesId); return view(s, await episodes(userId, seriesId), locOf(locale)); },
  async list(userId: string) {
    await requireM10('ff_series', userId);
    const rows = await asUser(userId, async (db) => (await db.query<SRow & { n: number }>('SELECT s.*, (SELECT count(*)::int FROM series_episodes e WHERE e.series_id=s.id) n FROM series s ORDER BY s.updated_at DESC LIMIT 100')).rows);
    return { items: rows.map((s) => ({ seriesId: s.id, title: s.title, template: s.template, episodeCount: s.n, updatedAt: s.updated_at })) };
  },
  async remove(userId: string, seriesId: string) {
    await requireM10('ff_series', userId);
    const n = await tx({ userId }, async (db) => { const c = (await db.query('DELETE FROM series WHERE id=$1', [seriesId])).rowCount ?? 0; if (c) await audit(db, userId, 'series.delete', 'series', seriesId, {}); return c; });
    if (!n) throw m10Error(404, 'series_not_found', undefined, 'not_found');
  },
};
async function episodesIn(db: import('pg').PoolClient, seriesId: string): Promise<ERow[]> {
  return (await db.query<ERow>(`SELECT e.id, e.series_id, e.project_id, e."order", e.cta_url, e.cta_label, e.recap_text, p.title, p.status, p.duration_sec,
    (SELECT s.text FROM scenes s WHERE s.project_id = p.id ORDER BY s.index DESC, s.selected DESC, s.version DESC LIMIT 1) AS last_text
    FROM series_episodes e JOIN projects p ON p.id = e.project_id WHERE e.series_id=$1 ORDER BY e."order"`, [seriesId])).rows;
}
