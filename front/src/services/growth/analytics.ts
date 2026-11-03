import type { Http } from './http';
/** Cliente de analytics: fila em memória, envio em lote (tamanho/tempo), nunca bloqueia, descarta PII óbvia, respeita consentimento. */
const PII_KEYS = /^(email|e-?mail|cpf|phone|telefone|password|senha|token|name|nome)$/i; const PII_VAL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
export function sanitizeProps(p: Record<string, unknown> = {}): Record<string, unknown> {
  const o: Record<string, unknown> = {}; for (const [k, v] of Object.entries(p)) { if (PII_KEYS.test(k)) continue; if (typeof v === 'string' && PII_VAL.test(v)) continue; o[k] = v; } return o;
}
export class AnalyticsClient {
  private q: Array<{ name: string; props: Record<string, unknown>; eventId: string }> = []; private timer: ReturnType<typeof setTimeout> | null = null; private seq = 0; consent = false;
  constructor(private http: Http, private o: { anonId: string; sessionId: string; batchSize?: number; flushMs?: number; maxQueue?: number } ) {}
  setConsent(v: boolean) { this.consent = v; if (!v) { this.q = []; if (this.timer) clearTimeout(this.timer); this.timer = null; } }
  track(name: string, props: Record<string, unknown> = {}): void {
    if (!this.consent) return; // sem consentimento de analytics: nada sai do dispositivo
    this.q.push({ name, props: sanitizeProps(props), eventId: `${this.o.sessionId}-${++this.seq}` }); const max = this.o.maxQueue ?? 200; if (this.q.length > max) this.q.splice(0, this.q.length - max);
    if (this.q.length >= (this.o.batchSize ?? 20)) void this.flush(); else if (!this.timer) { this.timer = setTimeout(() => void this.flush(), this.o.flushMs ?? 5000); (this.timer as any).unref?.(); }
  }
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; } if (!this.q.length) return; const batch = this.q.splice(0, 50);
    const r = await this.http('POST', '/api/v1/analytics/events', { events: batch, anonId: this.o.anonId, sessionId: this.o.sessionId });
    if (!r || r.status >= 500) this.q.unshift(...batch); // volta p/ a fila (limitada por maxQueue); 4xx = descarta (payload inválido)
  }
  get pending() { return this.q.length; }
}
