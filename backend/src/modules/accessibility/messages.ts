import { AppError, notFound } from '../../utils/errors.js';
import { asSystem } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';

/** Módulo 11 — flags e mensagens (pt-BR, en, es) pelo `code` do erro. Flag desligada = 404. */
export type A11yFlag = 'ff_accessibility' | 'ff_teleprompter';
export async function requireA11y(key: A11yFlag, userId: string): Promise<void> {
  const u = await asSystem(async (db) => (await db.query<{ region: string; plan: string }>('SELECT region, plan FROM users WHERE id=$1', [userId])).rows[0]);
  if (!u || !(await isEnabled(key, { userId, ...u }))) throw notFound();
}
type L = { 'pt-BR': string; en: string; es: string };
export const A11Y_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  video_not_assembled: { 'pt-BR': 'O vídeo precisa estar pronto', en: 'The video must be ready', es: 'El video debe estar listo' },
  asset_not_found: { 'pt-BR': 'Arquivo de acessibilidade não encontrado', en: 'Accessibility file not found', es: 'Archivo de accesibilidad no encontrado' },
  asset_not_ready: { 'pt-BR': 'O arquivo ainda não está pronto', en: 'The file is not ready yet', es: 'El archivo aún no está listo' },
  review_required: { 'pt-BR': 'Revise e aprove a audiodescrição antes de exportar', en: 'Review and approve the audio description before exporting', es: 'Revisa y aprueba la audiodescripción antes de exportar' },
  not_reviewable: { 'pt-BR': 'Esta audiodescrição não está aguardando revisão', en: 'This audio description is not awaiting review', es: 'Esta audiodescripción no está esperando revisión' },
  invalid_descriptions: { 'pt-BR': 'As descrições revisadas não batem com as cenas', en: 'The reviewed descriptions do not match the scenes', es: 'Las descripciones revisadas no coinciden con las escenas' },
  low_contrast: { 'pt-BR': 'Esse estilo de legenda não tem contraste suficiente (mínimo 4,5:1)', en: 'This caption style does not have enough contrast (at least 4.5:1)', es: 'Este estilo de subtítulo no tiene contraste suficiente (mínimo 4,5:1)' },
  generation_failed: { 'pt-BR': 'Não foi possível gerar agora. Tente em alguns minutos', en: 'Could not generate right now. Try again in a few minutes', es: 'No se pudo generar ahora. Inténtalo en unos minutos' },
  session_not_found: { 'pt-BR': 'Sessão de teleprompter não encontrada', en: 'Teleprompter session not found', es: 'Sesión de teleprompter no encontrada' },
  upload_opt_in_required: { 'pt-BR': 'A gravação fica no seu aparelho. Para enviar ao projeto, confirme o envio', en: 'The recording stays on your device. To send it to the project, confirm the upload', es: 'La grabación queda en tu dispositivo. Para enviarla al proyecto, confirma el envío' },
  not_a_recording: { 'pt-BR': 'Envie um vídeo WebM ou MP4', en: 'Upload a WebM or MP4 video', es: 'Sube un video WebM o MP4' },
  already_uploaded: { 'pt-BR': 'Esta gravação já foi enviada', en: 'This recording was already uploaded', es: 'Esta grabación ya se envió' },
  idempotency_key_required: { 'pt-BR': 'Envie o cabeçalho Idempotency-Key (8 a 128 caracteres)', en: 'Send the Idempotency-Key header (8 to 128 characters)', es: 'Envía el encabezado Idempotency-Key (8 a 128 caracteres)' },
  invalid_signature: { 'pt-BR': 'Assinatura inválida: o arquivo foi alterado ou não é do NexusReel', en: 'Invalid signature: the file was changed or is not from NexusReel', es: 'Firma inválida: el archivo fue modificado o no es de NexusReel' },
} satisfies Record<string, L>;
export type A11yCode = keyof typeof A11Y_MESSAGES;
export const a11yError = (status: number, code: A11yCode, details?: unknown, as?: string) => new AppError(status, as ?? code, (A11Y_MESSAGES[code] as L)['pt-BR'], details);
