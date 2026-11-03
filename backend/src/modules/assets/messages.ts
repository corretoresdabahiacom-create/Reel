import { AppError } from '../../utils/errors.js';

/** Mensagens do Módulo 6 em pt-BR, en e es, pelo `code` do erro (mesmo padrão dos módulos anteriores). */
type L = { 'pt-BR': string; en: string; es: string };
export const ASSET_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  video_not_assembled: { 'pt-BR': 'O vídeo precisa estar pronto para virar GIF, figurinha ou papel de parede', en: 'The video must be ready to become a GIF, sticker or wallpaper', es: 'El video debe estar listo para convertirse en GIF, sticker o fondo de pantalla' },
  invalid_profile: { 'pt-BR': 'Escolha um perfil válido para esse tipo', en: 'Choose a valid profile for this type', es: 'Elige un perfil válido para este tipo' },
  invalid_format: { 'pt-BR': 'Esse formato não existe para o perfil escolhido', en: 'This format is not available for the chosen profile', es: 'Este formato no existe para el perfil elegido' },
  clip_too_short: { 'pt-BR': 'O trecho escolhido é curto demais', en: 'The chosen segment is too short', es: 'El tramo elegido es demasiado corto' },
  asset_not_found: { 'pt-BR': 'Arquivo não encontrado', en: 'File not found', es: 'Archivo no encontrado' },
  asset_failed: { 'pt-BR': 'Não foi possível gerar o arquivo agora. Tente de novo em alguns minutos', en: 'Could not create the file right now. Try again in a few minutes', es: 'No se pudo crear el archivo ahora. Inténtalo en unos minutos' },
} satisfies Record<string, L>;
export type AssetMessageCode = keyof typeof ASSET_MESSAGES;
export const assetError = (status: number, code: AssetMessageCode, details?: unknown, as?: string) => new AppError(status, as ?? code, (ASSET_MESSAGES[code] as L)['pt-BR'], details);
