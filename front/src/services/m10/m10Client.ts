/**
 * Módulo 10 — cliente de insights (`ff_insights`), séries (`ff_series`), selo C2PA (`ff_seal`) e live (`ff_live`).
 * Regras do cliente (o servidor confere tudo de novo):
 * - POST com Idempotency-Key estável entre novas tentativas por falha de rede; 429 vira `RateLimited` (60/h estimativas, 5/h lives);
 * - a estimativa SEMPRE chega rotulada: `assertEstimate` recusa resposta sem `label: 'estimativa'` (não exibir número "solto");
 * - `createLive` não envia sem `aiLabelEnabled: true` e `merchantOptIn: true` (rótulo "IA" e opt-in obrigatórios);
 * - `verifyFile` envia os BYTES do MP4 (o servidor lê o manifest embutido); não existe verificação por URL externa;
 * - CTA de capítulo só https.
 */
export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string | Uint8Array }) => Promise<{ status: number; headers: { get(n: string): string | null }; json(): Promise<any> }>;
export class ApiError extends Error { constructor(public status: number, public code: string, public body: unknown) { super(code); } }
export class RateLimited extends ApiError { constructor(public retryAfterSec: number, body: unknown) { super(429, 'rate_limited', body); } }
export class ClientRuleError extends Error {}
export interface Options { baseUrl: string; token: () => string; fetch: Fetch; newKey?: () => string; sleep?: (ms: number) => Promise<void>; retries?: number }
const rnd = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
export const isHttpsUrl = (u: string) => { try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password; } catch { return false; } };
export function assertEstimate<T extends { label?: string }>(r: T): T { if (!r || r.label !== 'estimativa') throw new ClientRuleError('estimate_label_missing'); return r; }
export interface LiveInput { catalogId: string; title: string; locale?: 'pt-BR' | 'en' | 'es'; avatar: { source: 'preset' | 'custom'; preset?: 'ana' | 'leo' | 'bia'; voice?: 'female' | 'male' | 'neutral' }; aiLabelEnabled: boolean; merchantOptIn: boolean }
export class M10Client {
  constructor(private o: Options) {}
  private async call(method: string, path: string, body?: unknown, raw?: { bytes: Uint8Array; type: string }, auth = true): Promise<any> {
    const key = method === 'POST' && auth ? 'm10-' + (this.o.newKey ?? rnd)() : undefined; const tries = (this.o.retries ?? 2) + 1; let last: unknown;
    for (let t = 0; t < tries; t++) {
      try {
        const headers: Record<string, string> = { 'content-type': raw ? raw.type : 'application/json', ...(auth ? { authorization: `Bearer ${this.o.token()}` } : {}), ...(key ? { 'idempotency-key': key } : {}) };
        const r = await this.o.fetch(this.o.baseUrl + path, { method, headers, body: raw ? raw.bytes : body === undefined ? undefined : JSON.stringify(body) });
        if (r.status === 204) return null; const j = await r.json().catch(() => ({}));
        if (r.status === 429) throw new RateLimited(Number(r.headers.get('retry-after') ?? 60), j);
        if (r.status >= 400) throw new ApiError(r.status, j?.code ?? 'error', j);
        return j;
      } catch (e) { if (e instanceof ApiError) throw e; last = e; if (t < tries - 1) await (this.o.sleep ?? ((ms) => new Promise((ok) => setTimeout(ok, ms))))(300 * 2 ** t); }
    }
    throw last;
  }
  async score(projectId: string, locale = 'pt-BR') { return assertEstimate(await this.call('POST', `/projects/${projectId}/insights?locale=${encodeURIComponent(locale)}`)); }
  createSeries(title: string, template: 'mininovela' | 'tutorial' | 'lancamento' | 'livre' = 'mininovela') { return this.call('POST', '/series', { title: title.trim().slice(0, 120), template }); }
  addEpisode(seriesId: string, projectId: string, cta?: { url?: string; label?: string }) {
    if (cta?.url && !isHttpsUrl(cta.url)) return Promise.reject(new ClientRuleError('invalid_cta_url'));
    return this.call('POST', `/series/${seriesId}/episodes`, { projectId, ...(cta?.url ? { ctaUrl: cta.url } : {}), ...(cta?.label ? { ctaLabel: cta.label.slice(0, 60) } : {}) });
  }
  linkEpisodes(seriesId: string, episodeIds: string[]) { if (new Set(episodeIds).size !== episodeIds.length) return Promise.reject(new ClientRuleError('invalid_order')); return this.call('PUT', `/series/${seriesId}/episodes/order`, { episodeIds }); }
  applySeal(projectId: string) { return this.call('POST', `/projects/${projectId}/seal`); }
  seal(projectId: string) { return this.call('GET', `/projects/${projectId}/seal`); }
  /** Verifica um MP4 recebido: manda os bytes; o manifest C2PA é lido de dentro do arquivo no servidor. */
  verifyFile(bytes: Uint8Array) { if (!(bytes instanceof Uint8Array) || bytes.length < 16) return Promise.reject(new ClientRuleError('not_a_video')); return this.call('POST', '/seal/verify', undefined, { bytes, type: 'video/mp4' }, false); }
  createLive(b: LiveInput) {
    if (b.aiLabelEnabled !== true) return Promise.reject(new ClientRuleError('ai_label_required'));
    if (b.merchantOptIn !== true) return Promise.reject(new ClientRuleError('merchant_opt_in_required'));
    return this.call('POST', '/live/sessions', b);
  }
  startLive(id: string) { return this.call('POST', `/live/sessions/${id}/start`); }
  stopLive(id: string) { return this.call('POST', `/live/sessions/${id}/stop`); }
}
