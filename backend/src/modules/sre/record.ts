import { redis } from '../../db/redis.js';
/**
 * Registro de eventos de SLI no próprio app (sem depender do Prometheus): agrega em memória por (slo, bucket de 5 min) e descarrega no Redis
 * a cada 10 s (HINCRBY) — custo ~0 no caminho quente, sem bloquear requisição. O coletor (`sreService.collect`) transforma os buckets em `slo_samples`.
 * Prometheus continua sendo a fonte de verdade em produção (slo-rules.generated.yml); isto alimenta o error budget/freeze dentro do produto.
 */
export const BUCKET_MS = 5 * 60_000; const PREFIX = 'slo:b:';
export const bucketOf = (t = Date.now()) => Math.floor(t / BUCKET_MS) * BUCKET_MS;
const mem = new Map<string, { g: number; t: number }>(); let timer: NodeJS.Timeout | undefined;
export function sloRecord(id: string, good: boolean, n = 1): void {
  const k = `${id}|${bucketOf()}`; const e = mem.get(k) ?? { g: 0, t: 0 }; e.t += n; if (good) e.g += n; mem.set(k, e);
  if (!timer) { timer = setInterval(() => void flushLocal(), 10_000); timer.unref(); }
}
export async function flushLocal(): Promise<void> {
  if (!mem.size) return; const items = [...mem.entries()]; mem.clear();
  try { const p = redis.pipeline(); for (const [k, v] of items) { const [id, b] = k.split('|'); const key = `${PREFIX}${id}:${b}`; p.hincrby(key, 'g', v.g); p.hincrby(key, 't', v.t); p.expire(key, 6 * 3600); } await p.exec(); } catch { /* telemetria nunca derruba o app */ }
}
/** Lê buckets (já descarregados) de um SLO entre [from, to). */
export async function readBuckets(id: string, from: number, to: number): Promise<Array<{ ts: number; good: number; total: number }>> {
  const out: Array<{ ts: number; good: number; total: number }> = [];
  for (let b = bucketOf(from); b < to; b += BUCKET_MS) { const h = await redis.hgetall(`${PREFIX}${id}:${b}`).catch(() => ({} as Record<string, string>)); const t = Number(h.t ?? 0); if (t > 0) out.push({ ts: b, good: Math.min(Number(h.g ?? 0), t), total: t }); }
  return out;
}
