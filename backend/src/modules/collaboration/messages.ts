import { AppError } from '../../utils/errors.js';

/** Mensagens do Módulo 8 em pt-BR, en e es, pelo `code` do erro (mesmo padrão dos módulos anteriores). */
type L = { 'pt-BR': string; en: string; es: string };
export const COLLAB_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  forbidden_role: { 'pt-BR': 'Seu papel neste projeto não permite essa ação', en: 'Your role in this project does not allow this action', es: 'Tu rol en este proyecto no permite esta acción' },
  invite_invalid: { 'pt-BR': 'Este convite não existe, já foi usado ou expirou', en: 'This invite does not exist, was already used or has expired', es: 'Esta invitación no existe, ya se usó o expiró' },
  invite_other_email: { 'pt-BR': 'Este convite foi enviado para outro e-mail', en: 'This invite was sent to a different email', es: 'Esta invitación se envió a otro correo' },
  invite_self: { 'pt-BR': 'Você já é o dono deste projeto', en: 'You already own this project', es: 'Ya eres el dueño de este proyecto' },
  already_member: { 'pt-BR': 'Essa pessoa já colabora neste projeto', en: 'This person already collaborates on this project', es: 'Esta persona ya colabora en este proyecto' },
  too_many_collaborators: { 'pt-BR': 'Limite de colaboradores do projeto atingido', en: 'Project collaborator limit reached', es: 'Se alcanzó el límite de colaboradores del proyecto' },
  disposable_domain: { 'pt-BR': 'Não enviamos convites para e-mails temporários', en: 'We do not send invites to temporary emails', es: 'No enviamos invitaciones a correos temporales' },
  collaborator_not_found: { 'pt-BR': 'Colaborador não encontrado', en: 'Collaborator not found', es: 'Colaborador no encontrado' },
  comment_not_found: { 'pt-BR': 'Comentário não encontrado', en: 'Comment not found', es: 'Comentario no encontrado' },
  track_not_found: { 'pt-BR': 'Trilha não encontrada', en: 'Track not found', es: 'Pista no encontrada' },
  clip_not_found: { 'pt-BR': 'Trecho não encontrado', en: 'Clip not found', es: 'Fragmento no encontrado' },
  track_locked: { 'pt-BR': 'Essa trilha está travada', en: 'This track is locked', es: 'Esta pista está bloqueada' },
  invalid_op: { 'pt-BR': 'Alteração inválida', en: 'Invalid change', es: 'Cambio inválido' },
  timeline_too_long: { 'pt-BR': 'O vídeo passaria de 120 segundos', en: 'The video would exceed 120 seconds', es: 'El video superaría los 120 segundos' },
  conflict_critical: { 'pt-BR': 'Outra pessoa mudou isso ao mesmo tempo. Você pode recarregar ou salvar a sua versão como cópia', en: 'Someone else changed this at the same time. You can reload or save your version as a copy', es: 'Otra persona cambió esto al mismo tiempo. Puedes recargar o guardar tu versión como copia' },
  snapshot_not_found: { 'pt-BR': 'Versão não encontrada', en: 'Version not found', es: 'Versión no encontrada' },
} satisfies Record<string, L>;
export type CollabMessageCode = keyof typeof COLLAB_MESSAGES;
export const collabError = (status: number, code: CollabMessageCode, details?: unknown, as?: string) => new AppError(status, as ?? code, (COLLAB_MESSAGES[code] as L)['pt-BR'], details);
