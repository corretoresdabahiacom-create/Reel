import { createHmac, randomBytes } from 'node:crypto';
/** TOTP RFC 6238 (SHA-1, 30 s, 6 dígitos) — compatível com Google Authenticator/Authy. */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function newSecret(): string { const b = randomBytes(20); let bits = '', out = ''; for (const x of b) bits += x.toString(2).padStart(8, '0'); for (let i = 0; i < bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return out; }
function decode(s: string): Buffer { let bits = ''; for (const c of s.replace(/=+$/, '')) bits += B32.indexOf(c).toString(2).padStart(5, '0'); const bytes: number[] = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(bytes); }
export function totpAt(secret: string, t = Date.now()): string {
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(Math.floor(t / 30000)));
  const h = createHmac('sha1', decode(secret)).update(ctr).digest(); const o = h[h.length - 1]! & 0xf;
  const code = ((h[o]! & 0x7f) << 24 | h[o + 1]! << 16 | h[o + 2]! << 8 | h[o + 3]!) % 1_000_000; return String(code).padStart(6, '0');
}
export const verifyTotp = (secret: string, code: string, t = Date.now()) => [-1, 0, 1].some((w) => totpAt(secret, t + w * 30000) === code);
export const otpauthUrl = (secret: string, email: string) => `otpauth://totp/NexusReel:${encodeURIComponent(email)}?secret=${secret}&issuer=NexusReel`;
