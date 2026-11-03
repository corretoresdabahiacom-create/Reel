import { sloRecord } from '../sre/record.js';
import { UnrecoverableError, type Job } from 'bullmq';
import { pool, asUser, asSystem } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { INTEGRATIONS } from '../../integrations/index.js';
import { PlatformError, type OAuthTokens, type PublishMeta } from '../../integrations/types.js';
import { integrationsService } from '../integrations/integrations.service.js';
import { withAdapted } from './videoAdapter.js';
import { isEnabled } from '../flags.service.js';
import { usersRepo } from '../users/users.repository.js';
import { projectsRepo } from '../projects/projects.repository.js';
import { enqueue, Q } from '../../queues/index.js';
import { AppError, conflict, notFound } from '../../utils/errors.js';
import { m } from '../../observability/metrics.js';
import { logger } from '../../observability/logger.js';
import { hit } from '../../middlewares/rateLimit.js';
import { affiliatesService } from '../affiliates/affiliates.service.js';
import { batchHooks } from '../b2b/hooks.js';
import { audit } from '../../repositories/audit.js';
import type { PlatformId } from '../../utils/validate.js';
import { audioService } from '../audio/audio.service.js';
import { growthHooks } from '../growth/hooks.js';
import type { Row } from '../../db/rows.generated.js';

export interface Target { platform: PlatformId; locale?: string; metadata: PublishMeta & { affiliate?: boolean } }
const POLL_MS = Number(process.env.PUBLISH_POLL_MS ?? 3000); const POLL_MAX = Number(process.env.PUBLISH_POLL_MAX ?? 100);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pubDto = (r: Row<'publications'> & { progress?: number | null; stage?: string | null }) => ({ id: r.id, projectId: r.project_id, platform: r.platform, locale: r.locale, status: r.status, externalId: r.external_id, externalUrl: r.external_url, error: r.error, retryCount: r.retry_count, publishedAt: r.published_at, createdAt: r.created_at, progress: r.progress ?? undefined, stage: r.stage ?? undefined });

/** Circuit breaker por plataforma (Redis): 5 falhas em 5 min → aberto 2 min. */
const cbOpen = async (p: string) => (await redis.exists(`pcb:open:${p}`)) === 1;
async function cbFail(p: string) { const k = `pcb:fail:${p}`; const n = await redis.incr(k); if (n === 1) await redis.expire(k, 300); if (n >= 5) await redis.set(`pcb:open:${p}`, '1', 'EX', 120); }

export const publicationService = {
  async create(userId: string, projectId: string, targets: Target[]) {
    const u = (await usersRepo.byId(pool, userId))!; if (u.deletion_scheduled_for) throw new AppError(423, 'account_pending_deletion', 'Conta com exclusão agendada: publicação bloqueada.');
    const project = await asUser(userId, (db) => projectsRepo.byId(db, projectId)); if (!project) throw notFound('Projeto não encontrado'); if (project.status !== 'ready' || !project.final_video_url) throw conflict('O vídeo ainda não foi montado', 'video_not_ready');
    const list = [...targets]; const seen = new Set<string>();
    if (list.some((t) => t.platform === 'olx') && !list.some((t) => t.platform === 'youtube')) list.push({ platform: 'youtube', locale: list.find((t) => t.platform === 'olx')?.locale, metadata: { title: list.find((t) => t.platform === 'olx')?.metadata.title, visibility: 'unlisted', autoForOlx: true } });
    const problems: { platform: string; code: string; message: string }[] = [];
    const localized = (await pool.query<Pick<Row<'localized_versions'>, 'locale'>>(`SELECT locale FROM localized_versions WHERE project_id=$1 AND status='done'`, [projectId])).rows.map((r) => r.locale as string);
    for (const t of list) {
      const key = `${t.platform}:${t.locale ?? ''}`; if (seen.has(key)) { problems.push({ platform: t.platform, code: 'duplicate_target', message: 'plataforma repetida' }); continue; } seen.add(key);
      if (!(await isEnabled(`publish_${t.platform}`, { userId, region: u.region, plan: u.plan }))) { problems.push({ platform: t.platform, code: 'platform_disabled', message: 'Publicação nesta plataforma está temporariamente desativada' }); continue; }
      if (!(await pool.query<{ "?column?": number | null }>('SELECT 1 FROM connected_accounts WHERE user_id=$1 AND platform=$2', [userId, t.platform])).rowCount) { problems.push({ platform: t.platform, code: 'account_not_connected', message: 'Conecte a conta antes de publicar' }); continue; }
      if (t.locale && t.locale !== project.source_locale && !localized.includes(t.locale)) { problems.push({ platform: t.platform, code: 'locale_not_ready', message: `Versão ${t.locale} ainda não está pronta` }); continue; }
      const v = INTEGRATIONS[t.platform].publish.validate({ bytes: 0, durationSec: project.duration_sec ?? 0, width: 1080, height: 1920 }, t.metadata); const errs = v.errors.filter((e) => !/duração|arquivo|resolução/.test(e)); if (errs.length) problems.push({ platform: t.platform, code: 'invalid_metadata', message: errs.join('; ') });
    }
    if (problems.length) { const disabled = problems.every((p) => p.code === 'platform_disabled'); const codes = [...new Set(problems.map((p) => p.code))]; throw new AppError(disabled ? 503 : problems.some((p) => p.code === 'account_not_connected') ? 409 : 422, disabled ? 'platform_disabled' : codes.length === 1 ? codes[0]! : 'publication_invalid', 'Não foi possível criar a publicação', problems); }
    const out = [];
    for (const t of list) {
      const row = await asUser(userId, async (db) => { const p = (await db.query<Row<'publications'>>(`INSERT INTO publications (project_id,user_id,platform,locale,metadata) VALUES ($1,$2,$3,$4,$5) RETURNING *`, [projectId, userId, t.platform, t.locale ?? null, JSON.stringify(t.metadata)])).rows[0];
        await db.query('INSERT INTO publication_jobs (publication_id,status) VALUES ($1,$2)', [p.id, 'queued']); return p; });
      const job = await enqueue(Q.publication(t.platform), 'publish', { publicationId: row.id, userId }, { plan: u.plan, userId, jobId: `pub-${row.id}` });
      out.push({ ...pubDto(row), jobId: job.id });
    }
    await audit(pool, userId, 'publication.create', 'project', projectId, { platforms: list.map((t) => t.platform) }); return { publications: out };
  },
  async get(userId: string, id: string) {
    return asUser(userId, async (db) => { const r = (await db.query<{ id: string; project_id: string; user_id: string; platform: ('tiktok' | 'youtube' | 'instagram' | 'shopee' | 'temu' | 'olx' | 'mercadolivre'); locale: string | null; status: string; metadata: unknown; external_id: string | null; external_url: string | null; error: string | null; retry_count: number; published_at: Date | null; created_at: Date; progress: number; stage: string | null }>(`SELECT p.*, j.progress, j.stage FROM publications p LEFT JOIN LATERAL (SELECT progress, stage FROM publication_jobs WHERE publication_id=p.id ORDER BY created_at DESC LIMIT 1) j ON true WHERE p.id=$1`, [id])).rows[0]; if (!r) throw notFound(); return pubDto(r); });
  },
  async list(userId: string, projectId?: string) { return asUser(userId, async (db) => ({ items: (await db.query(`SELECT * FROM publications WHERE user_id=$1 ${projectId ? 'AND project_id=$2' : ''} ORDER BY created_at DESC LIMIT 100`, projectId ? [userId, projectId] : [userId])).rows.map(pubDto) })); },
  async retry(userId: string, id: string) {
    const p = await asUser(userId, async (db) => (await db.query<Row<'publications'>>('SELECT * FROM publications WHERE id=$1', [id])).rows[0]); if (!p) throw notFound(); if (p.status !== 'failed') throw conflict('Só publicações com falha podem ser repetidas', 'not_failed');
    const u = (await usersRepo.byId(pool, userId))!; if (u.deletion_scheduled_for) throw new AppError(423, 'account_pending_deletion', 'Conta com exclusão agendada');
    if (!(await isEnabled(`publish_${p.platform}`, { userId, region: u.region, plan: u.plan }))) throw new AppError(503, 'platform_disabled', 'Publicação nesta plataforma está desativada');
    await asSystem((db) => db.query(`UPDATE publications SET status='pending', error=NULL, retry_count=retry_count+1 WHERE id=$1`, [id]));
    const job = await enqueue(Q.publication(p.platform), 'publish', { publicationId: id, userId }, { plan: u.plan, userId, jobId: `pub-${id}-r${p.retry_count + 1}` }); return { id, jobId: job.id, status: 'pending' };
  },

  /** Worker de publicação. Idempotente: retoma polling se `provider_job_id` existe (nunca reenvia o vídeo → sem post duplicado). */
  async process(d: { publicationId: string; userId: string }, job: Job): Promise<void> {
    const pub = (await asSystem((db) => db.query<Row<'publications'>>('SELECT * FROM publications WHERE id=$1', [d.publicationId]))).rows[0]; if (!pub || pub.status === 'published') return;
    const platform = pub.platform as PlatformId; const mod = INTEGRATIONS[platform]; const meta = pub.metadata as PublishMeta & { affiliate?: boolean }; const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const setJob = (status: string, progress: number, stage: string, providerJobId?: string) => pool.query(`UPDATE publication_jobs SET status=$2, progress=$3, stage=$4, provider_job_id=COALESCE($5, provider_job_id), queue_job_id=$6 WHERE id=(SELECT id FROM publication_jobs WHERE publication_id=$1 ORDER BY created_at DESC LIMIT 1)`, [pub.id, status, progress, stage, providerJobId ?? null, String(job.id)]);
    const fail = async (msg: string, fatal: boolean) => { if (!fatal && !final) return false; await pool.query(`UPDATE publications SET status='failed', error=$2 WHERE id=$1`, [pub.id, msg]); await setJob('failed', 0, 'failed'); m.pubFail.inc({ platform }); sloRecord('publication-success-rate', false); await batchHooks.onPublicationDone(pub.id, false, msg); void growthHooks.onPublication(d.userId, pub.project_id, pub.id, platform, false, 'platform_error'); return true; };
    try {
      const u = (await usersRepo.byId(pool, d.userId))!;
      if (!(await isEnabled(`publish_${platform}`, { userId: d.userId, region: u.region, plan: u.plan }))) { await fail('Publicação desativada nesta plataforma (kill switch)', true); throw new UnrecoverableError('platform_disabled'); }
      if (await cbOpen(platform)) throw new PlatformError(platform, 'Plataforma instável no momento (circuit breaker aberto). Nova tentativa em instantes.', true, 'circuit_open');
      if (platform === 'tiktok') { for (let i = 0; i < 70; i++) { if ((await hit(`tiktok-init:${d.userId}`, 6, 60)).ok) break; await sleep(1000); } } // 6 inits/min por usuário
      await pool.query(`UPDATE publications SET status='uploading' WHERE id=$1`, [pub.id]); await setJob('running', 0.05, 'token');
      const { tokens } = await integrationsService.freshToken(d.userId, platform);
      const project = (await asSystem((db) => projectsRepo.byId(db, pub.project_id)))!;
      // Módulo 1: com ff_audio ligada e uma mixagem ativa da montagem atual, publica o vídeo com o áudio mixado; senão, o de sempre
      let srcRef = (await audioService.effectiveVideoRef(project, u)) ?? project.final_video_url!;
      if (pub.locale && pub.locale !== project.source_locale) { const lv = (await pool.query<Pick<Row<'localized_versions'>, 'video_url'>>(`SELECT video_url FROM localized_versions WHERE project_id=$1 AND locale=$2 AND status='done'`, [pub.project_id, pub.locale])).rows[0]; if (!lv) throw new UnrecoverableError('versão dublada indisponível'); srcRef = lv.video_url as string; }
      let youtubeUrl: string | undefined;
      if (platform === 'olx') { // depende do YouTube do mesmo projeto: espera (até OLX_WAIT_MS) a publicação do YouTube concluir
        const deadline = Date.now() + Number(process.env.OLX_WAIT_MS ?? 600_000);
        for (;;) { const y = (await pool.query<{ status: string; external_url: string | null }>(`SELECT status, external_url FROM publications WHERE project_id=$1 AND platform='youtube' AND COALESCE(locale,'')=COALESCE($2,'') ORDER BY created_at DESC LIMIT 1`, [pub.project_id, pub.locale])).rows[0];
          if (y?.status === 'published' && y.external_url) { youtubeUrl = y.external_url; break; }
          if (!y || y.status === 'failed') throw new PlatformError('olx', 'Depende do YouTube: o envio automático ao YouTube falhou. Tente novamente.', false, 'youtube_dependency');
          if (Date.now() > deadline) throw new PlatformError('olx', 'Tempo esgotado aguardando o YouTube concluir', true, 'youtube_wait');
          await sleep(Math.max(POLL_MS, 200)); } }
      let providerJobId: string | undefined = (await pool.query<Pick<Row<'publication_jobs'>, 'provider_job_id'>>(`SELECT provider_job_id FROM publication_jobs WHERE publication_id=$1 AND provider_job_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`, [pub.id])).rows.at(0)?.provider_job_id ?? undefined;
      if (!providerJobId) {
        providerJobId = await withAdapted(platform, srcRef, pub.project_id, async (video, ad) => {
          await setJob('running', 0.2, 'adaptação'); const v = mod.publish.validate(video, meta); if (!v.ok) throw new UnrecoverableError(`Validação: ${v.errors.join('; ')}`);
          const r = await mod.publish.upload({ ...video, youtubeUrl }, meta, tokens as OAuthTokens, (p, stage) => void setJob('running', 0.3 + p * 0.5, stage));
          await setJob('running', 0.85, ad.applied.join(' · ') || 'upload', r.providerJobId); return r.providerJobId; });
      }
      await pool.query(`UPDATE publications SET status='processing' WHERE id=$1`, [pub.id]);
      let res = await mod.publish.pollStatus(providerJobId, tokens as OAuthTokens, meta);
      for (let i = 0; res.status === 'processing' && i < POLL_MAX; i++) { await sleep(POLL_MS); res = await mod.publish.pollStatus(providerJobId, tokens as OAuthTokens, meta); }
      if (res.status === 'failed') { await fail(res.error ?? 'A plataforma rejeitou o vídeo', true); return; }
      if (res.status !== 'published') throw new PlatformError(platform, 'Tempo esgotado aguardando a plataforma processar', true, 'poll_timeout');
      await pool.query(`UPDATE publications SET status='published', external_id=$2, external_url=$3, published_at=now(), error=NULL WHERE id=$1`, [pub.id, res.externalId ?? providerJobId, res.externalUrl ?? null]); await setJob('completed', 1, 'published'); m.pubOk.inc({ platform }); sloRecord('publication-success-rate', true); await redis.del(`pcb:fail:${platform}`);
      if (meta.affiliate && (platform === 'shopee' || platform === 'mercadolivre')) await affiliatesService.autoLink(d.userId, pub.id, platform, res.externalUrl ?? '', Math.round(Number(meta.price ?? 0) * 100)).catch((e) => logger.warn({ err: (e as Error).message }, 'link de afiliado não gerado'));
      await batchHooks.onPublicationDone(pub.id, true); void growthHooks.onPublication(d.userId, pub.project_id, pub.id, platform, true);
    } catch (e) {
      if (e instanceof UnrecoverableError) { if (!(await pool.query<{ "?column?": number | null }>(`SELECT 1 FROM publications WHERE id=$1 AND status='failed'`, [pub.id])).rowCount) await fail(e.message, true); throw e; }
      const err = e as Error; const pe = e instanceof PlatformError ? e : undefined; if (!pe?.code?.startsWith('circuit')) await cbFail(platform);
      const retryable = pe ? pe.retryable : true; await fail(err.message, !retryable); if (!retryable) throw new UnrecoverableError(err.message); throw e;
    }
  },
};
