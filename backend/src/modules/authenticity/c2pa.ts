import { createHash, createPrivateKey, createSign, X509Certificate } from 'node:crypto';
import { Builder, CallbackSigner, Context, LocalSigner, Reader } from '@contentauth/c2pa-node';
import { env } from '../../config/env.js';
import { m10Error } from '../m10/common.js';

/**
 * Módulo 10 — C2PA com a biblioteca oficial da Content Authenticity Initiative (`@contentauth/c2pa-node`).
 * O manifest vai EMBUTIDO no MP4 (caixa `uuid` C2PA/JUMBF com hash BMFF v3) — nada de manifest remoto.
 * Assinatura ES256:
 * - `kms` (produção): a chave privada nunca sai do KMS; assinamos o digest SHA-256 (MessageType DIGEST) e convertemos
 *   a assinatura DER do KMS para o formato r||s que o COSE espera;
 * - `local`: chave PKCS#8 em variável de ambiente, só fora de produção (o boot de produção recusa — env.productionProblems).
 */
const pem = (b64: string) => Buffer.from(b64, 'base64').toString('utf8');
const splitPem = (chain: string) => (chain.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? []).map((c) => Buffer.from(c + '\n'));
export const c2paConfigured = () => env.C2PA_SIGNER !== 'none' && !!env.C2PA_CERT_CHAIN_PEM_B64 && (env.C2PA_SIGNER === 'kms' ? !!env.C2PA_KMS_KEY_ID : !!env.C2PA_PRIVATE_KEY_PEM_B64);
/** Organização que assina (do certificado) — é o que o verificador mostra; sem dados de usuário. */
export function signerSubject(): string | null {
  if (!env.C2PA_CERT_CHAIN_PEM_B64) return null; const c = splitPem(pem(env.C2PA_CERT_CHAIN_PEM_B64))[0]; if (!c) return null;
  const s = new X509Certificate(c).subject; return (/O=([^\n]+)/.exec(s)?.[1] ?? /CN=([^\n]+)/.exec(s)?.[1] ?? null);
}
/** DER (SEQUENCE{INTEGER r, INTEGER s}) → r||s com 32 bytes cada (IEEE P1363), formato exigido pelo COSE ES256. */
export function derToP1363(der: Buffer, size = 32): Buffer {
  let i = 2; if (der[1]! & 0x80) i = 2 + (der[1]! & 0x7f);
  const read = () => { if (der[i++] !== 0x02) throw new Error('assinatura DER inválida'); const len = der[i++]!; let v = der.subarray(i, i + len); i += len; while (v.length > size && v[0] === 0) v = v.subarray(1); return Buffer.concat([Buffer.alloc(size - v.length), v]); };
  return Buffer.concat([read(), read()]);
}
let kmsClient: Promise<{ sign: (digest: Buffer) => Promise<Buffer> }> | undefined;
async function kmsSign(data: Buffer): Promise<Buffer> {
  kmsClient ??= import('@aws-sdk/client-kms').then((m) => { const c = new m.KMSClient({ region: env.S3_REGION });
    return { sign: async (digest: Buffer) => { const r = await c.send(new m.SignCommand({ KeyId: env.C2PA_KMS_KEY_ID, Message: digest, MessageType: 'DIGEST', SigningAlgorithm: 'ECDSA_SHA_256' })); return Buffer.from(r.Signature!); } }; });
  const der = await (await kmsClient).sign(createHash('sha256').update(data).digest()); return derToP1363(der);
}
function signer() {
  if (!c2paConfigured()) throw m10Error(503, 'seal_not_configured');
  const certs = splitPem(pem(env.C2PA_CERT_CHAIN_PEM_B64));
  if (env.C2PA_SIGNER === 'local') { const key = createPrivateKey(pem(env.C2PA_PRIVATE_KEY_PEM_B64));
    return CallbackSigner.newSigner({ alg: 'es256', certs, reserveSize: 20_000, tsaUrl: env.C2PA_TSA_URL || undefined, directCoseHandling: false }, async (d) => { const s = createSign('sha256'); s.update(d); return s.sign({ key, dsaEncoding: 'ieee-p1363' }); }); }
  return CallbackSigner.newSigner({ alg: 'es256', certs, reserveSize: 20_000, tsaUrl: env.C2PA_TSA_URL || undefined, directCoseHandling: false }, kmsSign);
}
void LocalSigner; // a variante com chave em memória existe, mas usamos CallbackSigner nos dois modos (mesmo caminho do KMS)

export const SEAL_LABEL = 'com.nexusreel.seal';
export const SEAL_TEXT = { 'pt-BR': 'IA com direção humana', en: 'AI with human direction', es: 'IA con dirección humana' } as const;
export interface SealInput { title: string; projectRef: string; derived: boolean }
/** Assina o MP4 e devolve o arquivo novo com o manifest embutido (o original não é alterado). */
export async function signMp4(video: Buffer, o: SealInput): Promise<{ file: Buffer; manifestLabel: string | null }> {
  const actions: Array<Record<string, unknown>> = [{ action: 'c2pa.created', digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia', softwareAgent: { name: 'NexusReel' } }];
  if (o.derived) actions.push({ action: 'c2pa.edited', softwareAgent: { name: 'NexusReel' }, description: 'Edição dirigida por pessoa' });
  const manifest = { claim_generator_info: [{ name: 'NexusReel', version: process.env.APP_VERSION ?? 'dev' }], title: o.title.slice(0, 120) || 'video.mp4', format: 'video/mp4',
    assertions: [{ label: 'c2pa.actions', data: { actions } },
      { label: SEAL_LABEL, data: { seal: 'ai_human_directed', text: SEAL_TEXT, aiGenerated: true, humanDirected: true, project: o.projectRef, version: 1 } }] };
  const b = Builder.withJson(manifest as never); const out: { buffer: Buffer | null } = { buffer: null };
  await b.signAsync(signer(), { buffer: video, mimeType: 'video/mp4' }, out);
  const file = out.buffer!; const r = await Reader.fromAsset({ buffer: file, mimeType: 'video/mp4' });
  return { file, manifestLabel: r?.activeLabel() ?? null };
}
export interface VerifyResult {
  embedded: boolean; manifestPresent: boolean; state: 'none' | 'Invalid' | 'Valid' | 'Trusted'; trusted: boolean; valid: boolean;
  seal: null | { kind: string; text: Record<string, string>; aiGenerated: boolean; humanDirected: boolean };
  signedBy: string | null; signedAt: string | null; actions: string[]; failures: string[]; manifestLabel: string | null; verifyUrl: null;
}
const ctx = () => new Context({ trust: env.C2PA_TRUST_ANCHORS_PEM_B64 ? { userAnchors: pem(env.C2PA_TRUST_ANCHORS_PEM_B64) } : undefined, verify: { verifyTrust: !!env.C2PA_TRUST_ANCHORS_PEM_B64 } } as never);
/** Lê o manifest EMBUTIDO nos bytes do arquivo (nunca busca URL externa) e valida assinatura + hash do conteúdo. */
export async function readEmbedded(video: Buffer): Promise<VerifyResult> {
  const none: VerifyResult = { embedded: false, manifestPresent: false, state: 'none', trusted: false, valid: false, seal: null, signedBy: null, signedAt: null, actions: [], failures: [], manifestLabel: null, verifyUrl: null };
  let r: Reader | null; try { r = await Reader.fromAsset({ buffer: video, mimeType: 'video/mp4' }, ctx()); } catch { return { ...none, failures: ['manifest.unreadable'] }; }
  if (!r) return none;
  const j = r.json() as any; const a = r.getActive() as any; const state = (j.validation_state ?? 'Invalid') as VerifyResult['state'];
  const failures: string[] = [...new Set<string>((j.validation_results?.activeManifest?.failure ?? []).map((f: { code: string }) => f.code))];
  const seal = (a?.assertions ?? []).find((x: { label: string }) => x.label === SEAL_LABEL)?.data;
  const acts = (a?.assertions ?? []).filter((x: { label: string }) => x.label.startsWith('c2pa.actions')).flatMap((x: any) => (x.data?.actions ?? []).map((y: any) => y.action as string));
  return { embedded: r.isEmbedded(), manifestPresent: true, state, trusted: state === 'Trusted', valid: state === 'Valid' || state === 'Trusted', manifestLabel: r.activeLabel() ?? null,
    seal: seal ? { kind: seal.seal, text: seal.text, aiGenerated: !!seal.aiGenerated, humanDirected: !!seal.humanDirected } : null,
    signedBy: a?.signature_info?.issuer ?? a?.signature_info?.common_name ?? null, signedAt: a?.signature_info?.time ?? null, actions: acts, failures, verifyUrl: null };
}
