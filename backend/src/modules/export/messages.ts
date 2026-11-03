import { AppError } from '../../utils/errors.js';

/** Mensagens do Módulo 5 em pt-BR, en e es, pelo `code` do erro (mesmo padrão dos módulos anteriores). */
type L = { 'pt-BR': string; en: string; es: string };
export const SAVE_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  video_not_assembled: { 'pt-BR': 'O vídeo precisa estar pronto para ser salvo', en: 'The video must be ready to be saved', es: 'El video debe estar listo para guardarse' },
  cloud_not_connected: { 'pt-BR': 'Conecte essa nuvem antes de salvar nela', en: 'Connect this cloud before saving to it', es: 'Conecta esta nube antes de guardar en ella' },
  cloud_reauth_required: { 'pt-BR': 'A conexão com a nuvem expirou. Conecte de novo', en: 'The cloud connection expired. Connect again', es: 'La conexión con la nube expiró. Conéctala de nuevo' },
  cloud_unavailable: { 'pt-BR': 'Essa nuvem não respondeu agora. Tentamos de novo sozinhos; se continuar, salve na Nuvem NexusReel', en: 'This cloud is not responding right now. We retry automatically; if it persists, save to NexusReel Cloud', es: 'Esta nube no responde ahora. Reintentamos solos; si sigue, guarda en la Nube NexusReel' },
  cloud_not_configured: { 'pt-BR': 'Essa nuvem ainda não está disponível', en: 'This cloud is not available yet', es: 'Esta nube aún no está disponible' },
  oauth_denied: { 'pt-BR': 'A autorização foi cancelada', en: 'Authorization was cancelled', es: 'La autorización fue cancelada' },
  oauth_state_invalid: { 'pt-BR': 'O link de conexão expirou. Tente conectar de novo', en: 'The connection link expired. Try connecting again', es: 'El enlace de conexión expiró. Intenta conectar de nuevo' },
  scope_too_broad: { 'pt-BR': 'A nuvem pediu mais acesso do que o necessário; a conexão foi recusada', en: 'The cloud granted more access than needed; the connection was refused', es: 'La nube concedió más acceso del necesario; la conexión fue rechazada' },
  connection_not_found: { 'pt-BR': 'Essa nuvem não está conectada', en: 'This cloud is not connected', es: 'Esta nube no está conectada' },
  nexus_quota_exceeded: { 'pt-BR': 'Sua Nuvem NexusReel está cheia. Apague itens antigos ou assine o Pro', en: 'Your NexusReel Cloud is full. Delete old items or upgrade to Pro', es: 'Tu Nube NexusReel está llena. Borra elementos antiguos o pásate a Pro' },
  export_not_found: { 'pt-BR': 'Salvamento não encontrado', en: 'Save not found', es: 'Guardado no encontrado' },
  catalog_not_found: { 'pt-BR': 'Catálogo não encontrado', en: 'Catalog not found', es: 'Catálogo no encontrado' },
  batch_empty: { 'pt-BR': 'Nenhum produto do catálogo tem vídeo pronto', en: 'No product in the catalog has a ready video', es: 'Ningún producto del catálogo tiene video listo' },
  file_too_large: { 'pt-BR': 'Arquivo grande demais para esse destino', en: 'File too large for this destination', es: 'Archivo demasiado grande para este destino' },
  save_failed: { 'pt-BR': 'Não foi possível salvar agora. Tente de novo em alguns minutos', en: 'Could not save right now. Try again in a few minutes', es: 'No se pudo guardar ahora. Inténtalo en unos minutos' },
} satisfies Record<string, L>;
export type SaveMessageCode = keyof typeof SAVE_MESSAGES;
export const saveError = (status: number, code: SaveMessageCode, details?: unknown, as?: string) => new AppError(status, as ?? code, (SAVE_MESSAGES[code] as L)['pt-BR'], details);
