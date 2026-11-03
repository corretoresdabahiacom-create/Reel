import { pool, asUser, asSystem } from '../../db/pool.js';
import { aiProvider } from '../../providers/ai/router.js';
import { signRef } from '../../providers/storage.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo } from '../users/users.repository.js';
import { projectsRepo } from '../projects/projects.repository.js';
import { enqueue, Q } from '../../queues/index.js';
import { AppError, conflict, notFound } from '../../utils/errors.js';
import { assertCanGenerate } from '../generation/generation.service.js';
import { audit } from '../../repositories/audit.js';
import { m } from '../../observability/metrics.js';
import type { Row } from '../../db/rows.generated.js';

export const CREDITS_PER_LANGUAGE = 5;
export const dubbingService = {
  async request(userId: string, projectId: string, locales: string[], gender: 'male' | 'female' | 'neutral') {
    const u = (await usersRepo.byId(pool, userId))!; await assertCanGenerate(u);
    if (!(await isEnabled('dubbing_enabled', { userId, region: u.region, plan: u.plan }))) throw new AppError(503, 'dubbing_disabled', 'Dublagem temporariamente indisponível');
    const p = await asUser(userId, (db) => projectsRepo.byId(db, projectId)); if (!p) throw notFound('Projeto não encontrado'); if (!p.final_video_url) throw conflict('Monte o vídeo final antes de dublar', 'video_not_assembled');
    const targets = [...new Set(locales)].filter((l) => l !== p.source_locale); if (!targets.length) throw conflict('Nenhum idioma de destino diferente do original', 'no_target_locales');
    const cost = targets.length * CREDITS_PER_LANGUAGE;
    // débito antecipado e atômico; reembolsa por idioma se falhar
    const paid = await asSystem(async (db) => { const ok = await usersRepo.debitCredits(db, userId, cost); if (ok) { await usersRepo.tx(db, { userId, type: 'credits_spent', amountCents: 0, creditsDelta: -cost, source: 'dubbing', externalRef: `dub-${projectId}-${Date.now()}` }); m.credits.inc({ reason: 'dubbing' }, cost); } return ok; });
    if (!paid) throw new AppError(402, 'insufficient_credits', `Créditos insuficientes (${CREDITS_PER_LANGUAGE} por idioma)`);
    const jobs = [];
    for (const locale of targets) {
      await asSystem((db) => db.query(`INSERT INTO localized_versions (project_id, locale, status) VALUES ($1,$2,'processing') ON CONFLICT (project_id, locale) DO UPDATE SET status='processing'`, [projectId, locale]));
      const j = await enqueue(Q.dubbing, 'dub', { projectId, userId, locale, gender }, { plan: u.plan, userId, jobId: `dub-${projectId}-${locale}-${Date.now()}` }); jobs.push({ locale, jobId: j.id });
    }
    await audit(pool, userId, 'dubbing.request', 'project', projectId, { locales: targets, credits: cost }); return { creditsCharged: cost, jobs };
  },
  async process(d: { projectId: string; userId: string; locale: string; gender: 'male' | 'female' | 'neutral' }, isFinal: boolean) {
    const p = await asSystem((db) => projectsRepo.byId(db, d.projectId)); if (!p || !p.final_video_url) return;
    const scenes = await asSystem((db) => projectsRepo.scenes(db, p.id));
    try {
      const [r] = await aiProvider.dubVideo({ videoKey: p.final_video_url, projectId: p.id, scenes: scenes.map((s) => ({ text: s.text, durationSec: s.duration_sec })) }, [d.locale], { gender: d.gender });
      await asSystem((db) => db.query(`UPDATE localized_versions SET status='done', video_url=$3, subtitles_url=$4, audio_url=$5, voice=$6 WHERE project_id=$1 AND locale=$2`, [p.id, d.locale, r!.videoKey, r!.subtitlesKey, r!.audioKey, r!.voice]));
    } catch (e) {
      if (!isFinal) throw e;
      await asSystem(async (db) => { await db.query(`UPDATE localized_versions SET status='failed' WHERE project_id=$1 AND locale=$2`, [p.id, d.locale]); await usersRepo.addCredits(db, d.userId, CREDITS_PER_LANGUAGE);
        await usersRepo.tx(db, { userId: d.userId, type: 'credits_refund', amountCents: 0, creditsDelta: CREDITS_PER_LANGUAGE, source: 'dubbing', externalRef: `dubrefund-${p.id}-${d.locale}-${Date.now()}` }); });
    }
  },
  async list(userId: string, projectId: string) {
    const p = await asUser(userId, (db) => projectsRepo.byId(db, projectId)); if (!p) throw notFound('Projeto não encontrado');
    const rows = (await pool.query<Pick<Row<'localized_versions'>, 'locale' | 'status' | 'video_url' | 'subtitles_url' | 'audio_url' | 'voice' | 'created_at'>>('SELECT locale, status, video_url, subtitles_url, audio_url, voice, created_at FROM localized_versions WHERE project_id=$1 ORDER BY locale', [projectId])).rows;
    return { sourceLocale: p.source_locale, items: await Promise.all(rows.map(async (r) => ({ locale: r.locale, status: r.status, voice: r.voice, createdAt: r.created_at, videoUrl: r.video_url ? await signRef(r.video_url) : null, subtitlesUrl: r.subtitles_url ? await signRef(r.subtitles_url) : null, audioUrl: r.audio_url ? await signRef(r.audio_url) : null }))) };
  },
};
