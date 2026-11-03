import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { makeRedis, redis } from '../../db/redis.js';
import { logger } from '../../observability/logger.js';

/**
 * Módulo 8 — salas de tempo real por projeto. Cada instância da API guarda só as conexões dela; os eventos passam pelo
 * Redis (pub/sub `collab:room:<projeto>`) para chegar às pessoas conectadas em outras instâncias.
 * Presença em hash no Redis (`collab:presence:<projeto>`, renovado a cada 30 s; some sozinho se a instância cair).
 */
export interface RoomConn { id: string; userId: string; name: string; role: string; send: (msg: unknown) => void; close: (code: number, reason: string) => void }
const INSTANCE = randomUUID();
const rooms = new Map<string, Map<string, RoomConn>>();
let sub: Redis | undefined; const subscribed = new Set<string>();
const chan = (p: string) => `collab:room:${p}`;
const presenceKey = (p: string) => `collab:presence:${p}`;

function deliver(projectId: string, ev: { except?: string; event: Record<string, unknown> }): void {
  const room = rooms.get(projectId); if (!room) return;
  if (ev.event.type === 'kick') { for (const c of room.values()) if (c.userId === ev.event.userId) c.close(4403, 'removed'); return; }
  for (const c of room.values()) if (c.id !== ev.except) { try { c.send(ev.event); } catch { /* conexão caindo */ } }
}
async function ensureSub(projectId: string): Promise<void> {
  if (!sub) {
    sub = makeRedis();
    sub.on('message', (channel: string, raw: string) => { try { const m = JSON.parse(raw) as { except?: string; event: Record<string, unknown> }; deliver(channel.slice('collab:room:'.length), m); } catch (e) { logger.warn({ err: (e as Error).message }, 'evento de colaboração inválido'); } });
  }
  if (!subscribed.has(projectId)) { subscribed.add(projectId); await sub.subscribe(chan(projectId)); }
}
/** Envia um evento para todos na sala do projeto (em qualquer instância), exceto a conexão `except`. */
export async function publish(projectId: string, event: Record<string, unknown>, except?: string): Promise<void> {
  await redis.publish(chan(projectId), JSON.stringify({ origin: INSTANCE, except, event })).catch((e) => logger.warn({ err: (e as Error).message }, 'falha ao publicar evento de colaboração'));
}
export async function join(projectId: string, c: RoomConn): Promise<Array<{ userId: string; name: string; role: string }>> {
  await ensureSub(projectId);
  let room = rooms.get(projectId); if (!room) { room = new Map(); rooms.set(projectId, room); } room.set(c.id, c);
  await redis.multi().hset(presenceKey(projectId), c.id, JSON.stringify({ userId: c.userId, name: c.name, role: c.role, at: Date.now() })).expire(presenceKey(projectId), 120).exec();
  await publish(projectId, { type: 'presence', event: 'join', user: { userId: c.userId, name: c.name, role: c.role } }, c.id);
  return presence(projectId);
}
export async function leave(projectId: string, c: RoomConn): Promise<void> {
  const room = rooms.get(projectId); room?.delete(c.id);
  if (room && room.size === 0) { rooms.delete(projectId); if (sub && subscribed.delete(projectId)) await sub.unsubscribe(chan(projectId)).catch(() => undefined); }
  await redis.hdel(presenceKey(projectId), c.id).catch(() => undefined);
  await publish(projectId, { type: 'presence', event: 'leave', user: { userId: c.userId, name: c.name } }, c.id);
}
export async function heartbeat(projectId: string, c: RoomConn): Promise<void> {
  await redis.multi().hset(presenceKey(projectId), c.id, JSON.stringify({ userId: c.userId, name: c.name, role: c.role, at: Date.now() })).expire(presenceKey(projectId), 120).exec().catch(() => undefined);
}
/** Quem está no projeto agora (uma entrada por pessoa, mesmo com várias abas). */
export async function presence(projectId: string): Promise<Array<{ userId: string; name: string; role: string }>> {
  const all = await redis.hgetall(presenceKey(projectId)).catch(() => ({} as Record<string, string>)); const seen = new Map<string, { userId: string; name: string; role: string }>();
  for (const raw of Object.values(all)) { try { const p = JSON.parse(raw) as { userId: string; name: string; role: string; at: number }; if (Date.now() - p.at < 90_000) seen.set(p.userId, { userId: p.userId, name: p.name, role: p.role }); } catch { /* ignora */ } }
  return [...seen.values()];
}
/** Remove alguém da sala em todas as instâncias (colaborador removido ou que saiu). */
export const kick = (projectId: string, userId: string) => publish(projectId, { type: 'kick', userId });
export async function closeRealtime(): Promise<void> { for (const room of rooms.values()) for (const c of room.values()) c.close(1001, 'shutdown'); rooms.clear(); subscribed.clear(); if (sub) { await sub.quit().catch(() => undefined); sub = undefined; } }
