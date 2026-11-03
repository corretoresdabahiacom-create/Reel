/** Resiliência padronizada: retry com backoff exponencial + jitter e circuit breaker. Usado por http.ts (integrações) e chamadas de IA. */
export interface RetryOptions { retries?: number; baseDelayMs?: number; maxDelayMs?: number; jitter?: boolean; shouldRetry?: (e: unknown, attempt: number) => boolean; sleep?: (ms: number) => Promise<void>; onRetry?: (e: unknown, attempt: number, delayMs: number) => void }
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, o: RetryOptions = {}): Promise<T> {
  const { retries = 3, baseDelayMs = 500, maxDelayMs = 15_000, jitter = true, shouldRetry = () => true, sleep = defaultSleep } = o;
  let last: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(attempt); } catch (e) {
      last = e;
      if (attempt === retries || !shouldRetry(e, attempt)) throw e;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt) * (jitter ? 0.5 + Math.random() / 2 : 1);
      o.onRetry?.(e, attempt, delay); await sleep(delay);
    }
  }
  throw last;
}
export class CircuitOpenError extends Error { constructor(public name_: string, public retryAfterMs: number) { super(`Circuito aberto: ${name_}. Tente em ${Math.ceil(retryAfterMs / 1000)}s.`); this.name = 'CircuitOpenError'; } }
export type BreakerState = 'closed' | 'open' | 'half_open';
/** Abre depois de `failureThreshold` falhas dentro de `windowMs`; fica aberto `openMs`; depois deixa passar 1 tentativa (half-open). */
export class CircuitBreaker {
  private failures: number[] = []; private openedAt = 0; private state_: BreakerState = 'closed';
  constructor(public readonly name: string, private o: { failureThreshold?: number; windowMs?: number; openMs?: number; now?: () => number } = {}) {}
  private now() { return (this.o.now ?? Date.now)(); }
  get state(): BreakerState { if (this.state_ === 'open' && this.now() - this.openedAt >= (this.o.openMs ?? 20_000)) this.state_ = 'half_open'; return this.state_; }
  async exec<T>(fn: () => Promise<T>): Promise<T> {
    const st = this.state;
    if (st === 'open') throw new CircuitOpenError(this.name, (this.o.openMs ?? 20_000) - (this.now() - this.openedAt));
    try { const r = await fn(); this.failures = []; this.state_ = 'closed'; return r; }
    catch (e) {
      const t = this.now(); this.failures = this.failures.filter((x) => t - x < (this.o.windowMs ?? 60_000)); this.failures.push(t);
      if (st === 'half_open' || this.failures.length >= (this.o.failureThreshold ?? 3)) { this.state_ = 'open'; this.openedAt = t; }
      throw e;
    }
  }
}
const breakers = new Map<string, CircuitBreaker>();
export const breakerFor = (name: string): CircuitBreaker => { let b = breakers.get(name); if (!b) { b = new CircuitBreaker(name); breakers.set(name, b); } return b; };
export const withCircuitBreaker = <T>(name: string, fn: () => Promise<T>): Promise<T> => breakerFor(name).exec(fn);
/** Provedor principal com fallback: se o principal falhar ou estiver com circuito aberto, usa o alternativo (degradação graciosa). */
export async function withFallback<T>(name: string, primary: () => Promise<T>, secondary: () => Promise<T>, onDegrade?: (e: unknown) => void): Promise<{ value: T; degraded: boolean }> {
  try { return { value: await withCircuitBreaker(name, primary), degraded: false }; }
  catch (e) { onDegrade?.(e); return { value: await secondary(), degraded: true }; }
}
