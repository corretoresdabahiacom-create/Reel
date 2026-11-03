import type { Http } from './http';
/** Cliente de experimentos: variante vem do servidor (determinística/sticky); SEM resposta => controle (sem flicker: o app renderiza o controle e só troca se já houver cache). */
export type Assignment = { variant: string; payload?: Record<string, unknown>; experimentKey?: string };
export class ExperimentClient {
  private cache = new Map<string, Assignment>(); private exposed = new Set<string>(); private subs = new Set<() => void>();
  constructor(private http: Http, private fallback: Record<string, string> = {}) {}
  subscribe(fn: () => void) { this.subs.add(fn); return () => this.subs.delete(fn); }
  /** Pré-carrega todos os experimentos ativos de uma vez (ex.: no boot) — evita flicker nas telas. */
  async preload(): Promise<void> { const r = await this.http('GET', '/api/v1/experiments/active'); if (r?.status === 200) { for (const e of r.body?.experiments ?? []) this.cache.set(e.key, { variant: e.variant, payload: e.payload, experimentKey: e.key }); this.subs.forEach((f) => f()); } }
  /** Síncrono: devolve o cache ou o controle. Nunca bloqueia render. */
  variant(key: string): string { return this.cache.get(key)?.variant ?? this.fallback[key] ?? 'control'; }
  payload(key: string): Record<string, unknown> { return this.cache.get(key)?.payload ?? {}; }
  /** Registra exposição UMA vez por sessão, só quando a variante é realmente exibida. */
  async expose(key: string): Promise<string> {
    if (this.exposed.has(key)) return this.variant(key); this.exposed.add(key);
    const r = await this.http('POST', `/api/v1/experiments/${encodeURIComponent(key)}/assign`, { expose: true });
    if (r?.status === 200 && r.body?.variant) { this.cache.set(key, { variant: r.body.variant, payload: r.body.payload, experimentKey: key }); this.subs.forEach((f) => f()); } return this.variant(key);
  }
  async convert(key: string, event: string, value = 0): Promise<void> { await this.http('POST', `/api/v1/experiments/${encodeURIComponent(key)}/convert`, { event, value }); }
  /** Dados para a tela /__experiments (debug): variante efetiva por chave. */
  debug(): Array<{ key: string; variant: string; exposed: boolean }> { return [...this.cache.keys()].map((k) => ({ key: k, variant: this.variant(k), exposed: this.exposed.has(k) })); }
}
/** Hooks (React injetado para não acoplar o kit): const { useVariant } = createHooks(React, client) */
export function createHooks(React: { useSyncExternalStore: any; useEffect: any }, client: ExperimentClient) {
  return {
    useVariant(key: string): string { return React.useSyncExternalStore((cb: () => void) => client.subscribe(cb), () => client.variant(key), () => client.variant(key)); },
    useExperiment(key: string) { const v: string = React.useSyncExternalStore((cb: () => void) => client.subscribe(cb), () => client.variant(key), () => client.variant(key)); React.useEffect(() => { void client.expose(key); }, [key]); return { variant: v, payload: client.payload(key), convert: (e: string, val?: number) => client.convert(key, e, val) }; },
  };
}
