/**
 * Módulo 11 — cliente de acessibilidade (`ff_accessibility`) e teleprompter (`ff_teleprompter`).
 * Regras de privacidade aplicadas NO APARELHO (o servidor confere de novo):
 * - câmera/microfone: `requestMedia` só chama `getUserMedia` com `userAction: true` (o toque explícito em "Permitir");
 * - a gravação fica LOCAL (`LocalRecordings`): nada sai do aparelho até `uploadRecording(..., { optIn: true })`;
 *   sem opt-in a função recusa sem tocar na rede; com opt-in envia `x-upload-opt-in: true` e Idempotency-Key;
 * - exportações de transcrição chegam assinadas; `assertSigned` recusa arquivo sem assinatura.
 */
export type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body?: string | Uint8Array | Blob }) => Promise<{ status: number; json(): Promise<any>; headers?: { get(n: string): string | null } }>;
export class ApiError extends Error { constructor(public status: number, public code: string) { super(code); } }
export class PrivacyRuleError extends Error {}
export interface MediaDevicesLike { getUserMedia(c: { video: boolean; audio: boolean }): Promise<unknown> }
/** Só pede câmera e microfone depois de um toque explícito da pessoa. */
export async function requestMedia(md: MediaDevicesLike | undefined, o: { userAction: boolean }) {
  if (o.userAction !== true) throw new PrivacyRuleError('explicit_user_action_required');
  if (!md || typeof md.getUserMedia !== 'function') throw new PrivacyRuleError('media_unavailable');
  return md.getUserMedia({ video: true, audio: true });
}
/** Gravações guardadas só neste aparelho (memória; o app pode persistir em IndexedDB). */
export class LocalRecordings {
  private items = new Map<string, { bytes: Uint8Array; mime: string; at: string }>();
  save(sessionId: string, bytes: Uint8Array, mime: 'video/webm' | 'video/mp4') { this.items.set(sessionId, { bytes, mime, at: new Date().toISOString() }); return { sessionId, size: bytes.length, storedOn: 'device' as const }; }
  get(sessionId: string) { return this.items.get(sessionId) ?? null; }
  discard(sessionId: string) { return this.items.delete(sessionId); }
  get size() { return this.items.size; }
}
const rnd = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
export class A11yClient {
  constructor(private o: { baseUrl: string; token: () => string; fetch: Fetch; newKey?: () => string }) {}
  private async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}, raw?: { bytes: Uint8Array; type: string }) {
    const headers: Record<string, string> = { authorization: `Bearer ${this.o.token()}`, 'content-type': raw ? raw.type : 'application/json', ...(method === 'POST' ? { 'idempotency-key': 'a11y-' + (this.o.newKey ?? rnd)() } : {}), ...extra };
    const r = await this.o.fetch(this.o.baseUrl + path, { method, headers, body: raw ? raw.bytes : body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({})); if (r.status >= 400) throw new ApiError(r.status, j?.code ?? 'error'); return j;
  }
  captions(projectId: string, locales: Array<'pt-BR' | 'en' | 'es'>, preset: 'padrao' | 'alto_contraste' | 'grande' | 'dislexia' = 'padrao') { if (!locales.length) return Promise.reject(new Error('no_locale')); return this.call('POST', `/projects/${projectId}/accessibility/captions`, { locales: [...new Set(locales)], style: { preset } }); }
  audioDescription(projectId: string) { return this.call('POST', `/projects/${projectId}/accessibility/audio-description`, {}); }
  /** A aprovação é sempre explícita (approve: true). */
  approve(assetId: string, descriptions?: Array<{ scene: number; text: string }>) { return this.call('POST', `/accessibility/assets/${assetId}/review`, { approve: true, ...(descriptions ? { descriptions } : {}) }); }
  async exportTranscript(projectId: string, format: 'srt' | 'vtt' | 'txt') { return assertSigned(await this.call('POST', `/projects/${projectId}/accessibility/transcript`, { format })); }
  startSession(script: string, settings: { wpm?: number; fontScale?: number; mirror?: boolean; countdownSec?: number } = {}, projectId?: string) { return this.call('POST', '/teleprompter/sessions', { script, settings, ...(projectId ? { projectId } : {}) }); }
  /** Envia a gravação local ao projeto — SÓ com opt-in explícito. */
  uploadRecording(sessionId: string, local: LocalRecordings, o: { optIn: boolean }) {
    if (o.optIn !== true) return Promise.reject(new PrivacyRuleError('upload_opt_in_required'));
    const rec = local.get(sessionId); if (!rec) return Promise.reject(new PrivacyRuleError('no_local_recording'));
    return this.call('POST', `/teleprompter/sessions/${sessionId}/recording`, undefined, { 'x-upload-opt-in': 'true' }, { bytes: rec.bytes, type: rec.mime });
  }
}
export function assertSigned<T extends { signature?: string | null }>(r: T): T { if (!r || typeof r.signature !== 'string' || !r.signature.startsWith('v1.')) throw new PrivacyRuleError('unsigned_export'); return r; }
