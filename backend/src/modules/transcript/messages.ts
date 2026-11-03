import { AppError } from '../../utils/errors.js';

/** Mensagens do Módulo 9 em pt-BR, en e es, pelo `code` do erro (mesmo padrão dos módulos anteriores). */
type L = { 'pt-BR': string; en: string; es: string };
export const TRANSCRIPT_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  video_not_assembled: { 'pt-BR': 'O vídeo precisa estar pronto', en: 'The video must be ready', es: 'El video debe estar listo' },
  transcript_not_found: { 'pt-BR': 'Ainda não há transcrição deste vídeo', en: 'There is no transcript for this video yet', es: 'Aún no hay transcripción de este video' },
  transcript_outdated: { 'pt-BR': 'O vídeo mudou desde a transcrição. Transcreva de novo', en: 'The video changed since the transcript. Transcribe again', es: 'El video cambió desde la transcripción. Transcribe de nuevo' },
  invalid_range: { 'pt-BR': 'Trecho inválido', en: 'Invalid range', es: 'Tramo inválido' },
  overlapping_edits: { 'pt-BR': 'As edições se sobrepõem', en: 'The edits overlap', es: 'Las ediciones se superponen' },
  too_short: { 'pt-BR': 'O vídeo ficaria curto demais (mínimo de 1 segundo)', en: 'The video would be too short (at least 1 second)', es: 'El video quedaría demasiado corto (mínimo 1 segundo)' },
  edit_not_found: { 'pt-BR': 'Edição não encontrada', en: 'Edit not found', es: 'Edición no encontrada' },
  edit_not_ready: { 'pt-BR': 'A prévia ainda não está pronta', en: 'The preview is not ready yet', es: 'La vista previa aún no está lista' },
  already_applied: { 'pt-BR': 'Essa edição já foi aplicada', en: 'This edit was already applied', es: 'Esta edición ya se aplicó' },
  source_changed: { 'pt-BR': 'O vídeo mudou depois da prévia. Gere a prévia de novo', en: 'The video changed after the preview. Generate the preview again', es: 'El video cambió después de la vista previa. Genera la vista previa de nuevo' },
  confirmation_required: { 'pt-BR': 'Confirme para aplicar a nova versão', en: 'Confirm to apply the new version', es: 'Confirma para aplicar la nueva versión' },
  plan_empty: { 'pt-BR': 'Não entendi o pedido. Tente: "corte os 2 primeiros segundos", "troque oferta por promoção" ou "remova as pausas"', en: 'I did not understand. Try: "cut the first 2 seconds", "replace offer with deal" or "remove pauses"', es: 'No entendí. Prueba: "corta los primeros 2 segundos", "cambia oferta por promoción" o "quita las pausas"' },
  run_not_found: { 'pt-BR': 'Execução do agente não encontrada', en: 'Agent run not found', es: 'Ejecución del agente no encontrada' },
  stt_unavailable: { 'pt-BR': 'A transcrição não está disponível agora. Tente em alguns minutos', en: 'Transcription is not available right now. Try again in a few minutes', es: 'La transcripción no está disponible ahora. Inténtalo en unos minutos' },
  edit_failed: { 'pt-BR': 'Não foi possível gerar a prévia agora', en: 'Could not generate the preview right now', es: 'No se pudo generar la vista previa ahora' },
} satisfies Record<string, L>;
export type TranscriptMessageCode = keyof typeof TRANSCRIPT_MESSAGES;
export const trError = (status: number, code: TranscriptMessageCode, details?: unknown, as?: string) => new AppError(status, as ?? code, (TRANSCRIPT_MESSAGES[code] as L)['pt-BR'], details);
