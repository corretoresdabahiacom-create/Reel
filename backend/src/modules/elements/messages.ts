import { AppError } from '../../utils/errors.js';

/** Mensagens do Módulo 3 em pt-BR, en e es, pelo `code` do erro (mesmo padrão dos Módulos 1 e 2). */
type L = { 'pt-BR': string; en: string; es: string };
export const EL_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  scene_not_found: { 'pt-BR': 'Cena não encontrada', en: 'Scene not found', es: 'Escena no encontrada' },
  scene_media_missing: { 'pt-BR': 'Esta cena ainda não tem a mídia escolhida', en: 'This scene does not have the chosen media yet', es: 'Esta escena aún no tiene el contenido elegido' },
  reference_required: { 'pt-BR': 'Envie a foto de referência do elemento', en: 'Upload the reference photo of the element', es: 'Sube la foto de referencia del elemento' },
  reference_invalid: { 'pt-BR': 'A foto de referência não foi encontrada ou não é válida', en: 'The reference photo was not found or is invalid', es: 'La foto de referencia no se encontró o no es válida' },
  person_consent_required: { 'pt-BR': 'Para inserir uma pessoa real, confirme o consentimento de uso da imagem dela', en: 'To insert a real person, confirm consent to use their image', es: 'Para insertar a una persona real, confirma el consentimiento de uso de su imagen' },
  consent_not_found: { 'pt-BR': 'Consentimento de imagem não encontrado', en: 'Image consent not found', es: 'Consentimiento de imagen no encontrado' },
  consent_revoked: { 'pt-BR': 'Este consentimento foi revogado. Peça um novo', en: 'This consent was revoked. Request a new one', es: 'Este consentimiento fue revocado. Solicita uno nuevo' },
  phrase_mismatch: { 'pt-BR': 'A frase digitada não confere. Digite exatamente a frase mostrada', en: 'The typed sentence does not match. Type exactly the sentence shown', es: 'La frase escrita no coincide. Escribe exactamente la frase mostrada' },
  evidence_invalid: { 'pt-BR': 'O arquivo de autorização não foi encontrado ou não é válido', en: 'The authorization file was not found or is invalid', es: 'El archivo de autorización no se encontró o no es válido' },
  region_required: { 'pt-BR': 'Marque a região a alterar', en: 'Mark the region to change', es: 'Marca la región a cambiar' },
  external_provider_consent_required: { 'pt-BR': 'Para usar este recurso, autorize o envio da sua mídia ao provedor externo', en: 'To use this feature, allow your media to be sent to the external provider', es: 'Para usar esta función, autoriza el envío de tu contenido al proveedor externo' },
  elements_unavailable: { 'pt-BR': 'A inserção de elementos está indisponível agora. Tente de novo em alguns minutos', en: 'Element insertion is unavailable right now. Try again in a few minutes', es: 'La inserción de elementos no está disponible ahora. Inténtalo en unos minutos' },
  person_phrase: { 'pt-BR': 'Confirmo que tenho autorização da pessoa da foto para usar a imagem dela neste vídeo. Código {code}.', en: 'I confirm I have permission from the person in the photo to use their image in this video. Code {code}.', es: 'Confirmo que tengo autorización de la persona de la foto para usar su imagen en este video. Código {code}.' },
} satisfies Record<string, L>;
export type ElMessageCode = keyof typeof EL_MESSAGES;
export const elMsg = (code: ElMessageCode, locale = 'pt-BR'): string => { const m: L = EL_MESSAGES[code]; return m[locale.startsWith('en') ? 'en' : locale.startsWith('es') ? 'es' : 'pt-BR']; };
export const elError = (status: number, code: ElMessageCode, details?: unknown, as?: string) => new AppError(status, as ?? code, elMsg(code), details);
