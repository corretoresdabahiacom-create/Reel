import { AppError } from '../../utils/errors.js';

/** Mensagens do Módulo 7 em pt-BR, en e es, pelo `code` do erro (mesmo padrão dos módulos anteriores). */
type L = { 'pt-BR': string; en: string; es: string };
export const SHARE_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  video_not_assembled: { 'pt-BR': 'O vídeo precisa estar pronto para ser enviado', en: 'The video must be ready to be sent', es: 'El video debe estar listo para enviarse' },
  asset_not_ready: { 'pt-BR': 'Esse arquivo ainda não está pronto', en: 'This file is not ready yet', es: 'Este archivo aún no está listo' },
  too_many_recipients: { 'pt-BR': 'Envie para no máximo 20 pessoas por vez', en: 'Send to at most 20 people at a time', es: 'Envía a un máximo de 20 personas por vez' },
  no_recipients: { 'pt-BR': 'Informe pelo menos um destinatário', en: 'Add at least one recipient', es: 'Agrega al menos un destinatario' },
  disposable_domain: { 'pt-BR': 'Não enviamos para e-mails temporários', en: 'We do not send to temporary email addresses', es: 'No enviamos a correos temporales' },
  message_has_link: { 'pt-BR': 'A mensagem não pode ter links (proteção contra golpes)', en: 'The message cannot contain links (scam protection)', es: 'El mensaje no puede tener enlaces (protección contra estafas)' },
  daily_limit: { 'pt-BR': 'Você atingiu o limite de envios de hoje. Tente amanhã', en: 'You reached today’s sending limit. Try tomorrow', es: 'Alcanzaste el límite de envíos de hoy. Inténtalo mañana' },
  batch_too_large: { 'pt-BR': 'Lote grande demais: use a opção ZIP ou menos destinatários', en: 'Batch too large: use the ZIP option or fewer recipients', es: 'Lote demasiado grande: usa la opción ZIP o menos destinatarios' },
  batch_empty: { 'pt-BR': 'Nenhum produto do catálogo tem vídeo pronto', en: 'No product in the catalog has a ready video', es: 'Ningún producto del catálogo tiene video listo' },
  catalog_not_found: { 'pt-BR': 'Catálogo não encontrado', en: 'Catalog not found', es: 'Catálogo no encontrado' },
  share_not_found: { 'pt-BR': 'Envio não encontrado', en: 'Share not found', es: 'Envío no encontrado' },
  link_invalid: { 'pt-BR': 'Este link não existe ou expirou', en: 'This link does not exist or has expired', es: 'Este enlace no existe o expiró' },
  wrong_password: { 'pt-BR': 'Senha incorreta', en: 'Wrong password', es: 'Contraseña incorrecta' },
  too_many_attempts: { 'pt-BR': 'Muitas tentativas. Aguarde 15 minutos', en: 'Too many attempts. Wait 15 minutes', es: 'Demasiados intentos. Espera 15 minutos' },
} satisfies Record<string, L>;
export type ShareMessageCode = keyof typeof SHARE_MESSAGES;
export const shareError = (status: number, code: ShareMessageCode, details?: unknown, as?: string) => new AppError(status, as ?? code, (SHARE_MESSAGES[code] as L)['pt-BR'], details);
export const shareText = (code: ShareMessageCode, locale: string) => (SHARE_MESSAGES[code] as L)[(['pt-BR', 'en', 'es'].includes(locale) ? locale : 'pt-BR') as keyof L];
