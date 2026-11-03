import type { FastifyInstance, preHandlerAsyncHookHandler } from 'fastify';
import { redis } from '../db/redis.js';
import { badRequest, conflict } from '../utils/errors.js';
import { sha256 } from '../utils/crypto.js';

const TTL = 24 * 3600;
/**
 * Idempotência por `Idempotency-Key` (obrigatória apenas nas rotas que movimentam dinheiro/créditos: `required: true`; opcional nas demais). Chave = usuário + método + rota + valor.
 * 1ª chamada reserva a chave ("processing"); a resposta é gravada no onSend; repetições recebem a MESMA resposta
 * (header `Idempotent-Replay: true`). Mesma chave com corpo diferente → 422. Requisição concorrente → 409.
 */
export function idempotent(opts: { required?: boolean } = {}): preHandlerAsyncHookHandler {
  return async (req, reply) => {
    const k = req.headers['idempotency-key'];
    if (k === undefined && !opts.required) return; // opcional: sem header, a rota segue sem deduplicação (o front legado não envia)
    if (typeof k !== 'string' || k.length < 8 || k.length > 128) throw badRequest('Header Idempotency-Key inválido (8–128 caracteres)' + (opts.required ? ' — obrigatório nesta rota' : ''));
    const who = req.auth?.userId ?? req.ip; const fp = sha256(JSON.stringify(req.body ?? {}));
    const redisKey = `idem:${who}:${req.method}:${req.routeOptions.url}:${k}`;
    const fresh = await redis.set(redisKey, JSON.stringify({ state: 'processing', fp }), 'EX', TTL, 'NX');
    if (fresh) { req.idem = { key: k, redisKey }; return; }
    const cur = JSON.parse((await redis.get(redisKey)) ?? '{}') as { state?: string; fp?: string; status?: number; body?: string; ct?: string };
    if (cur.fp && cur.fp !== fp) return reply.status(422).send({ code: 'idempotency_key_reuse', message: 'Idempotency-Key já usada com outro corpo', traceId: req.traceId });
    if (cur.state === 'done') return reply.header('idempotent-replay', 'true').header('content-type', cur.ct ?? 'application/json; charset=utf-8').status(cur.status ?? 200).send(cur.body ?? '');
    throw conflict('Requisição idêntica em andamento', 'idempotency_in_progress');
  };
}
export function registerIdempotency(app: FastifyInstance): void {
  app.addHook('onSend', async (req, reply, payload) => {
    if (!req.idem) return payload;
    const { redisKey } = req.idem; req.idem = undefined;
    if (reply.statusCode >= 500) { await redis.del(redisKey); return payload; } // permite repetir após erro de servidor
    const prev = JSON.parse((await redis.get(redisKey)) ?? '{}') as { fp?: string };
    await redis.set(redisKey, JSON.stringify({ state: 'done', fp: prev.fp, status: reply.statusCode, body: typeof payload === 'string' ? payload : String(payload ?? ''), ct: String(reply.getHeader('content-type') ?? '') }), 'EX', TTL);
    return payload;
  });
}
