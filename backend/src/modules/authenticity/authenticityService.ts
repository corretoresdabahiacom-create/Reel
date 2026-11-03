import { createHash } from 'node:crypto';
import { asSystem, asUser, tx } from '../../db/pool.js';
import { enqueue, Q } from '../../queues/index.js';
import { storage, refLocation, signRef } from '../../providers/storage.js';
import { recordUsage } from '../../providers/ai/router.js';
import { audit } from '../../repositories/audit.js';
import { logger } from '../../observability/logger.js';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { m10Error, requireM10 } from '../m10/common.js';
import { c2paConfigured, readEmbedded, SEAL_TEXT, signerSubject, signMp4, type VerifyResult } from './c2pa.js';

/**
 * Módulo 10 — Selo de autenticidade (`ff_seal`).
 * - `applyC2PA`: quando o usuário ATIVA, assina o vídeo final com C2PA (biblioteca oficial) e EMBUTE o manifest no MP4
 *   (arquivo novo `projects/<id>/sealed/<registro>.mp4`; o original fica intacto — R1). Fila `seal-apply`, idempotente.
 * - `generateSeal`: o selo visível "IA com direção humana" (pt/en/es) com quem assinou e quando.
 * - `verifySeal(videoUrl)`: lê o manifest EMBUTIDO nos bytes do arquivo (ref interna do storage ou upload). URL externa é
 *   recusada (422) — o verificador nunca baixa nada da internet (sem SSRF e sem depender de manifest remoto).
 * O manifest não tem dado pessoal: só "NexusReel", o tipo de origem (IA + direção humana) e uma referência opaca do projeto.
 */
interface ARow { id: string; project_id: string; user_id: string; status: string; error_code: string | null; c2pa_manifest_embedded: boolean; verify_url: string | null; source_video_key: string; signed_video_key: string | null;
  manifest_label: string | null; signed_sha256: string | null; signer_subject: string | null; seal_text: string | null; created_at: string; updated_at: string }
const opaqueRef = (projectId: string) => 'nr:' + createHash('sha256').update('seal:' + projectId).digest('hex').slice(0, 24);
export function generateSeal(r: ARow) {
  return { kind: 'ai_human_directed', text: SEAL_TEXT, aiGenerated: true, humanDirected: true, c2pa: { embedded: r.c2pa_manifest_embedded, manifestLabel: r.manifest_label, verifyUrl: r.verify_url },
    signedBy: r.signer_subject, issuedAt: r.updated_at };
}
async function dto(r: ARow) {
  return { sealId: r.id, projectId: r.project_id, status: r.status, errorCode: r.error_code, c2paManifestEmbedded: r.c2pa_manifest_embedded, verifyUrl: r.verify_url, createdAt: r.created_at,
    seal: r.status === 'done' ? generateSeal(r) : null, downloadUrl: r.status === 'done' && r.signed_video_key ? await signRef(r.signed_video_key, 3600) : null };
}
const latest = (userId: string, projectId: string) => asUser(userId, async (db) => (await db.query<ARow>('SELECT * FROM authenticity_records WHERE project_id=$1 ORDER BY created_at DESC LIMIT 1', [projectId])).rows[0]);
/** Lê os bytes de uma ref INTERNA do storage. Qualquer coisa com esquema (http:, https:, file:, data:…) é recusada. */
async function bytesOfRef(ref: string): Promise<Buffer> {
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.includes('..')) throw m10Error(422, 'external_url_not_allowed');
  const l = refLocation(ref); return storage.get(l.bucket, l.key);
}
export const authenticityService = {
  config: async (userId: string) => { await requireM10('ff_seal', userId); return { configured: c2paConfigured(), signer: signerSubject(), text: SEAL_TEXT, embedded: true }; },
  /** POST /projects/:projectId/seal — ativa o selo (fila). Mesmo vídeo já selado = devolve o selo existente. */
  async applyC2PA(userId: string, projectId: string) {
    await requireM10('ff_seal', userId); if (!c2paConfigured()) throw m10Error(503, 'seal_not_configured');
    const p = await asUser(userId, async (db) => (await db.query<{ status: string; final_video_url: string | null }>('SELECT status, final_video_url FROM projects WHERE id=$1 AND deleted_at IS NULL', [projectId])).rows[0]);
    if (!p) throw m10Error(404, 'project_not_found', undefined, 'not_found'); if (p.status !== 'ready' || !p.final_video_url) throw m10Error(409, 'video_not_assembled');
    const prev = await latest(userId, projectId);
    if (prev && prev.source_video_key === p.final_video_url && ['queued', 'processing', 'done'].includes(prev.status)) return dto(prev);
    const r = await tx({ userId }, async (db) => { const x = (await db.query<ARow>('INSERT INTO authenticity_records (project_id, user_id, source_video_key) VALUES ($1,$2,$3) RETURNING *', [projectId, userId, p.final_video_url])).rows[0]!;
      await audit(db, userId, 'seal.request', 'project', projectId, { sealId: x.id }); return x; });
    await enqueue(Q.sealApply, 'seal', { sealId: r.id, userId }, { userId, jobId: `seal-${r.id}` });
    return dto(r);
  },
  /** Worker `seal-apply`. Idempotente: registro concluído não é refeito. */
  async process(d: { sealId: string }, isFinal: boolean) {
    const r = await asSystem(async (db) => (await db.query<ARow>('SELECT * FROM authenticity_records WHERE id=$1', [d.sealId])).rows[0]);
    if (!r || r.status === 'done') return { skipped: true };
    await asSystem((db) => db.query(`UPDATE authenticity_records SET status='processing', updated_at=now() WHERE id=$1`, [r.id])); const t0 = Date.now();
    try {
      const src = await bytesOfRef(r.source_video_key);
      const derived = await asSystem(async (db) => ((await db.query<{ "?column?": number | null }>('SELECT 1 FROM scenes WHERE project_id=$1 AND derived_from_scene_id IS NOT NULL LIMIT 1', [r.project_id])).rowCount ?? 0) > 0);
      const title = await asSystem(async (db) => (await db.query<{ title: string }>('SELECT title FROM projects WHERE id=$1', [r.project_id])).rows.at(0)?.title ?? 'video');
      const out = await signMp4(src, { title: title.replace(/[^\p{L}\p{N} ._-]+/gu, '').slice(0, 80) + '.mp4', projectRef: opaqueRef(r.project_id), derived });
      const check = await readEmbedded(out.file); if (!check.embedded || !check.valid) throw m10Error(500, 'seal_failed');
      const key = `projects/${r.project_id}/sealed/${r.id}.mp4`; await storage.put('videos', key, out.file, 'video/mp4');
      await recordUsage({ provider: `c2pa-${env.C2PA_SIGNER}`, operation: 'c2pa_sign', costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: r.project_id, status: 'ok' });
      await asSystem((db) => db.query(`UPDATE authenticity_records SET status='done', c2pa_manifest_embedded=true, verify_url=NULL, signed_video_key=$2, manifest_label=$3, signed_sha256=$4, signer_subject=$5, seal_text=$6, error_code=NULL, updated_at=now() WHERE id=$1`,
        [r.id, key, out.manifestLabel, createHash('sha256').update(out.file).digest('hex'), check.signedBy ?? signerSubject(), SEAL_TEXT['pt-BR']]));
      logger.info({ sealId: r.id, bytes: out.file.length, ms: Date.now() - t0 }, 'selo C2PA aplicado (manifest embutido)'); return { ok: true };
    } catch (e) {
      await recordUsage({ provider: `c2pa-${env.C2PA_SIGNER}`, operation: 'c2pa_sign', costCents: 0, latencyMs: Date.now() - t0, userId: r.user_id, projectId: r.project_id, status: 'error' }).catch(() => undefined);
      const definitive = e instanceof AppError && e.status < 500 || e instanceof AppError && e.code === 'seal_not_configured';
      if (isFinal || definitive) { await asSystem((db) => db.query(`UPDATE authenticity_records SET status='failed', error_code=$2, updated_at=now() WHERE id=$1`, [r.id, e instanceof AppError ? e.code : 'seal_failed'])); logger.warn({ sealId: r.id, code: e instanceof AppError ? e.code : 'seal_failed' }, 'selo falhou'); if (definitive) return { ok: false }; }
      else await asSystem((db) => db.query(`UPDATE authenticity_records SET status='queued', updated_at=now() WHERE id=$1`, [r.id]));
      throw e;
    }
  },
  async status(userId: string, projectId: string) { await requireM10('ff_seal', userId); const r = await latest(userId, projectId); if (!r) throw m10Error(404, 'seal_not_found', undefined, 'not_found'); return dto(r); },
  /** verifySeal(videoUrl): `videoUrl` é uma ref interna do storage. Lê o manifest embutido no arquivo — nunca uma URL externa. */
  async verifySeal(videoUrl: string): Promise<VerifyResult> { const t0 = Date.now(); const v = await readEmbedded(await bytesOfRef(videoUrl)); await recordUsage({ provider: 'c2pa-local', operation: 'c2pa_verify', costCents: 0, latencyMs: Date.now() - t0, status: 'ok' }); return v; },
  /** Verifica o vídeo selado do projeto (o arquivo guardado). */
  async verifyProject(userId: string, projectId: string) {
    await requireM10('ff_seal', userId); const r = await latest(userId, projectId);
    if (!r || r.status !== 'done' || !r.signed_video_key) throw m10Error(404, 'seal_not_found', undefined, 'not_found');
    return { sealId: r.id, ...(await this.verifySeal(r.signed_video_key)) };
  },
  /** Verificação pública por upload do arquivo (qualquer pessoa confere um vídeo recebido). */
  async verifyUpload(buf: Buffer) {
    if (!Buffer.isBuffer(buf) || buf.length < 16 || buf.subarray(4, 8).toString('latin1') !== 'ftyp') throw m10Error(415, 'not_a_video');
    const t0 = Date.now(); const v = await readEmbedded(buf); await recordUsage({ provider: 'c2pa-local', operation: 'c2pa_verify', costCents: 0, latencyMs: Date.now() - t0, status: 'ok' }); return v;
  },
};
