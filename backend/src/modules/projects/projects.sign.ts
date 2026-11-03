import { signRef } from '../../providers/storage.js';
import type { projectDto } from './projects.repository.js';

/**
 * Vídeo final e fotos ficam guardados como referência interna do storage. Toda resposta de projeto
 * (lista, detalhe, PATCH) devolve URLs assinadas: `finalVideoUrl` e `thumbnailUrl` (1ª foto, para a Biblioteca).
 */
export async function signProject<T extends ReturnType<typeof projectDto>>(d: T): Promise<T & { finalVideoUrl: string | null; thumbnailUrl: string | null }> {
  const first = d.photoRefs[0];
  return { ...d, finalVideoUrl: d.finalVideoUrl ? await signRef(d.finalVideoUrl) : null, thumbnailUrl: first ? await signRef(first) : null };
}
/** Só no detalhe: todas as fotos assinadas, na ordem de photoRefs (o rascunho reaberto mostra cada foto na sua cena). */
export const signPhotos = (refs: string[]): Promise<string[]> => Promise.all(refs.map((r) => signRef(r)));
