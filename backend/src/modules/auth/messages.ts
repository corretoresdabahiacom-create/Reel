import { AppError } from '../../utils/errors.js';

/** P0-1 etapa 3 — mensagens da sessão em cookie, em pt-BR, en e es (idioma pelo Accept-Language). */
type L = { 'pt-BR': string; en: string; es: string };
export const AUTH_MESSAGES = {
  session_missing: { 'pt-BR': 'Sessão ausente ou expirada. Entre de novo', en: 'Session missing or expired. Please sign in again', es: 'Sesión ausente o expirada. Inicia sesión de nuevo' },
  csrf_failed: { 'pt-BR': 'Verificação de segurança da sessão falhou. Entre de novo', en: 'Session security check failed. Please sign in again', es: 'La verificación de seguridad de la sesión falló. Inicia sesión de nuevo' },
  firebase_disabled: { 'pt-BR': 'Login com Firebase não está ativo nesta instalação', en: 'Firebase sign-in is not enabled on this installation', es: 'El inicio de sesión con Firebase no está activo en esta instalación' },
  firebase_invalid_token: { 'pt-BR': 'Não foi possível confirmar seu login. Entre de novo', en: 'We could not confirm your sign-in. Please sign in again', es: 'No pudimos confirmar tu inicio de sesión. Inicia sesión de nuevo' },
  firebase_email_unverified: { 'pt-BR': 'Confirme seu e-mail pelo link que enviamos e tente de novo', en: 'Confirm your email using the link we sent and try again', es: 'Confirma tu correo con el enlace que enviamos e inténtalo de nuevo' },
} satisfies Record<string, L>;
export type AuthMessageCode = keyof typeof AUTH_MESSAGES;
const pick = (lang?: string): keyof L => (lang?.toLowerCase().startsWith('en') ? 'en' : lang?.toLowerCase().startsWith('es') ? 'es' : 'pt-BR');
export const authError = (status: number, code: AuthMessageCode, lang?: string, as?: string) => new AppError(status, as ?? code, AUTH_MESSAGES[code][pick(lang)]);
