/** Rate limit por chave (janela deslizante). No client: throttle de ações sensíveis. No backend: use Redis (INCR+EXPIRE) com a mesma assinatura. */
export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private now: () => number = Date.now) {}
  /** true = permitido (e conta); false = bloqueado. */
  take(key: string, max: number, windowMs: number): boolean { const t = this.now(); const a = (this.hits.get(key) ?? []).filter((x) => t - x < windowMs); if (a.length >= max) { this.hits.set(key, a); return false; } a.push(t); this.hits.set(key, a); return true; }
  retryAfterMs(key: string, windowMs: number): number { const a = this.hits.get(key) ?? []; return a.length ? Math.max(0, windowMs - (this.now() - a[0])) : 0; }
}
export const LIMITS = { export: { max: 3, windowMs: 600_000 }, payout: { max: 3, windowMs: 600_000 }, generationPerDay: { max: 15, windowMs: 86_400_000 }, publish: { max: 30, windowMs: 60_000 } } as const;
// TODO: captcha no cadastro (hCaptcha/Turnstile), verificação de e-mail e limite por IP no backend; verificação etária (menor de 13 bloqueia; 13–17 exige consentimento do responsável).
