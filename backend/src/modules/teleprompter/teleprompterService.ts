import { z } from 'zod';
import { asUser, tx } from '../../db/pool.js';
import { storage, signRef, refLocation } from '../../providers/storage.js';
import { audit } from '../../repositories/audit.js';
import { a11yError, requireA11y } from '../accessibility/messages.js';

/**
 * Módulo 11 — Teleprompter (`ff_teleprompter`), mobile e desktop.
 * - `startSession`: guarda roteiro e ajustes (velocidade em palavras/min, tamanho, espelhamento, contagem regressiva).
 * - `recordSession`: a gravação fica NO APARELHO; só chega aqui quando o usuário escolhe enviar ao projeto. O envio exige o
 *   cabeçalho `x-upload-opt-in: true` (conferido ANTES de ler o corpo — sem ele nenhum byte é lido) e só aceita WebM/MP4.
 *   Câmera e microfone são pedidos pelo app, explicitamente, só quando a pessoa toca em "Gravar" (nada disso passa pelo servidor).
 * Sem `ai_usage`: o teleprompter não chama provedor de IA.
 */
export const settingsSchema = z.object({ wpm: z.number().int().min(60).max(220).default(130), fontScale: z.number().min(1).max(3).default(1.6), mirror: z.boolean().default(false), countdownSec: z.number().int().min(0).max(10).default(3), guide: z.boolean().default(true) }).strict();
export const startSchema = z.object({ script: z.string().trim().min(1).max(20000), projectId: z.string().uuid().optional(), settings: settingsSchema.partial().optional() }).strict();
interface TRow { id: string; user_id: string; project_id: string | null; script: string; settings_json: z.infer<typeof settingsSchema>; recorded_video_url: string | null; upload_opt_in_at: string | null; recorded_bytes: string | null; recorded_mime: string | null; created_at: string }
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
async function dto(r: TRow) {
  const w = words(r.script);
  return { sessionId: r.id, projectId: r.project_id, script: r.script, settings: r.settings_json, words: w, estimatedSec: Math.ceil((w / r.settings_json.wpm) * 60) + r.settings_json.countdownSec,
    recording: r.recorded_video_url ? { uploaded: true, uploadOptInAt: r.upload_opt_in_at, bytes: Number(r.recorded_bytes), mime: r.recorded_mime, url: await signRef(r.recorded_video_url, 3600) } : { uploaded: false, storedOn: 'device' }, createdAt: r.created_at };
}
const get = async (userId: string, id: string) => { const r = await asUser(userId, async (db) => (await db.query<TRow>('SELECT * FROM teleprompter_sessions WHERE id=$1', [id])).rows[0]); if (!r) throw a11yError(404, 'session_not_found', undefined, 'not_found'); return r; };
/** WebM (EBML 1A45DFA3) ou MP4 (`ftyp` no byte 4). */
export const sniffRecording = (b: Buffer): 'video/webm' | 'video/mp4' | null => (b.length > 12 && b.readUInt32BE(0) === 0x1a45dfa3 ? 'video/webm' : b.length > 12 && b.subarray(4, 8).toString('latin1') === 'ftyp' ? 'video/mp4' : null);
export const teleprompterService = {
  async startSession(userId: string, b: z.infer<typeof startSchema>) {
    await requireA11y('ff_teleprompter', userId); const settings = settingsSchema.parse(b.settings ?? {});
    if (b.projectId) { const ok = await asUser(userId, async (db) => (await db.query<{ "?column?": number | null }>('SELECT 1 FROM projects WHERE id=$1 AND deleted_at IS NULL', [b.projectId])).rowCount); if (!ok) throw a11yError(404, 'project_not_found', undefined, 'not_found'); }
    const r = await tx({ userId }, async (db) => { const x = (await db.query<TRow>('INSERT INTO teleprompter_sessions (user_id, project_id, script, settings_json) VALUES ($1,$2,$3,$4) RETURNING *', [userId, b.projectId ?? null, b.script, settings])).rows[0]!;
      await audit(db, userId, 'teleprompter.start', 'teleprompter_session', x.id, { words: words(b.script), wpm: settings.wpm, mirror: settings.mirror }); return x; }); // sem o roteiro
    return dto(r);
  },
  /** Envio da gravação ao projeto — só com opt-in explícito (a rota já recusou sem o cabeçalho antes de ler o corpo). */
  async recordSession(userId: string, id: string, body: Buffer, optIn: boolean) {
    await requireA11y('ff_teleprompter', userId); if (optIn !== true) throw a11yError(422, 'upload_opt_in_required');
    const r = await get(userId, id); if (r.recorded_video_url) throw a11yError(409, 'already_uploaded');
    const mime = Buffer.isBuffer(body) ? sniffRecording(body) : null; if (!mime) throw a11yError(415, 'not_a_recording');
    const key = `teleprompter/${userId}/${id}.${mime === 'video/webm' ? 'webm' : 'mp4'}`; await storage.put('videos', key, body, mime);
    const out = await tx({ userId }, async (db) => { const x = (await db.query<TRow>(`UPDATE teleprompter_sessions SET recorded_video_url=$2, upload_opt_in_at=now(), recorded_bytes=$3, recorded_mime=$4, updated_at=now() WHERE id=$1 RETURNING *`, [id, key, body.length, mime])).rows[0]!;
      await audit(db, userId, 'teleprompter.upload', 'teleprompter_session', id, { bytes: body.length, mime, optIn: true }); return x; });
    return dto(out);
  },
  async get(userId: string, id: string) { await requireA11y('ff_teleprompter', userId); return dto(await get(userId, id)); },
  async list(userId: string) { await requireA11y('ff_teleprompter', userId); const rows = await asUser(userId, async (db) => (await db.query<TRow>('SELECT * FROM teleprompter_sessions ORDER BY created_at DESC LIMIT 50')).rows); return { items: await Promise.all(rows.map(dto)) }; },
  async remove(userId: string, id: string) {
    await requireA11y('ff_teleprompter', userId); const r = await get(userId, id);
    if (r.recorded_video_url) { const l = refLocation(r.recorded_video_url); await storage.delete?.(l.bucket, l.key).catch(() => undefined); }
    await tx({ userId }, async (db) => { await db.query('DELETE FROM teleprompter_sessions WHERE id=$1', [id]); await audit(db, userId, 'teleprompter.delete', 'teleprompter_session', id, {}); });
  },
};
