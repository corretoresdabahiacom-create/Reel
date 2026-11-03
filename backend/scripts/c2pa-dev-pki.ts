import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Módulo 10 — PKI EFÊMERA de desenvolvimento/teste para o selo C2PA (CA raiz + certificado de assinatura ES256 com
 * EKU emailProtection, como o C2PA exige). Gerada na hora com `openssl` em uma pasta temporária: NENHUMA chave é
 * versionada. Em produção use `C2PA_SIGNER=kms` com a cadeia emitida por uma CA confiável (docs/modules/INSIGHTS_SERIES_SEAL_LIVE.md).
 * Uso: `npx tsx scripts/c2pa-dev-pki.ts` imprime as variáveis `C2PA_*` para um `.env` local (não versionado).
 */
export function makeDevPki(dir = mkdtempSync(join(tmpdir(), 'nexus-c2pa-'))): { C2PA_SIGNER: 'local'; C2PA_CERT_CHAIN_PEM_B64: string; C2PA_PRIVATE_KEY_PEM_B64: string; C2PA_TRUST_ANCHORS_PEM_B64: string } {
  const o = (...a: string[]) => execFileSync('openssl', a, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  o('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ca.key');
  o('req', '-x509', '-new', '-key', 'ca.key', '-sha256', '-days', '30', '-subj', '/CN=NexusReel Dev Root CA/O=NexusReel Dev', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign', '-out', 'ca.pem');
  o('ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'leaf.ec'); o('pkcs8', '-topk8', '-nocrypt', '-in', 'leaf.ec', '-out', 'leaf.key');
  o('req', '-new', '-key', 'leaf.key', '-subj', '/CN=NexusReel Dev Content Signer/O=NexusReel', '-out', 'leaf.csr');
  writeFileSync(join(dir, 'leaf.ext'), 'basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=emailProtection\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid\n');
  o('x509', '-req', '-in', 'leaf.csr', '-CA', 'ca.pem', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '30', '-sha256', '-extfile', 'leaf.ext', '-out', 'leaf.pem');
  const r = (f: string) => readFileSync(join(dir, f));
  return { C2PA_SIGNER: 'local', C2PA_CERT_CHAIN_PEM_B64: Buffer.concat([r('leaf.pem'), r('ca.pem')]).toString('base64'), C2PA_PRIVATE_KEY_PEM_B64: r('leaf.key').toString('base64'), C2PA_TRUST_ANCHORS_PEM_B64: r('ca.pem').toString('base64') };
}
if (process.argv[1]?.endsWith('c2pa-dev-pki.ts')) for (const [k, v] of Object.entries(makeDevPki())) process.stdout.write(`${k}=${v}\n`);
