import { AppError } from '../../utils/errors.js';

/**
 * Mensagens do Módulo 1 em pt-BR, en e es, indexadas pelo `code` do erro. A API responde com o texto em pt-BR (padrão do
 * backend) e o `code`; o app traduz pelo `code` com este mesmo catálogo (`GET /audio/config` → `messages`).
 */
type L = { 'pt-BR': string; en: string; es: string };
export const AUDIO_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  video_not_assembled: { 'pt-BR': 'Monte o vídeo final antes de editar o áudio', en: 'Assemble the final video before editing audio', es: 'Monta el video final antes de editar el audio' },
  track_not_available: { 'pt-BR': 'Faixa não encontrada ou não licenciada para a sua região', en: 'Track not found or not licensed in your region', es: 'Pista no encontrada o sin licencia para tu región' },
  music_track_missing: { 'pt-BR': 'A faixa escolhida não existe mais', en: 'The selected track no longer exists', es: 'La pista elegida ya no existe' },
  voice_model_required: { 'pt-BR': 'Escolha a voz clonada', en: 'Choose the cloned voice', es: 'Elige la voz clonada' },
  audio_version_not_usable: { 'pt-BR': 'Esta versão não está pronta ou é de outra montagem do vídeo', en: 'This version is not ready or belongs to another cut of the video', es: 'Esta versión no está lista o es de otro montaje del video' },
  external_provider_consent_required: { 'pt-BR': 'Para usar este recurso, autorize o envio do seu áudio ao provedor externo', en: 'To use this feature, allow your audio to be sent to the external provider', es: 'Para usar esta función, autoriza el envío de tu audio al proveedor externo' },
  music_unavailable: { 'pt-BR': 'A geração de música está indisponível agora. Escolha uma faixa da biblioteca ou tente em alguns minutos', en: 'Music generation is unavailable right now. Pick a library track or try again in a few minutes', es: 'La generación de música no está disponible ahora. Elige una pista de la biblioteca o inténtalo en unos minutos' },
  voice_unavailable: { 'pt-BR': 'A voz clonada está indisponível agora. Use o áudio original ou tente em alguns minutos', en: 'The cloned voice is unavailable right now. Use the original audio or try again in a few minutes', es: 'La voz clonada no está disponible ahora. Usa el audio original o inténtalo en unos minutos' },
  consent_not_found: { 'pt-BR': 'Consentimento de voz não encontrado', en: 'Voice consent not found', es: 'Consentimiento de voz no encontrado' },
  consent_revoked: { 'pt-BR': 'Este consentimento foi revogado. Peça um novo', en: 'This consent was revoked. Request a new one', es: 'Este consentimiento fue revocado. Solicita uno nuevo' },
  sample_already_uploaded: { 'pt-BR': 'Este consentimento já tem uma amostra. Para gravar outra, peça um novo consentimento', en: 'This consent already has a sample. Request a new consent to record another', es: 'Este consentimiento ya tiene una muestra. Solicita uno nuevo para grabar otra' },
  sample_too_large: { 'pt-BR': 'A amostra passou do tamanho máximo', en: 'The sample is over the size limit', es: 'La muestra supera el tamaño máximo' },
  sample_invalid: { 'pt-BR': 'Arquivo de áudio inválido', en: 'Invalid audio file', es: 'Archivo de audio no válido' },
  sample_missing: { 'pt-BR': 'Envie a amostra de voz antes de verificar', en: 'Upload the voice sample before verifying', es: 'Envía la muestra de voz antes de verificar' },
  voice_sample_rejected: { 'pt-BR': 'A amostra não passou na verificação. Grave de novo, num lugar silencioso, lendo a frase inteira', en: 'The sample did not pass verification. Record again in a quiet place, reading the whole sentence', es: 'La muestra no pasó la verificación. Graba de nuevo en un lugar silencioso, leyendo la frase completa' },
  voice_consent_required: { 'pt-BR': 'A voz clonada exige um consentimento verificado e ativo', en: 'A cloned voice requires a verified, active consent', es: 'La voz clonada requiere un consentimiento verificado y activo' },
  consent_phrase: { 'pt-BR': 'Eu autorizo o NexusReel a criar uma voz sintética a partir da minha voz, só para os meus vídeos. Código {code}.', en: 'I authorize NexusReel to create a synthetic voice from my voice, only for my videos. Code {code}.', es: 'Autorizo a NexusReel a crear una voz sintética a partir de mi voz, solo para mis videos. Código {code}.' },
  // Estúdio de voz (ff_voice_studio)
  recording_invalid: { 'pt-BR': 'Não deu para ler este áudio. Grave de novo', en: 'This audio could not be read. Please record again', es: 'No se pudo leer este audio. Graba de nuevo' },
  recording_too_large: { 'pt-BR': 'A gravação passou do tamanho máximo', en: 'The recording is over the size limit', es: 'La grabación supera el tamaño máximo' },
  recording_too_long: { 'pt-BR': 'A gravação pode ter no máximo {max} segundos', en: 'Recordings can be at most {max} seconds long', es: 'La grabación puede tener como máximo {max} segundos' },
  recording_too_short: { 'pt-BR': 'Gravação curta demais: fale por pelo menos 1 segundo', en: 'Recording too short: speak for at least 1 second', es: 'Grabación demasiado corta: habla al menos 1 segundo' },
  recording_no_voice: { 'pt-BR': 'Não ouvimos sua voz na gravação. Verifique o microfone e grave de novo', en: "We couldn't hear your voice in the recording. Check the microphone and record again", es: 'No escuchamos tu voz en la grabación. Revisa el micrófono y graba de nuevo' },
  recording_not_found: { 'pt-BR': 'Gravação não encontrada', en: 'Recording not found', es: 'Grabación no encontrada' },
  music_invalid: { 'pt-BR': 'Arquivo de música inválido. Envie MP3, M4A, WAV ou OGG', en: 'Invalid music file. Upload MP3, M4A, WAV or OGG', es: 'Archivo de música no válido. Envía MP3, M4A, WAV u OGG' },
  music_too_large: { 'pt-BR': 'A música passou do tamanho máximo', en: 'The music file is over the size limit', es: 'La música supera el tamaño máximo' },
  music_rights_required: { 'pt-BR': 'Confirme que você tem o direito de usar esta música', en: 'Confirm you have the right to use this music', es: 'Confirma que tienes derecho a usar esta música' },
  tts_text_too_long: { 'pt-BR': 'Texto longo demais para a prévia', en: 'Text too long for the preview', es: 'Texto demasiado largo para la vista previa' },
  tts_unavailable: { 'pt-BR': 'A voz está indisponível agora. Tente em alguns minutos', en: 'The voice is unavailable right now. Try again in a few minutes', es: 'La voz no está disponible ahora. Inténtalo en unos minutos' },
  audio_format_unsupported: { 'pt-BR': 'Envie um arquivo de áudio (webm, ogg, mp4, m4a, mp3 ou wav)', en: 'Upload an audio file (webm, ogg, mp4, m4a, mp3 or wav)', es: 'Envía un archivo de audio (webm, ogg, mp4, m4a, mp3 o wav)' },
  voice_not_found: { 'pt-BR': 'Voz não encontrada ou não instalada neste servidor', en: 'Voice not found or not installed on this server', es: 'Voz no encontrada o no instalada en este servidor' },
} satisfies Record<string, L>;
export type AudioMessageCode = keyof typeof AUDIO_MESSAGES;
export const msg = (code: AudioMessageCode, locale = 'pt-BR'): string => { const m: L = AUDIO_MESSAGES[code]; return m[(locale.startsWith('en') ? 'en' : locale.startsWith('es') ? 'es' : 'pt-BR')]; };
/** Erro do Módulo 1 com mensagem do catálogo. O `code` HTTP é o `code` do catálogo, salvo `as` (ex.: 404 genérico). */
export const audioError = (status: number, code: AudioMessageCode, details?: unknown, as?: string) => new AppError(status, as ?? code, msg(code), details);
