import { env } from '../../config/env.js';
import { logger } from '../../observability/logger.js';
import { decrypt, hmacHex } from '../../utils/crypto.js';

/** Hash de e-mail para logs e auditoria: HMAC-SHA256 com pepper do servidor (um SHA-256 puro de e-mail é reversível por dicionário). */
export const emailHash = (email: string) => hmacHex(env.IP_HASH_SALT + ':email', email.trim().toLowerCase());

/**
 * `toEnc` (Módulo 7): destinatário cifrado (AES-256-GCM) enquanto o job espera na fila/DLQ do Redis; `html`: corpo HTML
 * opcional; `logAs: 'hash'`: o log leva só o hash do destinatário (nem a versão mascarada).
 */
export interface EmailJob { to?: string; toEnc?: string; template: string; locale?: string; vars?: Record<string, string>; html?: string; logAs?: 'hash' }
export const T: Record<string, Record<string, { subject: string; body: (v: Record<string, string>) => string }>> = {
  es: { welcome: { subject: 'Bienvenido a NexusReel', body: (v) => `¡Hola ${v.name ?? ''}! Tu cuenta está lista. Crea tu primer video en minutos.` }, magic_link: { subject: 'Tu enlace de acceso', body: (v) => `Entra con este enlace (válido por 15 minutos): ${v.link}` }, export_ready: { subject: 'Tus datos están listos', body: () => 'El archivo de exportación de tus datos estará disponible por 7 días en la app.' }, deletion_scheduled: { subject: 'Eliminación de cuenta programada', body: (v) => `Tu cuenta se eliminará el ${v.date}. Puedes cancelarlo antes de esa fecha iniciando sesión.` }, waitlist_welcome: { subject: 'Estás en la lista de espera de NexusReel', body: (v) => `Tu posición: #${v.position}. Comparte tu enlace para subir posiciones: ${v.link}` } },
  'pt-BR': { waitlist_welcome: { subject: 'Você está na lista de espera do NexusReel', body: (v) => `Sua posição: #${v.position}. Compartilhe seu link para subir na fila: ${v.link}` }, welcome: { subject: 'Bem-vindo ao NexusReel', body: (v) => `Olá ${v.name ?? ''}! Sua conta foi criada. Crie seu primeiro vídeo em minutos.` }, magic_link: { subject: 'Seu link de acesso', body: (v) => `Entre com este link (válido por 15 minutos): ${v.link}` }, export_ready: { subject: 'Seus dados estão prontos', body: () => 'O arquivo da exportação dos seus dados está disponível por 7 dias no app.' }, deletion_scheduled: { subject: 'Exclusão da conta agendada', body: (v) => `Sua conta será excluída em ${v.date}. Você pode cancelar antes dessa data entrando novamente.` } },
  en: { waitlist_welcome: { subject: 'You are on the NexusReel waitlist', body: (v) => `Your position: #${v.position}. Share your link to move up: ${v.link}` }, welcome: { subject: 'Welcome to NexusReel', body: (v) => `Hi ${v.name ?? ''}! Your account is ready.` }, magic_link: { subject: 'Your sign-in link', body: (v) => `Sign in with this link (valid for 15 minutes): ${v.link}` }, export_ready: { subject: 'Your data is ready', body: () => 'Your data export is available for 7 days in the app.' }, deletion_scheduled: { subject: 'Account deletion scheduled', body: (v) => `Your account will be deleted on ${v.date}. Sign in before then to cancel.` } },
};
/** Resolve o catálogo por locale com fallback regional (es-MX → es) antes do padrão pt-BR. */
export const catalogFor = (locale?: string) => T[locale ?? 'pt-BR'] ?? T[(locale ?? '').split('-')[0] ?? ''] ?? T['pt-BR']!;
export function render(j: EmailJob): { subject: string; text: string } { if (j.template === 'raw') return { subject: String(j.vars?.subject ?? '').slice(0, 150), text: String(j.vars?.text ?? '') }; const loc = catalogFor(j.locale); const t = loc[j.template] ?? T['pt-BR']![j.template]; if (!t) throw new Error(`template de e-mail desconhecido: ${j.template}`); return { subject: t.subject, text: t.body(j.vars ?? {}) }; }
export async function sendEmail(job: EmailJob): Promise<void> {
  const to = job.toEnc ? decrypt(job.toEnc) : job.to ?? ''; const j = { ...job, to };
  if (!to) throw new Error('email sem destinatário');
  const { subject, text } = render(j);
  if (env.EMAIL_PROVIDER === 'resend') { const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: env.EMAIL_FROM, to: j.to, subject, text, ...(j.html ? { html: j.html } : {}) }) }); if (!r.ok) throw new Error(`Resend ${r.status}`); return; }
  if (env.EMAIL_PROVIDER === 'ses') throw new Error('Provedor SES: TODO — usar @aws-sdk/client-sesv2 (ver docs/DEPLOY.md)');
  logger.info({ ...(j.logAs === 'hash' ? { toHash: emailHash(j.to) } : { to: j.to.replace(/(.).+(@.*)/, '$1***$2') }), template: j.template, ...(j.logAs === 'hash' ? {} : { subject }) }, 'email (driver log)'); // nunca loga o corpo (pode conter link mágico)
}
