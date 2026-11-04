import { parseMotion } from '../projects/sections.js';
import { voiceStudio } from '../audio/voiceStudio.js';
import { disclosureFor } from '../compliance/aiDisclosure.js';
import { pool, asUser, asSystem } from '../../db/pool.js';
import { aiProvider } from '../../providers/ai/router.js';
import { signRef } from '../../providers/storage.js';
import { signProject, signPhotos } from '../projects/projects.sign.js';
import { projectGone, discardLateFiles } from '../projects/projects.purge.js';
import { isEnabled } from '../flags.service.js';
import { projectsRepo, projectDto, sceneDto, type ProjectRow, type SceneRow } from '../projects/projects.repository.js';
import { usersRepo, type UserRow } from '../users/users.repository.js';
import { audit } from '../../repositories/audit.js';
import { enqueue, Q } from '../../queues/index.js';
import { AppError, conflict, notFound, unprocessable, forbidden } from '../../utils/errors.js';
import { m } from '../../observability/metrics.js';
import { batchHooks } from '../b2b/hooks.js';
import { growthHooks } from '../growth/hooks.js';
import type { Row } from '../../db/rows.generated.js';

export const SCENE_CREDITS_FREE = 1;
const PLAN_LIMIT: Record<string, number> = { free: 3, pro: 40, business: 100 };

/** Guardas de conta: exclusão agendada bloqueia geração/publicação (LGPD — Fase 5); kill switch por flag (região/plano/rollout). */
export async function assertCanGenerate(u: UserRow): Promise<void> {
  if (u.deletion_scheduled_for) throw new AppError(423, 'account_pending_deletion', 'Conta com exclusão agendada: geração bloqueada. Cancele a exclusão para continuar.');
  if (!(await isEnabled('generation_enabled', { userId: u.id, region: u.region, plan: u.plan }))) throw new AppError(503, 'generation_disabled', 'A geração de vídeos está temporariamente em manutenção. Seus rascunhos estão salvos.');
}
const owned = async (userId: string, projectId: string): Promise<ProjectRow> => { const p = await asUser(userId, (db) => projectsRepo.byId(db, projectId)); if (!p) throw notFound('Projeto não encontrado'); return p; };

export const generationService = {
  async createProject(userId: string, b: { title: string; script: string; locale: string; category?: string; templateId?: string; photos: string[] }) {
    const u = (await usersRepo.byId(pool, userId))!; await assertCanGenerate(u);
    const mod = await aiProvider.moderateContent(b.script, []); if (!mod.allowed) throw unprocessable('O roteiro viola as políticas de conteúdo', { categories: mod.categories });
    for (const ph of b.photos) if (!ph.startsWith(`uploads/${userId}/`)) throw forbidden('Foto não pertence ao usuário');
    if (b.templateId) { const t = (await pool.query<{ id: string; price_credits: number; creator_id: string }>(`SELECT t.id, t.price_credits, t.creator_id FROM templates t WHERE t.id=$1 AND t.moderation_status='approved' AND t.deleted_at IS NULL`, [b.templateId])).rows[0]; if (!t) throw notFound('Template indisponível');
      if (t.price_credits > 0 && t.creator_id !== userId && !(await pool.query<{ "?column?": number | null }>('SELECT 1 FROM template_purchases WHERE template_id=$1 AND buyer_id=$2', [b.templateId, userId])).rowCount) throw new AppError(402, 'template_not_purchased', 'Compre o template antes de usá-lo'); }
    const p = await asUser(userId, (db) => projectsRepo.create(db, { userId, ...b, photos: b.photos }));
    void growthHooks.onProjectCreated(userId, p.id, { category: b.category, templateId: b.templateId, photos: b.photos.length });
    return signProject(projectDto(p));
  },
  async getProject(userId: string, id: string, isAdmin = false) {
    return asUser(userId, async (db) => { const p = await projectsRepo.byId(db, id); if (!p) throw notFound('Projeto não encontrado');
      const scenes = await projectsRepo.scenes(db, id);
      const out = { ...(await signProject(projectDto(p, scenes))), photoUrls: await signPhotos(p.photo_refs),
        scenes: await Promise.all(scenes.map(async (s) => ({ ...sceneDto(s), videoUrl: s.video_url ? await signRef(s.video_url) : null, lastFrameUrl: s.last_frame_url ? await signRef(s.last_frame_url) : null }))) }; return out; }, isAdmin);
  },
  async requestStoryboard(userId: string, projectId: string, opts: { pipeline?: boolean } = {}) {
    const u = (await usersRepo.byId(pool, userId))!; await assertCanGenerate(u); const p = await owned(userId, projectId);
    const job = await enqueue(Q.storyboard, 'storyboard', { projectId, userId, pipeline: !!opts.pipeline }, { plan: u.plan, userId, jobId: `sb-${projectId}-${Date.now()}` });
    await asUser(userId, (db) => projectsRepo.log(db, projectId, null, 'storyboard', 'Storyboard enfileirado')); return { jobId: job.id, projectId: p.id, status: 'queued' };
  },
  async processStoryboard(d: { projectId: string; userId: string; pipeline?: boolean }) {
    const p = await asSystem((db) => projectsRepo.byId(db, d.projectId)); if (!p) return;
    const u = (await usersRepo.byId(pool, d.userId))!;
    const drafts = await aiProvider.generateStoryboard(p.script, p.photo_refs, { category: p.category ?? undefined, locale: p.source_locale });
    let tpl: { sceneStructure: { durationSec?: number; referenceMode?: string }[]; voice_id: string | null; track_id: string | null; caption_style: string | null } | null = null;
    if (p.template_id) { const t = (await pool.query<Pick<Row<'templates'>, 'scene_structure' | 'voice_id' | 'track_id' | 'caption_style'>>('SELECT scene_structure, voice_id, track_id, caption_style FROM templates WHERE id=$1', [p.template_id])).rows[0]; if (t) tpl = { sceneStructure: t.scene_structure as Array<{ durationSec?: number; referenceMode?: string }>, voice_id: t.voice_id, track_id: t.track_id, caption_style: t.caption_style }; }
    await asSystem(async (db) => {
      await db.query('UPDATE projects SET storyboard_id=NULL WHERE id=$1', [p.id]); await db.query('DELETE FROM storyboards WHERE project_id=$1', [p.id]); await db.query('DELETE FROM scenes WHERE project_id=$1', [p.id]);
      const sb = (await db.query<{ id: string }>(`INSERT INTO storyboards (project_id, voice_id, track_id, caption_style) VALUES ($1,$2,$3,$4) RETURNING id`, [p.id, tpl?.voice_id ?? 'voice-1', tpl?.track_id ?? 'track-1', tpl?.caption_style ?? 'bold'])).rows[0];
      for (const s of drafts) { const t = tpl?.sceneStructure[s.index]; const refs = s.referenceMode === 'person' ? p.photo_refs.slice(-1) : p.photo_refs.slice(0, 3);
        await db.query(`INSERT INTO scenes (project_id,index,text,duration_sec,prompt,reference_mode,reference_images) VALUES ($1,$2,$3,$4,$5,$6,$7)`, [p.id, s.index, s.text, t?.durationSec ?? s.durationSec, s.prompt, t?.referenceMode ?? s.referenceMode, refs]); }
      await db.query(`UPDATE projects SET storyboard_id=$2, status='draft' WHERE id=$1`, [p.id, sb.id]); await projectsRepo.log(db, p.id, null, 'storyboard', `Storyboard com ${drafts.length} cenas criado`);
    });
    if (d.pipeline) { const first = (await asSystem((db) => projectsRepo.scenes(db, p.id)))[0]; if (first) await enqueue(Q.scene, 'scene', { projectId: p.id, sceneId: first.id, userId: d.userId, chain: true, pipeline: true, run: Date.now() }, { plan: u.plan, userId: d.userId, jobId: `sc-${first.id}-${Date.now()}` }); }
  },

  async requestScene(userId: string, projectId: string, sceneId: string, regenerate: boolean, chain = false) {
    const u = (await usersRepo.byId(pool, userId))!; await assertCanGenerate(u); await owned(userId, projectId);
    const scene = await asUser(userId, (db) => projectsRepo.scene(db, projectId, sceneId)); if (!scene) throw notFound('Cena não encontrada');
    if (scene.status === 'generating') throw conflict('Cena já em geração', 'scene_in_progress');
    if (scene.index > 0) { const prev = await asUser(userId, async (db) => (await projectsRepo.scenes(db, projectId))[scene.index - 1]); if (!prev || prev.status !== 'done') throw conflict(`A cena ${scene.index} depende do último frame da cena anterior (ainda não concluída)`, 'previous_scene_not_ready'); }
    if (u.plan === 'free' && !u.is_admin && u.credits < SCENE_CREDITS_FREE) throw new AppError(402, 'insufficient_credits', 'Créditos insuficientes (1 crédito por cena no plano Free)');
    await asUser(userId, async (db) => { await projectsRepo.updateScene(db, sceneId, { status: 'generating', error_message: null, ...(regenerate ? { retried: true } : {}) }); await projectsRepo.update(db, projectId, { status: 'generating' });
      await projectsRepo.log(db, projectId, sceneId, regenerate ? 'regenerate' : 'generate', `${regenerate ? 'Refazendo' : 'Gerando'} cena ${scene.index + 1}`); });
    const job = await enqueue(Q.scene, 'scene', { projectId, sceneId, userId, chain, run: Date.now() }, { plan: u.plan, userId, jobId: `sc-${sceneId}-${Date.now()}` });
    return { jobId: job.id, sceneId, status: 'queued' };
  },
  /** Worker: chaining — a cena i usa o `last_frame` da cena i-1 + fotos de referência. Falha só desta cena não derruba o vídeo. */
  async processScene(d: { projectId: string; sceneId: string; userId: string; chain?: boolean; pipeline?: boolean }, isFinalAttempt: boolean) {
    const p = await asSystem((db) => projectsRepo.byId(db, d.projectId)); if (!p) return;
    const scenes = await asSystem((db) => projectsRepo.scenes(db, d.projectId)); const scene = scenes.find((s) => s.id === d.sceneId); if (!scene) return;
    const prev = scene.index > 0 ? scenes[scene.index - 1] : undefined; const u = (await usersRepo.byId(pool, d.userId))!;
    const n = scenes.length;
    await asSystem((db) => projectsRepo.updateScene(db, scene.id, { status: 'generating', chained_from_scene_id: prev?.id ?? null }));
    await asSystem((db) => projectsRepo.log(db, p.id, scene.id, 'chain', prev ? `Cena ${scene.index + 1}/${n} — usando frame da Cena ${prev.index + 1} + ${scene.reference_images.length} referência(s) do usuário` : `Cena 1/${n} — geração inicial com ${scene.reference_images.length} referência(s) do usuário`));
    try {
      const r = await aiProvider.generateScene({ id: scene.id, projectId: p.id, index: scene.index, text: scene.text, durationSec: scene.duration_sec, prompt: scene.prompt, referenceMode: scene.reference_mode as 'product', referenceKeys: scene.reference_images, retried: scene.retried },
        prev?.last_frame_url ? { lastFrameKey: prev.last_frame_url } : undefined, { userId: d.userId, plan: u.plan });
      if (await projectGone(p.id)) { await discardLateFiles(p.id, 'scene'); return; } // excluído durante a geração: não grava, não cobra
      if (u.plan === 'free' && !u.is_admin) { /* administrador não gasta crédito */ const ok = await asSystem(async (db) => { const paid = await usersRepo.debitCredits(db, d.userId, SCENE_CREDITS_FREE); if (paid) { await usersRepo.tx(db, { userId: d.userId, type: 'credits_spent', amountCents: 0, creditsDelta: -SCENE_CREDITS_FREE, source: 'generation', externalRef: `scene-${scene.id}-${r.videoKey}` }); m.credits.inc({ reason: 'scene' }, SCENE_CREDITS_FREE); } return paid; });
        if (!ok) throw new AppError(402, 'insufficient_credits', 'Créditos insuficientes'); }
      await asSystem(async (db) => { await projectsRepo.updateScene(db, scene.id, { status: 'done', video_url: r.videoKey, last_frame_url: r.lastFrameKey, consistency: r.consistency, error_message: null });
        await projectsRepo.log(db, p.id, scene.id, 'done', `Cena ${scene.index + 1} concluída · consistência ${Math.round(r.consistency * 100)}%`); });
      const continues = (d.chain && scene.index + 1 < n) || (d.chain && d.pipeline);
      // Cena avulsa terminou e nada mais está em geração: o projeto sai de 'generating' (antes ficava preso até montar).
      if (!continues) await asSystem((db) => db.query(`UPDATE projects SET status = CASE WHEN final_video_url IS NOT NULL THEN 'ready' ELSE 'draft' END
        WHERE id=$1 AND status IN ('generating','failed') AND NOT EXISTS (SELECT 1 FROM (SELECT DISTINCT ON (index) status FROM scenes WHERE project_id=$1 ORDER BY index, selected DESC, version DESC) cur WHERE cur.status IN ('generating','error'))`, [p.id])); /* só a versão atual de cada cena conta */
      if (d.chain && scene.index + 1 < n) { const next = scenes[scene.index + 1]!; await enqueue(Q.scene, 'scene', { projectId: p.id, sceneId: next.id, userId: d.userId, chain: true, pipeline: d.pipeline, run: Date.now() }, { plan: u.plan, userId: d.userId, jobId: `sc-${next.id}-${Date.now()}` }); }
      else if (d.chain && d.pipeline) await enqueue(Q.assemble, 'assemble', { projectId: p.id, userId: d.userId, pipeline: true }, { plan: u.plan, userId: d.userId, jobId: `as-${p.id}-${Date.now()}` });
    } catch (e) {
      const msg = (e as Error).message; await asSystem((db) => projectsRepo.log(db, p.id, scene.id, 'error', `Falha na cena ${scene.index + 1}: ${msg}`));
      if (isFinalAttempt || e instanceof AppError) { await asSystem(async (db) => { await projectsRepo.updateScene(db, scene.id, { status: 'error', error_message: msg }); await projectsRepo.update(db, p.id, { status: 'failed' }); });
        m.credits.inc({ reason: 'scene_failed' }, 0); if (d.pipeline) await batchHooks.onProjectDone(p.id, false, msg); return; }
      throw e; // BullMQ fará retry com backoff exponencial
    }
  },

  async requestAssemble(userId: string, projectId: string, opts: { pipeline?: boolean } = {}) {
    const u = (await usersRepo.byId(pool, userId))!; await assertCanGenerate(u); await owned(userId, projectId);
    const scenes = await asUser(userId, (db) => projectsRepo.scenes(db, projectId)); if (!scenes.length) throw conflict('Gere o storyboard primeiro', 'no_storyboard'); if (scenes.some((s) => s.status !== 'done')) throw conflict('Todas as cenas precisam estar concluídas', 'scenes_not_ready');
    const used = Number((await pool.query<{ n: number }>(`SELECT count(DISTINCT target_id)::int AS n FROM audit_logs WHERE actor_id=$1 AND action='project.assemble' AND created_at >= date_trunc('month', now())`, [userId])).rows[0].n);
    const already = (await pool.query<{ "?column?": number | null }>(`SELECT 1 FROM audit_logs WHERE actor_id=$1 AND action='project.assemble' AND target_id=$2 AND created_at >= date_trunc('month', now()) LIMIT 1`, [userId, projectId])).rowCount;
    if (!already && used >= (PLAN_LIMIT[u.plan] ?? 3)) throw new AppError(403, 'plan_limit_reached', `Limite mensal do plano ${u.plan} atingido (${PLAN_LIMIT[u.plan]} vídeos)`);
    const job = await enqueue(Q.assemble, 'assemble', { projectId, userId, pipeline: !!opts.pipeline }, { plan: u.plan, userId, jobId: `as-${projectId}-${Date.now()}` });
    return { jobId: job.id, status: 'queued' };
  },
  async processAssemble(d: { projectId: string; userId: string; pipeline?: boolean }) {
    const p = await asSystem((db) => projectsRepo.byId(db, d.projectId)); if (!p) return;
    const scenes = await asSystem((db) => projectsRepo.scenes(db, p.id));
    try {
      const out = await aiProvider.assembleVideo(scenes.map((s) => ({ videoKey: s.video_url!, text: s.text, durationSec: s.duration_sec, photoKey: s.reference_images[0], motion: parseMotion(s.prompt).motion ?? undefined, action: parseMotion(s.prompt).action })), { projectId: p.id, locale: p.source_locale, disclosure: await disclosureFor(d.userId), audio: await voiceStudio.assemblyAudio(d.userId, p.id) });
      const v = `v${p.versions.length + 1}`;
      if (await projectGone(p.id)) { await discardLateFiles(p.id, 'assemble'); return; } // excluído durante a montagem
      await asSystem(async (db) => { await db.query(`UPDATE projects SET final_video_url=$2, duration_sec=$3, status='ready', versions=array_append(versions,$4) WHERE id=$1`, [p.id, out.videoKey, Math.round(out.durationSec), v]);
        await projectsRepo.log(db, p.id, null, 'assemble', `Vídeo montado (${v}, ${out.durationSec}s) com legendas e trilha`); await audit(db, d.userId, 'project.assemble', 'project', p.id, { version: v }); });
      void growthHooks.onVideoAssembled(d.userId, p.id, Math.round(out.durationSec));
      if (d.pipeline) await batchHooks.onProjectDone(p.id, true);
    } catch (e) { await asSystem((db) => projectsRepo.update(db, p.id, { status: 'failed' })); if (d.pipeline) await batchHooks.onProjectDone(p.id, false, (e as Error).message); throw e; }
  },
  async logs(userId: string, projectId: string, after?: number) { await owned(userId, projectId); return asUser(userId, (db) => projectsRepo.logs(db, projectId, after)); },
};
export type { SceneRow };
