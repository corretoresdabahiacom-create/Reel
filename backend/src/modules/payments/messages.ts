import { AppError } from '../../utils/errors.js';
import { env } from '../../config/env.js';

/** Instalação gratuita (APP_PROFILE=free, PAYMENTS_MODE=off): nada é cobrado nem simulado. Idioma pelo Accept-Language. */
type L = { 'pt-BR': string; en: string; es: string };
export const PAYMENT_MESSAGES = {
  payments_disabled: { 'pt-BR': 'Pagamentos desativados nesta instalação gratuita', en: 'Payments are disabled on this free installation', es: 'Los pagos están desactivados en esta instalación gratuita' },
} satisfies Record<string, L>;
const pick = (lang?: string): keyof L => (lang?.toLowerCase().startsWith('en') ? 'en' : lang?.toLowerCase().startsWith('es') ? 'es' : 'pt-BR');
export const paymentsEnabled = (): boolean => env.PAYMENTS_MODE !== 'off';
/** preHandler: checkout, Pix, saques e webhooks de pagamento respondem 503 quando os pagamentos estão desligados. */
export async function requirePayments(req: { headers: Record<string, unknown> }): Promise<void> {
  if (!paymentsEnabled()) throw new AppError(503, 'payments_disabled', PAYMENT_MESSAGES.payments_disabled[pick(String(req.headers['accept-language'] ?? ''))]);
}
