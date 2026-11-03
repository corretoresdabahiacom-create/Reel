/**
 * P0-1 etapa 3 — leitura e escrita do cabeçalho Cookie sem dependência nova (RFC 2026-10-session-cookie).
 * Só o necessário: nomes/valores ASCII sem `;`, atributos fixos e seguros.
 */
export function readCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}; if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('='); if (i <= 0) continue;
    const k = part.slice(0, i).trim(); const v = part.slice(i + 1).trim();
    if (/^[A-Za-z0-9_-]+$/.test(k) && !(k in out)) { try { out[k] = decodeURIComponent(v); } catch { /* valor malformado: ignora */ } }
  }
  return out;
}
export interface CookieOpts { maxAgeSec: number; path: string; httpOnly?: boolean; secure: boolean; sameSite?: 'Strict' | 'Lax'; domain?: string }
export function serializeCookie(name: string, value: string, o: CookieOpts): string {
  if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error('nome de cookie inválido');
  return [`${name}=${encodeURIComponent(value)}`, `Max-Age=${Math.max(0, Math.floor(o.maxAgeSec))}`, `Path=${o.path}`, ...(o.domain ? [`Domain=${o.domain}`] : []),
    ...(o.httpOnly === false ? [] : ['HttpOnly']), ...(o.secure ? ['Secure'] : []), `SameSite=${o.sameSite ?? 'Strict'}`].join('; ');
}
