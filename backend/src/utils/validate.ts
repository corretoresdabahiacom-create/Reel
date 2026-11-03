import { z, type ZodTypeAny } from 'zod';
import { badRequest } from './errors.js';
import { noteParse } from '../observability/contractRecorder.js';
export function parse<S extends ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  noteParse(schema, data); // só faz algo com OPENAPI_RECORD=1 (gera o contrato a partir da suíte)
  const r = schema.safeParse(data);
  if (!r.success) throw badRequest('Dados inválidos', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  return r.data;
}
export const uuid = z.string().uuid();
export const cursorQuery = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) });
/** Cursor opaco = base64url(JSON). */
export const encodeCursor = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
export const decodeCursor = <T>(c?: string): T | undefined => { if (!c) return undefined; try { return JSON.parse(Buffer.from(c, 'base64url').toString()) as T; } catch { throw badRequest('cursor inválido'); } };
export const PLATFORMS = ['tiktok', 'youtube', 'instagram', 'shopee', 'temu', 'olx', 'mercadolivre'] as const;
export type PlatformId = (typeof PLATFORMS)[number];
export const platformSchema = z.enum(PLATFORMS);
export const localeSchema = z.enum(['pt-BR', 'en', 'es', 'es-MX']);
