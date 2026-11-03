import { recordUsage, viaFallback } from './router.js';
import { AppError } from '../../utils/errors.js';

/**
 * Chamada medida a um provedor dos módulos pós-lançamento (R11 + R14): passa pelo circuit breaker compartilhado
 * (chave própria `<kind>:<provedor>`, para não misturar com o breaker de outro tipo de provedor), grava `ai_usage`
 * com status ok ou erro e, se todos falharem, devolve 503 com a mensagem do módulo.
 */
export async function measuredCall<T>(o: {
  kind: string; primary: string; fallback?: string; operation: string; ctx: { userId: string; projectId?: string };
  unavailable: () => AppError; call: (provider: string) => Promise<T>;
}): Promise<T> {
  try {
    return await viaFallback(o.kind, `${o.kind}:${o.primary}`, `${o.kind}:${o.fallback ?? o.primary}`, async (key) => {
      const name = key.slice(o.kind.length + 1); const t0 = Date.now();
      try { const r = await o.call(name); await recordUsage({ provider: name, operation: o.operation, costCents: 0, latencyMs: Date.now() - t0, userId: o.ctx.userId, projectId: o.ctx.projectId, status: 'ok' }); return r; }
      catch (e) { await recordUsage({ provider: name, operation: o.operation, costCents: 0, latencyMs: Date.now() - t0, userId: o.ctx.userId, projectId: o.ctx.projectId, status: 'error' }).catch(() => undefined); throw e; }
    });
  } catch (e) { if (e instanceof AppError && e.status < 500) throw e; throw o.unavailable(); }
}
