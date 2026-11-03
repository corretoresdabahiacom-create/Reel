import { createHash, createHmac } from 'node:crypto';

/**
 * Verificador independente de URL pré-assinada AWS SigV4 (query string), escrito pela especificação da AWS
 * ("Authenticating Requests: Using Query Parameters"). Serve para provar que as URLs do app são aceitas pela
 * regra da AWS e que qualquer adulteração é recusada. Calibrado com o vetor oficial da documentação (tests/40).
 */
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const mac = (k: string | Buffer, s: string) => createHmac('sha256', k).update(s).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
export function verifyPresignedV4(url: string, secret: string, now = Date.now()): { signatureValid: boolean; fresh: boolean } {
  const u = new URL(url); const q = u.searchParams;
  const sig = q.get('X-Amz-Signature') ?? ''; const date = q.get('X-Amz-Date') ?? ''; const signed = q.get('X-Amz-SignedHeaders') ?? '';
  const [, day, region, service] = (q.get('X-Amz-Credential') ?? '').split('/');
  const query = [...q.entries()].filter(([k]) => k !== 'X-Amz-Signature').map(([k, v]) => [enc(k), enc(v)] as const)
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}=${v}`).join('&');
  const headers = signed.split(';').map((n) => `${n}:${n === 'host' ? u.host : ''}\n`).join('');
  const canonical = ['GET', u.pathname, query, headers, signed, 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', date, `${day}/${region}/${service}/aws4_request`, sha(canonical)].join('\n');
  const key = mac(mac(mac(mac('AWS4' + secret, day!), region!), service!), 'aws4_request');
  const t = Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +date.slice(9, 11), +date.slice(11, 13), +date.slice(13, 15));
  return { signatureValid: createHmac('sha256', key).update(toSign).digest('hex') === sig, fresh: now <= t + Number(q.get('X-Amz-Expires')) * 1000 };
}
