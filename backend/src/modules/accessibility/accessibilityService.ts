import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { enqueue, Q } from '../../queues/index.js';
import { storage, refLocation, signRef } from '../../providers/storage.js';
import { recordUsage, synthesizeSpeech } from '../../providers/ai/router.js';
import { mockTranslate } from '../../providers/ai/heuristics.js';
import { encrypt, decrypt } from '../../utils/crypto.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { ffmpeg, ffprobeDuration, withTmp, writeFile } from '../../utils/ffmpeg.js';
import { spliceSpeech } from '../audio/audioMixer.js';
import { latestTranscript } from '../transcript/transcriptService.js';
import { a11yError, requireA11y } from './messages.js';
import { cues, resolveStyle, signExport, toAss, toSrt, toTxt, toVtt, verifyExport, STYLE_PRESETS, type W, type Style } from './captions.js';
import { describeScene, sanitize } from './describe.js';

/**
 * Módulo 11 — Acessibilidade (`ff_accessibility`). Fila `accessibility-generate` (idempotente: arquivo pronto não é refeito).
 * - `generateAnimatedCaptions`: legenda karaokê por palavra (ASS + vídeo novo com a legenda gravada), por idioma, em estilos
 *   acessíveis com contraste medido. Tempos vêm da transcrição do Módulo 9 (se houver e estiver atual) ou das cenas.
 * - `generateAudioDescription`: descreve as cenas (filtro de dados sensíveis) → `pending_review` → revisão HUMANA →
 *   gera a faixa narrada (TTS por cima do áudio original abaixado) + WebVTT `descriptions`. Sem revisão não exporta.
 * - `exportTranscript`: SRT/VTT/TXT ASSINADO (HMAC-SHA256), download por URL assinada, retenção de 90 dias.
 * Textos (legenda, descrição, transcrição) ficam CIFRADOS no banco e nunca vão para log. `ai_usage` em cada geração.
 */
const LOCALES = ['pt-BR', 'en', 'es'] as const; type Loc = (typeof LOCALES)[number];
export const captionsSchema = z.object({ locales: z.array(z.enum(LOCALES)).min(1).max(3), style: z.object({ preset: z.enum(Object.keys(STYLE_PRESETS) as [keyof typeof STYLE_PRESETS]).optional(), position: z.enum(['bottom', 'top']).optional(), fontScale: z.number().min(1).max(2).optional() }).strict().optional() }).strict();
export const adSchema = z.object({ locale: z.enum(LOCALES).optional() }).strict();
export const reviewSchema = z.object({ approve: z.literal(true), descriptions: z.array(z.object({ scene: z.number().int().min(0), text: z.string().trim().min(1).max(300) }).strict()).min(1).max(60).optional() }).strict();
export const exportSchema = z.object({ format: z.enum(['srt', 'vtt', 'txt']), locale: z.enum(LOCALES).optional() }).strict();
interface ARow { id: string; project_id: string; user_id: string; type: string; locale: Loc; file_url: string | null; extra_file_url: string | null; status: string; style_json: Style | Record<string, never>; content_json: { enc?: string } | null;
  signature: string | null; sha256: string | null; reviewed_by: string | null; reviewed_at: string | null; error_code: string | null; source_video_key: string | null; expires_at: string | null; created_at: string; updated_at: string }
interface PRow { id: string; status: string; final_video_url: string | null; source_locale: string }
const seal = (o: unknown) => ({ v: 1, enc: encrypt(JSON.stringify(o)) });
const open = <T>(o: { enc?: string } | null): T | null => (o?.enc ? (JSON.parse(decrypt(o.enc)) as T) : null);
const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const exec = promisify(execFile);
async function dims(file: string) { const { stdout } = await exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]); const [w, h] = stdout.trim().split(',').map(Number); return { width: w || 720, height: h || 1280 }; }
async function project(userId: string, projectId: string, needVideo = true): Promise<PRow> {
  const p = await asUser(userId, async (db) => (await db.query<PRow>('SELECT id, status, final_video_url, source_locale FROM projects WHERE id=$1 AND deleted_at IS NULL', [projectId])).rows[0]);
  if (!p) throw a11yError(404, 'project_not_found', undefined, 'not_found'); if (needVideo && (p.status !== 'ready' || !p.final_video_url)) throw a11yError(409, 'video_not_assembled'); return p;
}
const scenesOf = (projectId: string) => asSystem(async (db) => (await db.query<{ index: number; text: string; prompt: string; reference_mode: string; duration_sec: number }>(
  `SELECT DISTINCT ON (index) index, text, prompt, reference_mode, duration_sec FROM scenes WHERE project_id=$1 ORDER BY index, selected DESC, version DESC`, [projectId])).rows);
/** Janelas das cenas na duração real do vídeo (proporcional às durações das cenas). */
const spans = (sc: Array<{ index: number; duration_sec: number }>, durMs: number) => { const tot = sc.reduce((a, s) => a + s.duration_sec, 0) || 1; let at = 0; return sc.map((s) => { const d = (s.duration_sec / tot) * durMs; const r = { index: s.index, startMs: at, endMs: at + d }; at += d; return r; }); };
/** Palavras com tempo no idioma pedido: transcrição do Módulo 9 (idioma original, atual) ou texto das cenas espalhado na fala. */
async function wordsFor(userId: string, p: PRow, locale: Loc, durMs: number): Promise<{ words: W[]; source: 'transcript' | 'scenes'; translated: boolean }> {
  const sc = await scenesOf(p.id); const sp = spans(sc, durMs);
  if (locale === p.source_locale) { const t = await latestTranscript(userId, p.id).catch(() => null); if (t && !t.outdated && t.words.length) return { words: t.words.map((w) => ({ w: w.w, start: w.start, end: w.end, scene: w.scene })), source: 'transcript', translated: false }; }
  const words: W[] = [];
  for (const [i, s] of sc.entries()) {
    const text = locale === p.source_locale ? s.text : mockTranslate(s.text, locale).replace(/^\[[a-z-]+\]\s*/i, ''); const toks = text.split(/\s+/).filter(Boolean); const w0 = sp[i]!.startMs + (sp[i]!.endMs - sp[i]!.startMs) * 0.06, len = (sp[i]!.endMs - sp[i]!.startMs) * 0.88;
    const tot = toks.reduce((a, t) => a + t.length + 2, 0) || 1; let t = w0; for (const k of toks) { const d = ((k.length + 2) / tot) * len; words.push({ w: k, start: Math.round(t), end: Math.round(t + d * 0.9), scene: s.index }); t += d; }
  }
  return { words, source: 'scenes', translated: locale !== p.source_locale };
}
async function dto(r: ARow) {
  const ready = r.status === 'ready'; const c = open<Record<string, unknown>>(r.content_json);
  return { assetId: r.id, projectId: r.project_id, type: r.type, locale: r.locale, status: r.status, errorCode: r.error_code, createdAt: r.created_at, expiresAt: r.expires_at,
    style: Object.keys(r.style_json ?? {}).length ? r.style_json : null, reviewed: !!r.reviewed_at, reviewedAt: r.reviewed_at,
    descriptions: r.type === 'audio_description' ? ((c?.descriptions as unknown[]) ?? []) : undefined, words: r.type === 'captions_animated' && c ? (c.words as W[]) : undefined,
    signature: r.signature, sha256: r.sha256,
    fileUrl: ready && r.file_url ? await signRef(r.file_url, 3600) : null, extraFileUrl: ready && r.extra_file_url ? await signRef(r.extra_file_url, 3600) : null };
}
const getAsset = async (userId: string, id: string) => { const r = await asUser(userId, async (db) => (await db.query<ARow>('SELECT * FROM accessibility_assets WHERE id=$1', [id])).rows[0]); if (!r) throw a11yError(404, 'asset_not_found', undefined, 'not_found'); return r; };
const setAsset = (id: string, sql: string, vals: unknown[]) => asSystem((db) => db.query(`UPDATE accessibility_assets SET ${sql}, updated_at=now() WHERE id=$1`, [id, ...vals]));
async function fetchVideo(ref: string, dir: string) { const f = join(dir, 'src.mp4'); const l = refLocation(ref); await writeFile(f, await storage.get(l.bucket, l.key)); return f; }

export const accessibilityService = {
  config: async (userId: string) => { await requireA11y('ff_accessibility', userId); return { presets: Object.fromEntries(Object.keys(STYLE_PRESETS).map((k) => [k, resolveStyle({ preset: k as keyof typeof STYLE_PRESETS })])), locales: LOCALES, retentionDays: env.TRANSCRIPT_RETENTION_DAYS, minContrast: 4.5 }; },
  /** Legendas animadas por palavra (karaokê) em 1 a 3 idiomas. Um arquivo por idioma, na fila. */
  async generateAnimatedCaptions(userId: string, projectId: string, b: z.infer<typeof captionsSchema>) {
    await requireA11y('ff_accessibility', userId); const p = await project(userId, projectId); const st = resolveStyle(b.style ?? {});
    if (st.contrast.text < 4.5 || st.contrast.highlight < 4.5) throw a11yError(422, 'low_contrast', st.contrast);
    const rows = await tx({ userId }, async (db) => { const out: ARow[] = [];
      for (const loc of [...new Set(b.locales)]) out.push((await db.query<ARow>(`INSERT INTO accessibility_assets (project_id, user_id, type, locale, style_json, source_video_key) VALUES ($1,$2,'captions_animated',$3,$4,$5) RETURNING *`, [projectId, userId, loc, st, p.final_video_url])).rows[0]!);
      await audit(db, userId, 'a11y.captions.request', 'project', projectId, { locales: out.map((x) => x.locale), preset: st.preset }); return out; });
    for (const r of rows) await enqueue(Q.accessibilityGenerate, 'captions', { assetId: r.id }, { userId, jobId: `a11y-${r.id}` });
    return { items: await Promise.all(rows.map(dto)) };
  },
  /** Audiodescrição: gera as descrições (filtradas) e PARA em `pending_review`. */
  async generateAudioDescription(userId: string, projectId: string, b: z.infer<typeof adSchema>) {
    await requireA11y('ff_accessibility', userId); const p = await project(userId, projectId);
    const r = await tx({ userId }, async (db) => { const x = (await db.query<ARow>(`INSERT INTO accessibility_assets (project_id, user_id, type, locale, source_video_key) VALUES ($1,$2,'audio_description',$3,$4) RETURNING *`, [projectId, userId, b.locale ?? (p.source_locale as Loc), p.final_video_url])).rows[0]!;
      await audit(db, userId, 'a11y.ad.request', 'project', projectId, { assetId: x.id }); return x; });
    await enqueue(Q.accessibilityGenerate, 'audio_description', { assetId: r.id }, { userId, jobId: `a11y-${r.id}` });
    return dto(r);
  },
  /** Revisão humana: aprova (com edições opcionais, que passam de novo pelo filtro) e manda gerar a faixa narrada. */
  async reviewAudioDescription(userId: string, assetId: string, b: z.infer<typeof reviewSchema>) {
    await requireA11y('ff_accessibility', userId); const r = await getAsset(userId, assetId);
    if (r.type !== 'audio_description' || r.status !== 'pending_review') throw a11yError(409, 'not_reviewable');
    const cur = open<{ descriptions: Array<{ scene: number; startMs: number; endMs: number; text: string; redactions: number }> }>(r.content_json)!;
    let descs = cur.descriptions;
    if (b.descriptions) { const map = new Map(b.descriptions.map((d) => [d.scene, d.text]));
      if ([...map.keys()].some((k) => !descs.some((d) => d.scene === k))) throw a11yError(422, 'invalid_descriptions');
      descs = descs.map((d) => (map.has(d.scene) ? { ...d, ...(() => { const s = sanitize(map.get(d.scene)!); return { text: s.text, redactions: d.redactions + s.redactions }; })() } : d)); }
    await tx({ userId }, async (db) => { await db.query(`UPDATE accessibility_assets SET content_json=$2, reviewed_by=$3, reviewed_at=now(), status='queued', updated_at=now() WHERE id=$1`, [assetId, seal({ descriptions: descs }), userId]);
      await audit(db, userId, 'a11y.ad.review', 'accessibility_asset', assetId, { scenes: descs.length, edited: b.descriptions?.length ?? 0 }); }); // sem o texto
    await enqueue(Q.accessibilityGenerate, 'ad_render', { assetId }, { userId, jobId: `a11y-ad-${assetId}` });
    return dto(await getAsset(userId, assetId));
  },
  /** Transcrição completa assinada (síncrono: é texto). */
  async exportTranscript(userId: string, projectId: string, b: z.infer<typeof exportSchema>) {
    await requireA11y('ff_accessibility', userId); const p = await project(userId, projectId); const t0 = Date.now(); const loc = b.locale ?? (p.source_locale as Loc);
    const durMs = await withTmp(async (d) => Math.round((await ffprobeDuration(await fetchVideo(p.final_video_url!, d))) * 1000));
    const { words, source } = await wordsFor(userId, p, loc, durMs); const c = cues(words, { maxWords: 12, maxChars: 84, maxMs: 7000 });
    const content = b.format === 'srt' ? toSrt(c) : b.format === 'vtt' ? toVtt(c) : toTxt(c); const signature = signExport(content);
    const r = await tx({ userId }, async (db) => { const x = (await db.query<ARow>(`INSERT INTO accessibility_assets (project_id, user_id, type, locale, status, source_video_key, signature, sha256, expires_at, content_json) VALUES ($1,$2,$3,$4,'ready',$5,$6,$7,$8,$9) RETURNING *`,
      [projectId, userId, `transcript_${b.format}`, loc, p.final_video_url, signature, sha(content), new Date(Date.now() + env.TRANSCRIPT_RETENTION_DAYS * 86400_000), seal({ source, cues: c.length })])).rows[0]!;
      const key = `projects/${projectId}/a11y/transcript-${x.id}.${b.format}`; await storage.put('videos', key, Buffer.from(content, 'utf8'), b.format === 'vtt' ? 'text/vtt' : b.format === 'srt' ? 'application/x-subrip' : 'text/plain');
      await db.query('UPDATE accessibility_assets SET file_url=$2 WHERE id=$1', [x.id, key]); await audit(db, userId, 'a11y.transcript.export', 'project', projectId, { format: b.format, cues: c.length }); return { ...x, file_url: key }; });
    await recordUsage({ provider: 'local', operation: 'transcript_export', costCents: 0, latencyMs: Date.now() - t0, userId, projectId, status: 'ok' });
    return { ...(await dto(r)), format: b.format, signatureAlgorithm: 'HMAC-SHA256' };
  },
  /** Confere se um SRT/VTT/TXT é exatamente o que o NexusReel exportou (assinatura do conteúdo). */
  async verify(userId: string, content: string, signature: string) { await requireA11y('ff_accessibility', userId); const ok = verifyExport(content, signature); if (!ok) throw a11yError(422, 'invalid_signature'); return { valid: true, sha256: sha(content) }; },
  async get(userId: string, assetId: string) { await requireA11y('ff_accessibility', userId); const r = await getAsset(userId, assetId); if (r.type === 'audio_description' && r.status === 'ready' && !r.reviewed_at) throw a11yError(409, 'review_required'); return dto(r); },
  async list(userId: string, projectId: string) {
    await requireA11y('ff_accessibility', userId);
    const rows = await asUser(userId, async (db) => (await db.query<ARow>('SELECT * FROM accessibility_assets WHERE project_id=$1 ORDER BY created_at DESC LIMIT 50', [projectId])).rows); return { items: await Promise.all(rows.map(dto)) };
  },
  /** Worker `accessibility-generate`: `captions`, `audio_description`, `ad_render`. */
  async process(name: string, d: { assetId: string }, isFinal: boolean) {
    const r = await asSystem(async (db) => (await db.query<ARow>('SELECT * FROM accessibility_assets WHERE id=$1', [d.assetId])).rows[0]);
    if (!r) return { skipped: true };
    if (name === 'audio_description' ? r.status !== 'queued' && r.status !== 'processing' || !!r.content_json : r.status === 'ready' || r.status === 'pending_review') return { skipped: true };
    await setAsset(r.id, `status='processing'`, []); const t0 = Date.now();
    const p = await asSystem(async (db) => (await db.query<PRow>('SELECT id, status, final_video_url, source_locale FROM projects WHERE id=$1', [r.project_id])).rows[0]!);
    try {
      if (name === 'captions') {
        await withTmp(async (dir) => {
          const src = await fetchVideo(r.source_video_key!, dir); const durMs = Math.round((await ffprobeDuration(src)) * 1000); const dm = await dims(src);
          const { words, source, translated } = await wordsFor(r.user_id, p, r.locale, durMs); const ass = toAss(cues(words), r.style_json as Style, dm);
          const assF = join(dir, 'c.ass'); await writeFile(assF, ass); const out = join(dir, 'out.mp4');
          await ffmpeg(['-y', '-i', src, '-vf', `ass=${assF}`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-map_metadata', '-1', out], 600_000);
          const base = `projects/${r.project_id}/a11y/captions-${r.id}`; const { readFile } = await import('node:fs/promises');
          await storage.put('videos', `${base}.mp4`, await readFile(out), 'video/mp4'); await storage.put('videos', `${base}.ass`, Buffer.from(ass, 'utf8'), 'text/x-ssa');
          if (translated) await recordUsage({ provider: 'mock', operation: 'caption_translate', costCents: 0, latencyMs: 0, userId: r.user_id, projectId: r.project_id, status: 'ok' });
          await recordUsage({ provider: 'local', operation: 'captions_animated', costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: r.project_id, status: 'ok' });
          await setAsset(r.id, `status='ready', file_url=$2, extra_file_url=$3, content_json=$4, error_code=NULL`, [`${base}.mp4`, `${base}.ass`, seal({ words, source })]);
          logger.info({ assetId: r.id, words: words.length, ms: Date.now() - t0 }, 'legendas animadas prontas'); // só contagem
        });
      } else if (name === 'audio_description') {
        const durMs = await withTmp(async (dir) => Math.round((await ffprobeDuration(await fetchVideo(r.source_video_key!, dir))) * 1000));
        const sc = await scenesOf(r.project_id); const sp = spans(sc, durMs);
        const descriptions = sc.map((s, i) => { const x = sanitize(describeScene({ index: s.index, text: s.text, prompt: s.prompt, referenceMode: s.reference_mode, durationMs: sp[i]!.endMs - sp[i]!.startMs }, r.locale));
          return { scene: s.index, startMs: Math.round(sp[i]!.startMs), endMs: Math.round(sp[i]!.endMs), text: x.text, redactions: x.redactions }; });
        await recordUsage({ provider: `${env.A11Y_VISION_PROVIDER}-vision`, operation: 'audio_description', costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: r.project_id, status: 'ok' });
        await setAsset(r.id, `status='pending_review', content_json=$2, error_code=NULL`, [seal({ descriptions })]);
        logger.info({ assetId: r.id, scenes: descriptions.length, redactions: descriptions.reduce((a, x) => a + x.redactions, 0) }, 'audiodescrição aguardando revisão');
      } else if (name === 'ad_render') {
        if (!r.reviewed_at) throw a11yError(409, 'review_required');
        const descs = open<{ descriptions: Array<{ scene: number; startMs: number; endMs: number; text: string }> }>(r.content_json)!.descriptions;
        await withTmp(async (dir) => {
          const src = await fetchVideo(r.source_video_key!, dir); const parts: Array<{ startSec: number; endSec: number; file: string }> = [];
          for (const [i, d] of descs.entries()) { const a = await synthesizeSpeech(d.text.replace(/\[omitido\]/g, ''), r.locale, { gender: 'neutral' }, { userId: r.user_id, projectId: r.project_id }); const f = join(dir, `d${i}.${a.ext}`); await writeFile(f, a.audio);
            const win = Math.min(d.endMs - d.startMs, 3500); parts.push({ startSec: d.startMs / 1000, endSec: (d.startMs + Math.max(800, win)) / 1000, file: f }); }
          const out = join(dir, 'ad.mp4'); await spliceSpeech(src, parts, out, { duck: 0.25 });
          const vtt = toVtt(descs.map((x) => ({ start: x.startMs, end: Math.min(x.endMs, x.startMs + 3500), words: [{ w: x.text, start: x.startMs, end: x.endMs, scene: x.scene }] })), 'descriptions');
          const base = `projects/${r.project_id}/a11y/ad-${r.id}`; const { readFile } = await import('node:fs/promises');
          await storage.put('videos', `${base}.mp4`, await readFile(out), 'video/mp4'); await storage.put('videos', `${base}.vtt`, Buffer.from(vtt, 'utf8'), 'text/vtt');
          await setAsset(r.id, `status='ready', file_url=$2, extra_file_url=$3, error_code=NULL`, [`${base}.mp4`, `${base}.vtt`]);
        });
        logger.info({ assetId: r.id, scenes: descs.length, ms: Date.now() - t0 }, 'audiodescrição narrada pronta');
      }
      return { ok: true };
    } catch (e) {
      const definitive = e instanceof AppError && e.status < 500; const code = e instanceof AppError ? e.code : 'generation_failed';
      if (isFinal || definitive) { await setAsset(r.id, `status='failed', error_code=$2`, [code]); logger.warn({ assetId: r.id, code }, 'geração de acessibilidade falhou'); if (definitive) return { ok: false }; }
      else await setAsset(r.id, `status='queued'`, []);
      throw e;
    }
  },
  /** Job diário `accessibility-retention`: exportações de transcrição vencidas (arquivo + registro). */
  async purgeExpired(): Promise<{ deleted: number }> {
    const rows = await asSystem(async (db) => (await db.query<{ id: string; file_url: string | null }>(`DELETE FROM accessibility_assets WHERE expires_at < now() RETURNING id, file_url`)).rows);
    for (const r of rows) if (r.file_url) { const l = refLocation(r.file_url); await storage.delete?.(l.bucket, l.key).catch(() => undefined); }
    if (rows.length) logger.info({ deleted: rows.length }, 'exportações de transcrição vencidas apagadas'); return { deleted: rows.length };
  },
};
