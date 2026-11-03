import { env } from '../../config/env.js';

/**
 * Anti-spam (Módulo 7): domínios de e-mail descartável mais comuns. Lista curta e embutida (sem biblioteca nova nem
 * chamada de rede); amplie com EMAIL_BLOCKED_DOMAINS="a.com,b.net". Subdomínios também são bloqueados (x.mailinator.com).
 */
export const DISPOSABLE_DOMAINS = [
  '10minutemail.com', '10minutemail.net', '20minutemail.com', 'anonaddy.me', 'burnermail.io', 'byom.de', 'discard.email', 'dispostable.com', 'dropmail.me',
  'emailondeck.com', 'fakeinbox.com', 'getairmail.com', 'getnada.com', 'guerrillamail.biz', 'guerrillamail.com', 'guerrillamail.de', 'guerrillamail.info', 'guerrillamail.net',
  'guerrillamail.org', 'guerrillamailblock.com', 'harakirimail.com', 'inboxkitten.com', 'mail.tm', 'mail7.io', 'mailcatch.com', 'maildrop.cc', 'mailinator.com', 'mailinator.net',
  'mailnesia.com', 'mailpoof.com', 'mintemail.com', 'moakt.com', 'mohmal.com', 'mytemp.email', 'nada.email', 'sharklasers.com', 'spam4.me', 'spamgourmet.com', 'temp-mail.io',
  'temp-mail.org', 'tempail.com', 'tempmail.com', 'tempmail.dev', 'tempmail.net', 'tempmailo.com', 'tempr.email', 'throwawaymail.com', 'tmail.ws', 'tmpmail.net', 'tmpmail.org',
  'trashmail.com', 'trashmail.de', 'trashmail.net', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'emailfake.com', 'fakemail.net', 'luxusmail.org', 'minuteinbox.com',
];
const extra = () => env.EMAIL_BLOCKED_DOMAINS.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
export function isDisposable(email: string): boolean {
  const d = email.trim().toLowerCase().split('@')[1] ?? ''; if (!d) return true;
  return [...DISPOSABLE_DOMAINS, ...extra()].some((b) => d === b || d.endsWith('.' + b));
}
