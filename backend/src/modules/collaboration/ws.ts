import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';
import { AppError } from '../../utils/errors.js';
import { asSystem } from '../../db/pool.js';
import { timelineService } from '../timeline/timelineService.js';
import { collaborationService, commentBodySchema } from './collaborationService.js';
import { flagOn, roleOf } from './permissions.js';
import { camelOut } from '../../utils/case.js';
import { closeRealtime, heartbeat, join, leave, publish, type RoomConn } from './realtime.js';

/**
 * Módulo 8 — WebSocket `/api/v1/collab/ws`.
 * 1. O cliente pega um ticket (`POST /collab/ws-ticket`, JWT de 60 s, uso único) e o envia na PRIMEIRA MENSAGEM:
 *    `{type:'auth', token}`. Token na URL é ignorado de propósito (vaza em logs de proxy/CDN); sem auth em
 *    COLLAB_WS_AUTH_TIMEOUT_MS → fecha com 4401.
 * 2. Cada `op` passa por `timelineService.apply`, que confere a permissão NO SERVIDOR a cada mensagem (viewer → `rejected`
 *    403, nada é escrito). Colaborador removido é derrubado (4403) em todas as instâncias.
 * Códigos de fechamento: 4401 sem login · 4403 sem acesso · 4404 recurso desligado · 4429 mensagens demais · 1009 grande demais.
 */
const MAX_MSGS_PER_SEC = 40;
type Msg = { type: string; [k: string]: unknown };
export async function collabSocket(app: FastifyInstance): Promise<void> {
  app.addHook('onClose', async () => { await closeRealtime(); });
  app.get('/collab/ws', { websocket: true }, (socket: WebSocket) => {
    let conn: RoomConn | null = null; let projectId = ''; let chain = Promise.resolve();
    let window = Date.now(), count = 0; let beat: NodeJS.Timeout | undefined;
    const send = (m: unknown) => { if (socket.readyState === 1) socket.send(JSON.stringify(m)); };
    const close = (code: number, reason: string) => { try { socket.close(code, reason); } catch { /* já fechado */ } };
    const timer = setTimeout(() => { if (!conn) close(4401, 'auth_timeout'); }, env.COLLAB_WS_AUTH_TIMEOUT_MS);
    const fail = (id: unknown, e: unknown) => {
      const a = e instanceof AppError ? e : null; const z = (e as { name?: string })?.name === 'ZodError';
      send({ type: 'rejected', id, status: a?.status ?? (z ? 400 : 500), code: a?.code ?? (z ? 'invalid_op' : 'error'), message: a?.message ?? (z ? 'Alteração inválida' : 'Erro'), details: a?.details ?? null });
    };
    async function handle(m: Msg): Promise<void> {
      if (!conn) {
        if (m.type !== 'auth' || typeof m.token !== 'string') return close(4401, 'auth_required');
        const t = await collaborationService.verifyTicket(m.token); if (!t) return close(4401, 'invalid_ticket');
        if (!(await flagOn('ff_collaboration', t.userId))) return close(4404, 'disabled');
        const role = await roleOf(t.userId, t.projectId); if (!role) return close(4403, 'no_access');
        const name = await asSystem(async (db) => (await db.query<{ name: string }>('SELECT name FROM users WHERE id=$1', [t.userId])).rows.at(0)?.name ?? '');
        clearTimeout(timer); projectId = t.projectId;
        conn = { id: randomUUID(), userId: t.userId, name, role, send, close };
        const people = await join(projectId, conn);
        beat = setInterval(() => { if (conn) void heartbeat(projectId, conn); }, 30_000); beat.unref();
        return send({ type: 'ready', projectId, role, me: { userId: t.userId, name }, presence: people });
      }
      switch (m.type) {
        case 'ping': return send({ type: 'pong', at: Date.now() });
        case 'op': try { const r = await timelineService.apply(conn.userId, projectId, m.op); send({ type: 'ack', id: m.id, rev: r.rev, conflict: r.conflict, overwritten: camelOut(r.overwritten ?? null), entity: camelOut(r.entity) }); } catch (e) { fail(m.id, e); } return;
        case 'cursor': { const timeMs = Number(m.timeMs); if (!Number.isFinite(timeMs) || timeMs < 0 || timeMs > 120_000) return;
          return publish(projectId, { type: 'cursor', user: { userId: conn.userId, name: conn.name }, timeMs, trackId: typeof m.trackId === 'string' ? m.trackId.slice(0, 36) : null }, conn.id); }
        case 'comment': try { const c = await collaborationService.addComment(conn.userId, projectId, commentBodySchema.parse({ timeMs: m.timeMs, body: m.body, clipId: m.clipId })); send({ type: 'ack', id: m.id, comment: c }); } catch (e) { fail(m.id, e); } return;
        default: return send({ type: 'rejected', id: m.id, status: 400, code: 'unknown_type' });
      }
    }
    socket.on('message', (raw: Buffer, isBinary: boolean) => {
      const now = Date.now(); if (now - window > 1000) { window = now; count = 0; } if (++count > MAX_MSGS_PER_SEC) return close(4429, 'rate_limited');
      if (isBinary || raw.length > 64 * 1024) return close(1009, 'too_big');
      let m: Msg; try { m = JSON.parse(raw.toString('utf8')) as Msg; if (!m || typeof m.type !== 'string') throw new Error(); } catch { return conn ? send({ type: 'rejected', status: 400, code: 'invalid_json' }) : close(4401, 'auth_required'); }
      chain = chain.then(() => handle(m)).catch((e) => { logger.warn({ err: (e as Error).message }, 'mensagem de colaboração falhou'); fail(m.id, e); }); // em ordem, por conexão
    });
    socket.on('close', () => { clearTimeout(timer); if (beat) clearInterval(beat); if (conn) { const c = conn; conn = null; void leave(projectId, c); } });
    socket.on('error', () => undefined);
  });
}
