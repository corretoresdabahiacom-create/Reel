import argon2 from 'argon2';
/** Argon2id (OWASP): m=64 MiB, t=3, p=1. */
const opts = { type: argon2.argon2id, memoryCost: 64 * 1024, timeCost: 3, parallelism: 1 } as const;
export const hashPassword = (p: string) => argon2.hash(p, opts);
export const verifyPassword = (hash: string, p: string) => argon2.verify(hash, p).catch(() => false);
