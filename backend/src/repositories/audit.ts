import type { Db } from '../db/pool.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Atores não-humanos (ex.: 'system' em jobs automáticos) gravam actor_id nulo e ficam em metadata.actor. */
export async function audit(db: Db, actorId: string | null, action: string, targetType: string, targetId: string, metadata: Record<string, unknown> = {}): Promise<void> {
  const human = actorId && UUID.test(actorId); const meta = actorId && !human ? { ...metadata, actor: actorId } : metadata;
  await db.query('INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata) VALUES ($1,$2,$3,$4,$5)', [human ? actorId : null, action, targetType, targetId, JSON.stringify(meta)]);
}
