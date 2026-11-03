import { AppError, notFound } from '../../utils/errors.js';
import { asSystem } from '../../db/pool.js';
import { allFlags, isEnabled } from '../flags.service.js';

/** Módulo 10 — flags (todas desligadas por padrão) e mensagens em pt-BR, en e es pelo `code` do erro. */
export type M10Flag = 'ff_insights' | 'ff_series' | 'ff_seal' | 'ff_live';
export async function m10FlagOn(key: M10Flag, userId: string): Promise<boolean> {
  const u = await asSystem(async (db) => (await db.query<{ region: string; plan: string }>('SELECT region, plan FROM users WHERE id=$1', [userId])).rows[0]);
  return !!u && isEnabled(key, { userId, ...u });
}
/** Rotas públicas (sem usuário): a flag precisa estar ligada para alguém (enabled e rollout > 0); senão 404. */
export async function requireM10Public(key: M10Flag): Promise<void> { const f = (await allFlags()).find((x) => x.key === key); if (!f || !f.enabled || f.rollout_percent <= 0) throw notFound(); }
/** Flag desligada = 404 (o app fica idêntico ao de antes). */
export async function requireM10(key: M10Flag, userId: string): Promise<void> { if (!(await m10FlagOn(key, userId))) throw notFound(); }

type L = { 'pt-BR': string; en: string; es: string };
export const M10_MESSAGES = {
  project_not_found: { 'pt-BR': 'Projeto não encontrado', en: 'Project not found', es: 'Proyecto no encontrado' },
  video_not_assembled: { 'pt-BR': 'O vídeo precisa estar pronto', en: 'The video must be ready', es: 'El video debe estar listo' },
  series_not_found: { 'pt-BR': 'Série não encontrada', en: 'Series not found', es: 'Serie no encontrada' },
  episode_not_found: { 'pt-BR': 'Episódio não encontrado', en: 'Episode not found', es: 'Episodio no encontrado' },
  episode_exists: { 'pt-BR': 'Esse vídeo já é um episódio desta série', en: 'This video is already an episode of this series', es: 'Este video ya es un episodio de esta serie' },
  too_many_episodes: { 'pt-BR': 'Limite de 50 episódios por série', en: 'Limit of 50 episodes per series', es: 'Límite de 50 episodios por serie' },
  invalid_order: { 'pt-BR': 'A nova ordem precisa listar todos os episódios uma vez', en: 'The new order must list every episode once', es: 'El nuevo orden debe listar cada episodio una vez' },
  invalid_cta_url: { 'pt-BR': 'O link do CTA precisa começar com https://', en: 'The CTA link must start with https://', es: 'El enlace del CTA debe empezar con https://' },
  seal_not_configured: { 'pt-BR': 'O selo de autenticidade ainda não está configurado neste ambiente', en: 'The authenticity seal is not configured in this environment yet', es: 'El sello de autenticidad aún no está configurado en este entorno' },
  seal_not_found: { 'pt-BR': 'Selo não encontrado', en: 'Seal not found', es: 'Sello no encontrado' },
  seal_failed: { 'pt-BR': 'Não foi possível aplicar o selo agora', en: 'Could not apply the seal right now', es: 'No se pudo aplicar el sello ahora' },
  external_url_not_allowed: { 'pt-BR': 'Verifique um vídeo do NexusReel ou envie o arquivo', en: 'Verify a NexusReel video or upload the file', es: 'Verifica un video de NexusReel o sube el archivo' },
  not_a_video: { 'pt-BR': 'Envie um arquivo MP4', en: 'Upload an MP4 file', es: 'Sube un archivo MP4' },
  catalog_not_found: { 'pt-BR': 'Catálogo não encontrado', en: 'Catalog not found', es: 'Catálogo no encontrado' },
  catalog_empty: { 'pt-BR': 'O catálogo precisa ter ao menos um produto', en: 'The catalog needs at least one product', es: 'El catálogo necesita al menos un producto' },
  b2b_plan_required: { 'pt-BR': 'A live com avatar é do plano Business', en: 'Live with an avatar is part of the Business plan', es: 'El directo con avatar es del plan Business' },
  merchant_opt_in_required: { 'pt-BR': 'Confirme que você quer usar um apresentador virtual de IA', en: 'Confirm you want to use an AI virtual presenter', es: 'Confirma que quieres usar un presentador virtual de IA' },
  ai_label_required: { 'pt-BR': 'O rótulo "IA" é obrigatório na live com avatar', en: 'The "AI" label is required on avatar lives', es: 'La etiqueta "IA" es obligatoria en el directo con avatar' },
  consent_required: { 'pt-BR': 'Para usar um avatar com a sua imagem, aceite o consentimento de avatar ao vivo', en: 'To use an avatar with your likeness, accept the live avatar consent', es: 'Para usar un avatar con tu imagen, acepta el consentimiento de avatar en vivo' },
  live_not_found: { 'pt-BR': 'Live não encontrada', en: 'Live not found', es: 'Directo no encontrado' },
  live_invalid_state: { 'pt-BR': 'Essa ação não vale para a live no estado atual', en: 'This action does not apply to the live in its current state', es: 'Esta acción no aplica al directo en su estado actual' },
  too_many_lives: { 'pt-BR': 'Limite de 3 lives ao mesmo tempo', en: 'Limit of 3 lives at the same time', es: 'Límite de 3 directos a la vez' },
} satisfies Record<string, L>;
export type M10Code = keyof typeof M10_MESSAGES;
export const m10Error = (status: number, code: M10Code, details?: unknown, as?: string) => new AppError(status, as ?? code, (M10_MESSAGES[code] as L)['pt-BR'], details);
