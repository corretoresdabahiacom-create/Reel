import { AppError } from '../../utils/errors.js';

/** Mensagens do Módulo 2 em pt-BR, en e es, pelo `code` do erro (mesmo padrão do Módulo 1). */
type L = { 'pt-BR': string; en: string; es: string };
export const BG_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  scene_not_found: { 'pt-BR': 'Cena não encontrada', en: 'Scene not found', es: 'Escena no encontrada' },
  scene_media_missing: { 'pt-BR': 'Esta cena ainda não tem vídeo. Gere a cena antes de editar o fundo', en: 'This scene has no video yet. Generate it before editing the background', es: 'Esta escena aún no tiene video. Genérala antes de editar el fondo' },
  photo_missing: { 'pt-BR': 'Esta cena não tem a foto escolhida', en: 'This scene does not have the chosen photo', es: 'Esta escena no tiene la foto elegida' },
  background_source_required: { 'pt-BR': 'Descreva o fundo novo ou envie uma imagem', en: 'Describe the new background or upload an image', es: 'Describe el nuevo fondo o sube una imagen' },
  background_upload_invalid: { 'pt-BR': 'A imagem de fundo enviada não foi encontrada ou não é válida', en: 'The uploaded background image was not found or is invalid', es: 'La imagen de fondo enviada no se encontró o no es válida' },
  aspect_unchanged: { 'pt-BR': 'O vídeo já está nesse formato', en: 'The video is already in that format', es: 'El video ya está en ese formato' },
  version_not_found: { 'pt-BR': 'Versão não encontrada para esta cena', en: 'Version not found for this scene', es: 'Versión no encontrada para esta escena' },
  external_provider_consent_required: { 'pt-BR': 'Para usar este recurso, autorize o envio da sua mídia ao provedor externo', en: 'To use this feature, allow your media to be sent to the external provider', es: 'Para usar esta función, autoriza el envío de tu contenido al proveedor externo' },
  background_unavailable: { 'pt-BR': 'A edição de fundo está indisponível agora. Tente de novo em alguns minutos', en: 'Background editing is unavailable right now. Try again in a few minutes', es: 'La edición de fondo no está disponible ahora. Inténtalo en unos minutos' },
} satisfies Record<string, L>;
export type BgMessageCode = keyof typeof BG_MESSAGES;
export const bgMsg = (code: BgMessageCode): string => (BG_MESSAGES[code] as L)['pt-BR'];
export const bgError = (status: number, code: BgMessageCode, details?: unknown, as?: string) => new AppError(status, as ?? code, bgMsg(code), details);
