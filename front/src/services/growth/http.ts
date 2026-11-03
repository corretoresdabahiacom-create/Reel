/** Transporte injetável (fetch no app, stub nos testes). Nunca lança: growth/analytics jamais podem derrubar a UI. */
export interface Http { (method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; body: any } | null> }
export function fetchHttp(baseUrl: string, getToken: () => string | null, f: typeof fetch = fetch): Http {
  return async (method, path, body) => {
    try { const h: Record<string, string> = { 'content-type': 'application/json' }; const t = getToken(); if (t) h.authorization = `Bearer ${t}`;
      const r = await f(baseUrl + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, body: await r.json().catch(() => null) };
    } catch { return null; }
  };
}
