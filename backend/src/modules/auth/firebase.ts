import { X509Certificate, createVerify } from 'node:crypto';
import { env } from '../../config/env.js';

/**
 * Login com Firebase Authentication (plano gratuito Spark): o front entra no Firebase (e-mail/senha, Google, redefinição
 * de senha — e-mails enviados pelo próprio Firebase) e manda o ID token; aqui ele é conferido como manda a documentação
 * oficial ("Verify ID tokens using a third-party JWT library"), sem SDK de servidor:
 *  - cabeçalho alg=RS256 e kid presente entre os certificados públicos do Google (cache pelo Cache-Control);
 *  - assinatura RSA-SHA256 válida; aud = FIREBASE_PROJECT_ID; iss = https://securetoken.google.com/<projeto>;
 *  - exp no futuro, iat e auth_time no passado (tolerância de 5 s); sub não vazio (≤128).
 * Emulador local (FIREBASE_AUTH_EMULATOR_HOST, só fora de produção): os tokens vêm sem assinatura (alg "none").
 */
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const SKEW = 5;
export interface FirebaseIdentity { uid: string; email: string | null; emailVerified: boolean; name: string | null; signInProvider: string }
export class FirebaseTokenError extends Error { constructor(readonly reason: string) { super(reason); } }

type CertSource = () => Promise<{ certs: Record<string, string>; maxAgeSec: number }>;
let source: CertSource = async () => {
  const r = await fetch(CERTS_URL, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new FirebaseTokenError('certs_unavailable');
  const maxAge = Number(/max-age=(\d+)/.exec(r.headers.get('cache-control') ?? '')?.[1] ?? 3600);
  return { certs: (await r.json()) as Record<string, string>, maxAgeSec: maxAge };
};
let cache: { at: number; ttlMs: number; certs: Record<string, string> } | null = null;
/** Só para testes: troca a origem dos certificados (chaves geradas localmente). */
export function __setFirebaseCertSource(fn: CertSource | null): void { source = fn ?? source; cache = null; }
async function certFor(kid: string): Promise<string | undefined> {
  if (!cache || Date.now() - cache.at > cache.ttlMs || !cache.certs[kid]) { const c = await source(); cache = { at: Date.now(), ttlMs: c.maxAgeSec * 1000, certs: c.certs }; }
  return cache.certs[kid];
}
const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const json = (s: string): Record<string, unknown> => { try { return JSON.parse(b64url(s).toString('utf8')) as Record<string, unknown>; } catch { throw new FirebaseTokenError('malformed'); } };

export const firebaseEnabled = (): boolean => !!env.FIREBASE_PROJECT_ID;
const emulator = (): boolean => !!env.FIREBASE_AUTH_EMULATOR_HOST && env.NODE_ENV !== 'production';

export async function verifyFirebaseIdToken(token: string, now = Math.floor(Date.now() / 1000)): Promise<FirebaseIdentity> {
  if (!firebaseEnabled()) throw new FirebaseTokenError('disabled');
  const parts = token.split('.'); if (parts.length !== 3 || token.length > 8192) throw new FirebaseTokenError('malformed');
  const [h, p, sig] = parts as [string, string, string]; const header = json(h); const c = json(p);
  if (emulator() && header.alg === 'none') { /* emulador: sem assinatura */ }
  else {
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new FirebaseTokenError('bad_alg');
    const pem = await certFor(header.kid); if (!pem) throw new FirebaseTokenError('unknown_kid');
    const key = new X509Certificate(pem).publicKey;
    if (!createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, b64url(sig))) throw new FirebaseTokenError('bad_signature');
  }
  const project = env.FIREBASE_PROJECT_ID;
  if (c.aud !== project) throw new FirebaseTokenError('bad_audience');
  if (c.iss !== `https://securetoken.google.com/${project}`) throw new FirebaseTokenError('bad_issuer');
  if (typeof c.exp !== 'number' || c.exp <= now - SKEW) throw new FirebaseTokenError('expired');
  if (typeof c.iat !== 'number' || c.iat > now + SKEW) throw new FirebaseTokenError('issued_in_future');
  if (typeof c.auth_time !== 'number' || c.auth_time > now + SKEW) throw new FirebaseTokenError('bad_auth_time');
  if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 128) throw new FirebaseTokenError('bad_subject');
  const fb = (c.firebase ?? {}) as { sign_in_provider?: string };
  return { uid: c.sub, email: typeof c.email === 'string' ? c.email.toLowerCase() : null, emailVerified: c.email_verified === true, name: typeof c.name === 'string' ? c.name : null, signInProvider: fb.sign_in_provider ?? 'unknown' };
}
