/**
 * P0-1 etapa 1 — asserções de TIPO (verificadas pelo `npm run typecheck`, não executadas).
 * Se o backend remover/renomear uma destas rotas ou mudar o formato de erro, o snapshot novo quebra a compilação aqui,
 * antes de quebrar uma tela. Lista = rotas que a etapa 4 (migração tela a tela) vai usar primeiro.
 */
import type { paths, components } from '../src/api/schema';

type Has<T, K extends PropertyKey> = K extends keyof T ? true : never;
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : never;

export const routes: [
  Has<paths, '/auth/login'>, Has<paths, '/auth/refresh'>, Has<paths, '/auth/logout'>, Has<paths, '/users/me'>,
  Has<paths, '/projects'>, Has<paths, '/projects/{id}'>,
] = [true, true, true, true, true, true];

export const methods: [Has<paths['/auth/login'], 'post'>, Has<paths['/projects'], 'get'>, Has<paths['/projects'], 'post'>] = [true, true, true];

// Formato de erro único do backend: { code, message, details?, traceId? } — o cliente HTTP (etapa 2) depende dele.
export const errorShape: Equal<components['schemas']['Error'], { code: string; details?: unknown; message: string; traceId?: string }> = true;

// Login devolve o par de tokens no CORPO (relevante para a decisão de onde guardar o refresh na etapa 2).
export const authResponse: Has<components['schemas']['AuthResponse'], 'refreshToken'> = true;

// Etapa 1b — corpos tipados (antes eram `unknown`): entrada vem do zod do backend; saída, do formato observado na suíte.
type Body<P extends keyof paths, M extends keyof paths[P]> = paths[P][M] extends { requestBody?: { content: { 'application/json': infer B } } } ? B : never;
type Ok<P extends keyof paths, M extends keyof paths[P], S extends number> = paths[P][M] extends { responses: { [K in S]: { content: { 'application/json': infer R } } } } ? R : never;
type CommentIn = Body<'/projects/{projectId}/comments', 'post'>;
export const commentBody: [Equal<CommentIn['timeMs'], number>, Equal<CommentIn['body'], string>] = [true, true];
type Timeline = Ok<'/projects/{projectId}/timeline', 'get', 200>;
export const timelineOut: Has<Timeline, 'tracks'> = true;

// Etapa 2 — contrato garantido: camelCase na timeline (antes `start_ms`/`duration_ms`) e anulável onde o dado pode faltar.
type Clip = Ok<'/projects/{projectId}/timeline', 'get', 200>['tracks'][number]['clips'][number];
export const clipCamel: [Has<Clip, 'startMs'>, Has<Clip, 'durationMs'>, Has<Clip, 'trackId'>] = [true, true, true];
type NoSnake<T> = Extract<keyof T, `${string}_${string}`> extends never ? true : never;
export const clipNoSnake: NoSnake<Clip> = true;
type Episode = Ok<'/series/{seriesId}', 'get', 200>['episodes'][number];
export const prevNullable: Equal<Episode['prevEpisodeId'], string | null> = true;
