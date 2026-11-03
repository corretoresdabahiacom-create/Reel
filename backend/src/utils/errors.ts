export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
export const badRequest = (m: string, d?: unknown) => new AppError(400, 'bad_request', m, d);
export const unauthorized = (m = 'Não autenticado') => new AppError(401, 'unauthorized', m);
export const forbidden = (m = 'Sem permissão') => new AppError(403, 'forbidden', m);
export const notFound = (m = 'Não encontrado') => new AppError(404, 'not_found', m);
export const conflict = (m: string, code = 'conflict') => new AppError(409, code, m);
export const unprocessable = (m: string, d?: unknown) => new AppError(422, 'unprocessable', m, d);
export const tooMany = (m = 'Muitas requisições', retryAfterSec?: number) => new AppError(429, 'rate_limited', m, { retryAfterSec });
export const unavailable = (m: string, code = 'service_unavailable') => new AppError(503, code, m);
