import { AppError } from '../../utils/errors.js';

/** Mensagens do Módulo 4 em pt-BR, en e es, pelo `code` do erro (mesmo padrão dos módulos anteriores). */
type L = { 'pt-BR': string; en: string; es: string };
export const MERGE_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  merge_forbidden: { 'pt-BR': 'Só é possível unir vídeos que são seus', en: 'You can only merge videos that are yours', es: 'Solo puedes unir videos que son tuyos' },
  same_project: { 'pt-BR': 'Escolha dois vídeos diferentes', en: 'Choose two different videos', es: 'Elige dos videos diferentes' },
  video_not_assembled: { 'pt-BR': 'Os dois vídeos precisam estar prontos (montados) para unir', en: 'Both videos must be ready (assembled) to merge', es: 'Los dos videos deben estar listos (montados) para unir' },
  input_too_long: { 'pt-BR': 'Cada vídeo pode ter até 60 segundos', en: 'Each video can be up to 60 seconds', es: 'Cada video puede tener hasta 60 segundos' },
  merge_not_found: { 'pt-BR': 'União não encontrada', en: 'Merge not found', es: 'Unión no encontrada' },
  merge_failed: { 'pt-BR': 'Não foi possível unir os vídeos agora. Tente de novo em alguns minutos', en: 'Could not merge the videos right now. Try again in a few minutes', es: 'No se pudieron unir los videos ahora. Inténtalo en unos minutos' },
} satisfies Record<string, L>;
export type MergeMessageCode = keyof typeof MERGE_MESSAGES;
export const mergeError = (status: number, code: MergeMessageCode, details?: unknown, as?: string) => new AppError(status, as ?? code, (MERGE_MESSAGES[code] as L)['pt-BR'], details);
