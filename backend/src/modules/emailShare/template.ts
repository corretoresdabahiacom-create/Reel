import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Templates HTML do Módulo 7 (`templates/emails/share.html` e `share-page.html`). Mini-renderizador sem biblioteca:
 * `{{var}}` SEMPRE escapado (nada do usuário vira HTML) e `{{#var}}…{{/var}}` só aparece se `var` tiver valor.
 */
const cache = new Map<string, string>();
const load = (name: string) => { let t = cache.get(name); if (!t) { t = readFileSync(join(process.cwd(), 'templates', 'emails', name), 'utf8'); cache.set(name, t); } return t; };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"'`=]/g, (c) => `&#${c.charCodeAt(0)};`);
export function renderTemplate(name: string, vars: Record<string, string | boolean | undefined>): string {
  let t = load(name);
  t = t.replace(/\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_m, k: string, inner: string) => (vars[k] ? inner : ''));
  return t.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => esc(vars[k] ?? ''));
}
type Loc = 'pt-BR' | 'en' | 'es';
const S: Record<Loc, Record<string, string>> = {
  'pt-BR': { subject: '{name} enviou um vídeo para você', subjectSelf: 'Cópia do seu envio: {file}', heading: '{name} enviou um vídeo para você', headingSelf: 'Cópia do que você enviou',
    file: 'Arquivo', button: 'Baixar o vídeo', buttonZip: 'Baixar o ZIP', expires: 'O link vale até {date}.', password: 'O arquivo tem senha: peça a quem enviou.',
    footer: 'Você recebeu este e-mail porque alguém o enviou pelo NexusReel. Não responda; se não esperava, ignore. O link sozinho:', title: 'Download · NexusReel', passwordLabel: 'Senha', expired: 'expira em {date}',
    text: '{heading}\n\n{message}{file}: {fileName}\n{link}\n\n{expires}{password}' },
  en: { subject: '{name} sent you a video', subjectSelf: 'Copy of your share: {file}', heading: '{name} sent you a video', headingSelf: 'Copy of what you sent',
    file: 'File', button: 'Download the video', buttonZip: 'Download the ZIP', expires: 'The link is valid until {date}.', password: 'The file has a password: ask the sender.',
    footer: 'You got this email because someone sent it via NexusReel. Do not reply; if you did not expect it, ignore it. The plain link:', title: 'Download · NexusReel', passwordLabel: 'Password', expired: 'expires {date}',
    text: '{heading}\n\n{message}{file}: {fileName}\n{link}\n\n{expires}{password}' },
  es: { subject: '{name} te envió un video', subjectSelf: 'Copia de tu envío: {file}', heading: '{name} te envió un video', headingSelf: 'Copia de lo que enviaste',
    file: 'Archivo', button: 'Descargar el video', buttonZip: 'Descargar el ZIP', expires: 'El enlace vale hasta el {date}.', password: 'El archivo tiene contraseña: pídela a quien lo envió.',
    footer: 'Recibiste este correo porque alguien lo envió por NexusReel. No respondas; si no lo esperabas, ignóralo. El enlace solo:', title: 'Descarga · NexusReel', passwordLabel: 'Contraseña', expired: 'vence el {date}',
    text: '{heading}\n\n{message}{file}: {fileName}\n{link}\n\n{expires}{password}' },
};
export const loc = (l: string): Loc => (l?.startsWith('en') ? 'en' : l?.startsWith('es') ? 'es' : 'pt-BR');
export const t = (l: string, k: string, v: Record<string, string> = {}) => (S[loc(l)][k] ?? k).replace(/\{(\w+)\}/g, (_m, x: string) => v[x] ?? '');
export const fmtDate = (d: Date, l: string, tz?: string | null) => { try { return new Intl.DateTimeFormat(loc(l), { dateStyle: 'long', timeStyle: 'short', timeZone: tz || 'America/Sao_Paulo' }).format(d); } catch { return new Intl.DateTimeFormat(loc(l), { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(d); } };
