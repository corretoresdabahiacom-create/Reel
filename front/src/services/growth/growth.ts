import type { Http } from './http';
/** Helpers de paywall contextual, indicação e compartilhamento. Falha => resultado neutro (nunca quebra a tela). */
export type PaywallDecision = { show: boolean; reason?: string; offer?: Record<string, unknown>; priceKey?: string };
export const paywall = {
  async evaluate(http: Http, trigger: string, peek = false): Promise<PaywallDecision> { const r = await http('POST', '/api/v1/monetization/paywall/evaluate', { trigger, peek }); return r?.status === 200 ? { show: !!r.body?.show, reason: r.body?.reason, offer: r.body?.offer, priceKey: r.body?.priceKey } : { show: false, reason: 'unavailable' }; },
};
export const referral = {
  me: async (http: Http) => (await http('GET', '/api/v1/referrals/me'))?.body ?? null,
  /** Link de convite: o código vai na URL; o clique é registrado ao abrir o app (deep link). */
  link(base: string, code: string, channel = 'share') { return `${base.replace(/\/$/, '')}/ref/${encodeURIComponent(code)}?utm_source=referral&utm_medium=${encodeURIComponent(channel)}`; },
  click: (http: Http, code: string, deviceId: string) => http('POST', '/api/v1/referrals/click', { code, deviceId }),
  convert: (http: Http, code: string, clickId?: string) => http('POST', '/api/v1/referrals/convert', { code, clickId }),
};
export const share = {
  info: async (http: Http, projectId: string) => (await http('GET', `/api/v1/growth/share/${projectId}`))?.body ?? null,
  /** Texto de compartilhamento com UTM para atribuição. */
  text(url: string, caption: string, channel: string) { const u = new URL(url); u.searchParams.set('utm_source', 'share'); u.searchParams.set('utm_medium', channel); return `${caption} ${u.toString()}`.trim(); },
};
export const waitlist = {
  join: (http: Http, email: string, ref?: string, utm: Record<string, string> = {}) => http('POST', '/api/v1/waitlist', { email, ref, utm: Object.keys(utm).length ? utm : undefined }),
  status: async (http: Http, code: string) => (await http('GET', `/api/v1/waitlist/${encodeURIComponent(code)}`))?.body ?? null,
};
/** Captura UTM da URL de entrada e envia o toque de atribuição (uma vez por sessão). */
export function utmFromUrl(search: string): Record<string, string> { const p = new URLSearchParams(search); const o: Record<string, string> = {}; for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) { const v = p.get(k); if (v) o[k] = v.slice(0, 100); } return o; }
export const attributionTouch = (http: Http, utm: Record<string, string>, anonId: string) => Object.keys(utm).length ? http('POST', '/api/v1/attribution/touch', { ...utm, anonId }) : Promise.resolve(null);
