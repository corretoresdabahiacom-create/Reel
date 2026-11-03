#!/usr/bin/env tsx
/**
 * compliance-audit — evidências de governança, todas offline/locais:
 *   licenses  → auditoria de licenças das dependências de PRODUÇÃO (package-lock.json + node_modules); falha com copyleft forte/desconhecida sem exceção registrada
 *   sbom      → SBOM CycloneDX 1.5 (JSON) de package-lock.json em docs/GOVERNANCE/sbom.cdx.json (o data room recebe a cópia via data-room-sync)
 *   access    → revisão trimestral de acessos: admins (2FA?), chaves de API ativas/antigas/sem uso, com campos de aprovação — grava docs/GOVERNANCE/access-reviews/AAAA-Qn.md
 *   tsx tools/compliance-audit/index.ts licenses [--allow-file docs/GOVERNANCE/license-exceptions.json]
 * Limites: licença vem do campo `license` do package.json de cada pacote (não analisa arquivos LICENSE nem dependências transitivas de licenciamento duplo).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { arg, isMain, run } from '../lib/cli.js';

export const ALLOWED = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', '0BSD', 'BlueOak-1.0.0', 'CC0-1.0', 'Python-2.0', 'Unlicense', 'CC-BY-4.0', 'MPL-2.0', 'LGPL-3.0-or-later', 'LGPL-2.1'];
export const DENIED = /(^|[^L])GPL|AGPL|SSPL|BUSL|Commons-Clause|CC-BY-NC/i;
interface Lock { packages: Record<string, { version?: string; dev?: boolean; optional?: boolean; resolved?: string; integrity?: string; license?: string; link?: boolean }> }
const lockfile = (): Lock => JSON.parse(readFileSync('package-lock.json', 'utf8'));
const nameOf = (p: string): string => p.replace(/^.*node_modules\//, '');
export function prodPackages(lock: Lock): Array<{ name: string; version: string; integrity?: string; resolved?: string; path: string; lockLicense?: string }> {
  return Object.entries(lock.packages).filter(([k, v]) => k && !v.dev && !v.link && v.version).map(([k, v]) => ({ name: nameOf(k), version: v.version!, integrity: v.integrity, resolved: v.resolved, path: k, lockLicense: v.license }));
}
/** Licença do pacote no caminho exato do lockfile (cópias aninhadas de versões diferentes incluídas); cai para o campo `license` do lockfile. */
export function licenseOf(name: string, path = join('node_modules', name), lockLicense?: string): string { const f = join(path, 'package.json'); if (!existsSync(f)) return lockLicense ?? 'UNKNOWN'; if (!existsSync(f)) return 'UNKNOWN'; const j = JSON.parse(readFileSync(f, 'utf8')); const l = j.license ?? j.licenses; return typeof l === 'string' ? l : Array.isArray(l) ? l.map((x: { type: string }) => x.type).join(' OR ') : l?.type ?? 'UNKNOWN'; }
export function classify(license: string, exceptions: string[] = [], pkg = ''): 'ok' | 'review' | 'denied' {
  if (exceptions.includes(pkg)) return 'ok'; const parts = license.replace(/[()]/g, '').split(/\s+(?:OR|AND)\s+|\//i).map((s) => s.trim());
  if (parts.some((p) => ALLOWED.includes(p)) && !/ AND /i.test(license)) return 'ok'; if (parts.every((p) => ALLOWED.includes(p))) return 'ok';
  return DENIED.test(license) ? 'denied' : 'review';
}
export function licenseReport(exceptions: string[] = []) {
  const rows = prodPackages(lockfile()).map((p) => { const l = licenseOf(p.name, p.path, p.lockLicense); return { ...p, license: l, verdict: classify(l, exceptions, p.name) }; });
  const by: Record<string, number> = {}; for (const r of rows) by[r.license] = (by[r.license] ?? 0) + 1;
  return { total: rows.length, byLicense: by, denied: rows.filter((r) => r.verdict === 'denied'), review: rows.filter((r) => r.verdict === 'review') };
}
export function sbom(): Record<string, unknown> {
  const pkgs = prodPackages(lockfile()); const meta = JSON.parse(readFileSync('package.json', 'utf8'));
  return { bomFormat: 'CycloneDX', specVersion: '1.5', version: 1, metadata: { timestamp: new Date().toISOString(), component: { type: 'application', name: meta.name, version: meta.version }, tools: [{ name: 'tools/compliance-audit' }] },
    components: pkgs.map((p) => { const purl = `pkg:npm/${p.name.startsWith('@') ? p.name.replace('@', '%40') : p.name}@${p.version}`; const h = p.integrity?.match(/^sha(\d+)-(.+)$/); return { type: 'library', 'bom-ref': purl, name: p.name, version: p.version, purl, licenses: [{ license: { id: licenseOf(p.name, p.path, p.lockLicense) } }], ...(h ? { hashes: [{ alg: `SHA-${h[1]}`, content: Buffer.from(h[2]!, 'base64').toString('hex') }] } : {}) }; }) };
}
async function accessReview(): Promise<string> {
  const { pool } = await import('../../src/db/pool.js'); const now = new Date(); const q = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
  const admins = (await pool.query(`SELECT email, totp_enabled, created_at FROM users WHERE is_admin AND deleted_at IS NULL ORDER BY email`)).rows;
  const keys = (await pool.query(`SELECT k.name, k.prefix, k.scopes, k.last_used_at, k.created_at, u.email FROM api_keys k JOIN users u ON u.id=k.user_id WHERE k.revoked_at IS NULL ORDER BY k.created_at`)).rows;
  const stale = keys.filter((k) => !k.last_used_at || Date.now() - new Date(k.last_used_at).getTime() > 90 * 86_400_000);
  const L = [`# Revisão trimestral de acessos — ${q}`, '', `Gerada em ${now.toISOString()} por tools/compliance-audit. **Não substitui a decisão do revisor**: cada item exige "manter" ou "revogar" assinado.`, '', '## Administradores', '', '| E-mail | 2FA | Decisão (manter/revogar) | Revisor |', '|---|---|---|---|', ...admins.map((a) => `| ${a.email} | ${a.totp_enabled ? 'sim' : '**NÃO**'} | | |`), '', `## Chaves de API ativas (${keys.length}; sem uso em 90 d: ${stale.length})`, '', '| Dono | Chave | Escopos | Último uso | Decisão | Revisor |', '|---|---|---|---|---|---|', ...keys.map((k) => `| ${k.email} | ${k.name} (${k.prefix}…) | ${k.scopes.join(',')} | ${k.last_used_at ? new Date(k.last_used_at).toISOString().slice(0, 10) : '**nunca**'} | | |`), '', '## Achados automáticos', '', ...(admins.filter((a) => !a.totp_enabled).map((a) => `- Admin sem 2FA: ${a.email}`)), ...stale.map((k) => `- Chave sem uso há >90 d (candidata a revogação): ${k.email}/${k.name}`), '', '## Assinaturas', '', 'Segurança: ______ · Engenharia: ______ · Data: ______', ''];
  const dir = 'docs/GOVERNANCE/access-reviews'; mkdirSync(dir, { recursive: true }); const f = join(dir, `${q}.md`); writeFileSync(f, L.join('\n')); return f;
}
async function main(): Promise<void> {
  const [cmd, ...a] = process.argv.slice(2);
  if (cmd === 'licenses') { const ef = arg(a, 'allow-file') ?? 'docs/GOVERNANCE/license-exceptions.json'; const ex: string[] = existsSync(ef) ? JSON.parse(readFileSync(ef, 'utf8')).packages ?? [] : []; const r = licenseReport(ex); console.log(JSON.stringify(r, null, 2)); if (r.denied.length) process.exitCode = 1; return; }
  if (cmd === 'sbom') { const out = 'docs/GOVERNANCE/sbom.cdx.json'; mkdirSync('docs/GOVERNANCE', { recursive: true }); const s = sbom(); writeFileSync(out, JSON.stringify(s, null, 1)); console.log(`${out}: ${(s.components as unknown[]).length} componentes`); return; }
  if (cmd === 'access') { console.log(await accessReview()); return; }
  throw new Error('uso: licenses | sbom | access');
}
if (isMain(import.meta.url)) await run(main);
