import { asSystem } from '../../db/pool.js';
import { storage, refLocation } from '../../providers/storage.js';
import { audit } from '../../repositories/audit.js';
import { enqueue, Q } from '../../queues/index.js';
import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';

/**
 * "Excluir projeto" apaga os arquivos de verdade (antes só marcava deleted_at e tudo ficava no storage).
 * Apaga: tudo em videos/projects/<id>/ (vídeo final, cenas, quadros, dublagens, áudio, legendas, versões),
 * os assets derivados do projeto e as fotos que nenhum outro projeto vivo do mesmo usuário usa.
 * Idempotente: roda só para projeto excluído e uma vez (files_purged_at).
 */
/** O projeto foi excluído (ou não existe mais)? Usado pelos workers depois de gerar: a exclusão pode chegar no meio. */
export async function projectGone(projectId: string): Promise<boolean> {
  const r = (await asSystem((db) => db.query<{ deleted_at: Date | null }>('SELECT deleted_at FROM projects WHERE id=$1', [projectId]))).rows.at(0);
  return !r || !!r.deleted_at;
}
/** Worker terminou de gerar mas o projeto foi excluído no meio: apaga o que acabou de gravar (tudo do projeto). */
export async function discardLateFiles(projectId: string, where: string): Promise<number> {
  const files = await storage.deletePrefix('videos', `projects/${projectId}/`);
  logger.info({ projectId, where, files }, 'projeto excluído durante a geração: arquivos novos descartados');
  return files;
}

/**
 * `force` (2ª passada, PROJECT_PURGE_RECHECK_SEC depois): roda mesmo já limpo e apaga o que algum job em andamento
 * (dublagem, áudio, efeitos, montagem…) tenha gravado DEPOIS da 1ª limpeza. Fotos não são regravadas: ficam de fora.
 */
export async function purgeProjectFiles(projectId: string, actor = 'system', opts: { force?: boolean } = {}): Promise<{ files: number; skipped?: 'not_deleted' | 'already_purged' | 'not_found'; recheck?: true }> {
  const p = (await asSystem((db) => db.query<{ user_id: string; photo_refs: string[]; deleted_at: Date | null; files_purged_at: Date | null }>(
    'SELECT user_id, photo_refs, deleted_at, files_purged_at FROM projects WHERE id=$1', [projectId]))).rows.at(0);
  if (!p) return { files: 0, skipped: 'not_found' };
  if (!p.deleted_at) return { files: 0, skipped: 'not_deleted' };
  if (p.files_purged_at && !opts.force) return { files: 0, skipped: 'already_purged' };
  let files = await storage.deletePrefix('videos', `projects/${projectId}/`);
  if (p.files_purged_at) { // 2ª passada: só o que foi gravado depois da 1ª
    const der = (await asSystem((db) => db.query<{ file_url: string | null }>('SELECT file_url FROM derived_assets WHERE source_project_id=$1', [projectId]))).rows;
    for (const r of der) if (r.file_url && await storage.exists('videos', r.file_url).catch(() => false)) { await storage.delete('videos', r.file_url).catch(() => undefined); files++; }
    if (files) await asSystem((db) => audit(db, actor, 'project.files_repurged', 'project', projectId, { files }));
    return { files, recheck: true };
  }
  const derived = (await asSystem((db) => db.query<{ file_url: string | null }>('SELECT file_url FROM derived_assets WHERE source_project_id=$1', [projectId]))).rows;
  for (const r of derived) if (r.file_url) { await storage.delete('videos', r.file_url).catch(() => undefined); files++; }
  // Fotos podem ser reaproveitadas em outros projetos (mesma referência): só sai a que ninguém mais usa.
  const inUse = new Set((await asSystem((db) => db.query<{ ref: string | null }>(
    `SELECT DISTINCT unnest(photo_refs) AS ref FROM projects WHERE user_id=$1 AND id<>$2 AND deleted_at IS NULL
     UNION SELECT DISTINCT unnest(s.reference_images) AS ref FROM scenes s JOIN projects o ON o.id=s.project_id WHERE o.user_id=$1 AND o.id<>$2 AND o.deleted_at IS NULL`,
    [p.user_id, projectId]))).rows.map((r) => r.ref));
  for (const ref of new Set(p.photo_refs)) if (!inUse.has(ref)) { const l = refLocation(ref); await storage.delete(l.bucket, l.key).catch(() => undefined); files++; }
  // Narrações gravadas para este projeto (estúdio de voz): arquivo e registro saem junto com o projeto.
  const recs = (await asSystem((db) => db.query<{ file_url: string }>('DELETE FROM voice_recordings WHERE project_id=$1 RETURNING file_url', [projectId]))).rows;
  for (const r of recs) { const l = refLocation(r.file_url); await storage.delete(l.bucket, l.key).catch(() => undefined); files++; }
  // Cache de cenas (otimização de custo) apontando para arquivos deste projeto: a entrada morreria (cópia falha) e guardaria chave de dado excluído.
  await asSystem((db) => db.query('DELETE FROM ai_scene_cache WHERE video_key LIKE $1 OR last_frame_key LIKE $1', [`projects/${projectId}/%`]));
  await asSystem(async (db) => { await db.query('UPDATE projects SET files_purged_at=now() WHERE id=$1', [projectId]); await audit(db, actor, 'project.files_purged', 'project', projectId, { files }); });
  return { files };
}

/** Chamado logo depois da exclusão: agenda a limpeza (PROJECT_PURGE_DELAY_SEC; 0 = já, em segundo plano). */
export async function schedulePurge(userId: string, projectId: string): Promise<void> {
  await enqueue(Q.maintenance, 'project-purge', { projectId }, { userId, delay: env.PROJECT_PURGE_DELAY_SEC * 1000, jobId: `purge-${projectId}` });
  // 2ª passada depois do maior tempo possível de um job em andamento (Kling: até ~30 min com novas tentativas)
  await enqueue(Q.maintenance, 'project-purge-recheck', { projectId }, { userId, delay: (env.PROJECT_PURGE_DELAY_SEC + env.PROJECT_PURGE_RECHECK_SEC) * 1000, jobId: `purge-recheck-${projectId}` });
}

/** Rede de segurança diária: projeto excluído há mais que o prazo e ainda com arquivos (job perdido, Redis limpo…). */
export async function purgeDueProjects(limit = 200): Promise<{ projects: number; files: number }> {
  const due = (await asSystem((db) => db.query<{ id: string }>(
    `SELECT id FROM projects WHERE deleted_at IS NOT NULL AND files_purged_at IS NULL AND deleted_at < now() - make_interval(secs => $1) ORDER BY deleted_at LIMIT $2`,
    [env.PROJECT_PURGE_DELAY_SEC, limit]))).rows;
  // e a 2ª passada para excluídos nos últimos 3 dias (caso o job de recheck tenha se perdido)
  const recent = (await asSystem((db) => db.query<{ id: string }>(
    `SELECT id FROM projects WHERE files_purged_at IS NOT NULL AND deleted_at > now() - interval '3 days' AND deleted_at < now() - make_interval(secs => $1) ORDER BY deleted_at LIMIT $2`,
    [env.PROJECT_PURGE_DELAY_SEC + env.PROJECT_PURGE_RECHECK_SEC, limit]))).rows;
  let files = 0;
  for (const r of [...due.map((x) => ({ ...x, force: false })), ...recent.map((x) => ({ ...x, force: true }))]) {
    try { files += (await purgeProjectFiles(r.id, 'system', { force: r.force })).files; } catch (e) { logger.warn({ projectId: r.id, err: (e as Error).message }, 'limpeza de projeto excluído falhou; tenta de novo na próxima varredura'); }
  }
  return { projects: due.length + recent.length, files };
}
