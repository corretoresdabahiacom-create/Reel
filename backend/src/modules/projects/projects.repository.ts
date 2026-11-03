import type { Db } from '../../db/pool.js';
import { encodeCursor } from '../../utils/validate.js';

export interface SceneRow { id: string; project_id: string; index: number; text: string; duration_sec: number; prompt: string; reference_mode: string; reference_images: string[]; video_url: string | null; last_frame_url: string | null;
  chained_from_scene_id: string | null; status: string; error_message: string | null; retried: boolean; consistency: number | null;
  version?: number; derived_from_scene_id?: string | null; selected?: boolean;
  inserted_elements?: Array<{ type: string; action: string; mode?: string; description: string; status: string; insertionId?: string; referenceImageUrl?: string | null; resultUrl?: string }> }
export interface ProjectRow { id: string; user_id: string; title: string; script: string; source_locale: string; storyboard_id: string | null; status: string; versions: string[]; final_video_url: string | null; duration_sec: number | null; category: string | null; template_id: string | null; photo_refs: string[]; created_at: string; deleted_at: string | null }
export const sceneDto = (s: SceneRow) => ({ id: s.id, projectId: s.project_id, index: s.index, text: s.text, durationSec: s.duration_sec, prompt: s.prompt, referenceMode: s.reference_mode, referenceImages: s.reference_images, videoUrl: s.video_url, lastFrameUrl: s.last_frame_url,
  chainedFromSceneId: s.chained_from_scene_id, status: s.status, errorMessage: s.error_message, retried: s.retried, consistency: s.consistency,
  // Módulo 3: opcional — só aparece quando a versão tem elementos inseridos (cenas antigas leem como antes)
  ...(s.inserted_elements?.length ? { insertedElements: s.inserted_elements.map((e) => ({ type: e.type, action: e.action, ...(e.mode ? { mode: e.mode } : {}), description: e.description, status: e.status })) } : {}) });
export const projectDto = (p: ProjectRow, scenes?: SceneRow[]) => ({ id: p.id, userId: p.user_id, title: p.title, script: p.script, sourceLocale: p.source_locale, storyboardId: p.storyboard_id, status: p.status, versions: p.versions, finalVideoUrl: p.final_video_url,
  durationSec: p.duration_sec, category: p.category, photoRefs: p.photo_refs, templateId: p.template_id, createdAt: p.created_at, ...(scenes ? { scenes: scenes.map(sceneDto) } : {}) });

export const projectsRepo = {
  async create(db: Db, p: { userId: string; title: string; script: string; locale: string; category?: string; templateId?: string; photos: string[] }): Promise<ProjectRow> {
    return (await db.query<ProjectRow>('INSERT INTO projects (user_id,title,script,source_locale,category,template_id,photo_refs) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *', [p.userId, p.title, p.script, p.locale, p.category ?? null, p.templateId ?? null, p.photos])).rows[0]!;
  },
  async byId(db: Db, id: string): Promise<ProjectRow | null> { return (await db.query<ProjectRow>('SELECT * FROM projects WHERE id=$1 AND deleted_at IS NULL', [id])).rows.at(0) ?? null; },
  async list(db: Db, userId: string, limit: number, cursor?: { at: string; id: string }, status?: string): Promise<{ items: ProjectRow[]; next?: string }> {
    const rows = (await db.query<ProjectRow>(`SELECT * FROM projects WHERE user_id=$1 AND deleted_at IS NULL ${status ? 'AND status=$5' : ''} AND ($2::timestamptz IS NULL OR (created_at, id) < ($2, $3::uuid)) ORDER BY created_at DESC, id DESC LIMIT $4`, [userId, cursor?.at ?? null, cursor?.id ?? null, limit + 1, ...(status ? [status] : [])])).rows;
    const items = rows.slice(0, limit); return { items, next: rows.length > limit ? encodeCursor({ at: items[items.length - 1]!.created_at, id: items[items.length - 1]!.id }) : undefined };
  },
  async update(db: Db, id: string, patch: Record<string, unknown>): Promise<ProjectRow | null> {
    const k = Object.keys(patch); if (!k.length) return projectsRepo.byId(db, id);
    return (await db.query<ProjectRow>(`UPDATE projects SET ${k.map((x, i) => `${x}=$${i + 2}`).join(',')} WHERE id=$1 AND deleted_at IS NULL RETURNING *`, [id, ...k.map((x) => patch[x])])).rows.at(0) ?? null;
  },
  async softDelete(db: Db, id: string): Promise<boolean> {
    const ok = ((await db.query('UPDATE projects SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL', [id])).rowCount ?? 0) === 1;
    if (ok) await db.query('DELETE FROM transcripts WHERE project_id=$1', [id]); // Módulo 9: transcrição (dado sensível) sai junto com o projeto
    return ok;
  },
  /** Cenas atuais do projeto: por posição, a versão escolhida no seletor (Módulo 2) ou, sem escolha, a mais recente (R2; RFC 2026-01). */
  async scenes(db: Db, projectId: string): Promise<SceneRow[]> { return (await db.query<SceneRow>('SELECT DISTINCT ON (index) * FROM scenes WHERE project_id=$1 ORDER BY index, selected DESC, version DESC', [projectId])).rows; },
  /** Histórico de versões de uma posição (mais recente primeiro). */
  async sceneVersions(db: Db, projectId: string, index: number): Promise<SceneRow[]> { return (await db.query<SceneRow>('SELECT * FROM scenes WHERE project_id=$1 AND index=$2 ORDER BY version DESC', [projectId, index])).rows; },
  async scene(db: Db, projectId: string, sceneId: string): Promise<SceneRow | null> { return (await db.query<SceneRow>('SELECT * FROM scenes WHERE project_id=$1 AND id=$2', [projectId, sceneId])).rows.at(0) ?? null; },
  async updateScene(db: Db, id: string, patch: Record<string, unknown>): Promise<SceneRow> { const k = Object.keys(patch); return (await db.query<SceneRow>(`UPDATE scenes SET ${k.map((x, i) => `${x}=$${i + 2}`).join(',')} WHERE id=$1 RETURNING *`, [id, ...k.map((x) => patch[x])])).rows[0]!; },
  async log(db: Db, projectId: string, sceneId: string | null, step: string, message: string): Promise<void> { await db.query('INSERT INTO generation_logs (project_id, scene_id, step, message) VALUES ($1,$2,$3,$4)', [projectId, sceneId, step, message]); },
  async logs(db: Db, projectId: string, afterId = 0): Promise<{ id: number; sceneId: string | null; step: string; message: string; timestamp: Date }[]> {
    return (await db.query<{ id: number; sceneId: string | null; step: string; message: string; timestamp: Date }>(`SELECT id, scene_id AS "sceneId", step, message, created_at AS timestamp FROM generation_logs WHERE project_id=$1 AND id > $2 ORDER BY id LIMIT 500`, [projectId, afterId])).rows;
  },
};
