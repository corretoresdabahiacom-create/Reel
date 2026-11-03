import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { authenticate, requireJwt, uid } from '../../middlewares/auth.js';
import { LIMITS, rateLimit } from '../../middlewares/rateLimit.js';
import { idempotent } from '../../middlewares/idempotency.js';
import { parse, uuid, cursorQuery, decodeCursor, localeSchema } from '../../utils/validate.js';
import { asUser } from '../../db/pool.js';
import { projectsRepo, projectDto, sceneDto } from './projects.repository.js';
import { generationService } from '../generation/generation.service.js';
import { dubbingService } from '../dubbing/dubbing.service.js';
import { notFound } from '../../utils/errors.js';
import { signProject as signed } from './projects.sign.js';
import { schedulePurge } from './projects.purge.js';
import { sectionsBody, sectionsService } from './sections.js';

const create = z.object({ title: z.string().trim().min(1).max(120), script: z.string().trim().max(4000).default(''), locale: localeSchema.default('pt-BR'), category: z.string().max(40).optional(), templateId: uuid.optional(), photos: z.array(z.string().max(300)).max(5).default([]) });
const patch = z.object({ title: z.string().trim().min(1).max(120).optional(), script: z.string().trim().max(4000).optional(), category: z.string().max(40).optional() }).strict();
const scenePatch = z.object({ text: z.string().max(600).optional(), prompt: z.string().max(800).optional(), durationSec: z.number().int().min(3).max(15).optional(), referenceMode: z.enum(['product', 'person', 'both']).optional() }).strict();
const dub = z.object({ targetLocales: z.array(localeSchema).min(1).max(2), voice: z.object({ gender: z.enum(['male', 'female', 'neutral']).default('neutral') }).default({ gender: 'neutral' }) });
const p = (r: { params: unknown }) => r.params as { id: string; sceneId?: string };

export async function projectsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate(), requireJwt] };
  const gen = { preHandler: [authenticate(), requireJwt, rateLimit(LIMITS.generation), idempotent()] };
  app.post('/projects', { preHandler: [authenticate(), requireJwt, rateLimit(LIMITS.write), idempotent()] }, async (req, reply) => reply.status(201).send(await generationService.createProject(uid(req), parse(create, req.body))));
  app.get('/projects', auth, async (req) => { const q = parse(cursorQuery.extend({ status: z.enum(['draft', 'generating', 'ready', 'failed']).optional() }), req.query); const r = await asUser(uid(req), (db) => projectsRepo.list(db, uid(req), q.limit, decodeCursor(q.cursor), q.status)); return { items: await Promise.all(r.items.map((x) => signed(projectDto(x)))), nextCursor: r.next ?? null }; });
  app.get('/projects/:id', auth, async (req) => generationService.getProject(uid(req), parse(uuid, p(req).id)));
  app.patch('/projects/:id', auth, async (req) => { const r = await asUser(uid(req), (db) => projectsRepo.update(db, parse(uuid, p(req).id), parse(patch, req.body))); if (!r) throw notFound(); return signed(projectDto(r)); });
  app.delete('/projects/:id', auth, async (req, reply) => { const id = parse(uuid, p(req).id); const ok = await asUser(uid(req), (db) => projectsRepo.softDelete(db, id)); if (!ok) throw notFound();
    await schedulePurge(uid(req), id); /* os arquivos saem do storage em segundo plano (projects.purge.ts) */ return reply.status(204).send(); });
  app.patch('/projects/:id/scenes/:sceneId', auth, async (req) => { const b = parse(scenePatch, req.body); const map: Record<string, string> = { durationSec: 'duration_sec', referenceMode: 'reference_mode' }; const patchRow = Object.fromEntries(Object.entries(b).map(([k, v]) => [map[k] ?? k, v]));
    return asUser(uid(req), async (db) => { const s = await projectsRepo.scene(db, parse(uuid, p(req).id), parse(uuid, p(req).sceneId)); if (!s) throw notFound(); return sceneDto(await projectsRepo.updateScene(db, s.id, patchRow)); }); });

  // Seções de até 15 s (ff_sections): grava foto + movimento + texto de cada seção e divide sozinho o que passa de 15 s
  app.put('/projects/:id/sections', { preHandler: [authenticate(), requireJwt, rateLimit(LIMITS.write)] }, async (req) => sectionsService.save(uid(req), parse(uuid, p(req).id), parse(sectionsBody, req.body)));
  app.post('/projects/:id/storyboard', gen, async (req, reply) => { const b = parse(z.object({ pipeline: z.boolean().optional() }).default({}), req.body ?? {}); return reply.status(202).send(await generationService.requestStoryboard(uid(req), parse(uuid, p(req).id), b)); });
  app.post('/projects/:id/scenes/:sceneId/generate', gen, async (req, reply) => reply.status(202).send(await generationService.requestScene(uid(req), parse(uuid, p(req).id), parse(uuid, p(req).sceneId), false, !!(req.body as { chain?: boolean } | undefined)?.chain)));
  app.post('/projects/:id/scenes/:sceneId/regenerate', gen, async (req, reply) => reply.status(202).send(await generationService.requestScene(uid(req), parse(uuid, p(req).id), parse(uuid, p(req).sceneId), true)));
  app.post('/projects/:id/assemble', gen, async (req, reply) => reply.status(202).send(await generationService.requestAssemble(uid(req), parse(uuid, p(req).id))));
  app.get('/projects/:id/generation-logs', auth, async (req) => ({ items: await generationService.logs(uid(req), parse(uuid, p(req).id), Number((req.query as { after?: string }).after ?? 0)) }));
  app.post('/projects/:id/dub', gen, async (req, reply) => { const b = parse(dub, req.body); return reply.status(202).send(await dubbingService.request(uid(req), parse(uuid, p(req).id), b.targetLocales, b.voice.gender)); });
  app.get('/projects/:id/localized-versions', auth, async (req) => dubbingService.list(uid(req), parse(uuid, p(req).id)));
}
