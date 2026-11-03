/* global process, console */
// Varredura de segredos (sem dependências) — roda no CI e no checkpoint final. Olha só arquivos versionados (git ls-files)
// e falha se encontrar chave privada, token de provedor ou credencial com cara de real. Placeholders de exemplo/teste são
// aceitos só quando explicitamente reconhecíveis (ALLOW). Uso: node tools/secret-scan/index.mjs [pasta-do-repo ...]
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
const RULES = [
  ['chave privada PEM', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['AWS secret key', /aws_secret_access_key\s*[=:]\s*["']?[A-Za-z0-9/+]{40}/i],
  ['Stripe live', /\b(?:sk|rk)_live_[0-9a-zA-Z]{16,}/],
  ['Stripe webhook', /\bwhsec_[0-9a-zA-Z]{24,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['Slack token', /\bxox[abpors]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['SendGrid', /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/],
  ['URL com senha', /\b(?:postgres|postgresql|mysql|redis|amqp|mongodb(?:\+srv)?):\/\/[^:\s/@]+:([^@\s/]{6,})@/],
  ['segredo atribuído', /\b(?:SECRET|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|ACCESS_TOKEN|CLIENT_SECRET)\s*[=:]\s*["'][^"'\s]{16,}["']/],
];
// placeholders reconhecíveis de teste/exemplo (não são segredos reais)
const ALLOW = [/test-secret|ci-secret|example|exemplo|changeme|placeholder|dummy|fake|xxxx|<[^>]+>|\$\{|process\.env|aaaaaaaa|00000000|postgres:postgres@|whsec_test/i];
const SKIP = /(^|\/)(node_modules|dist|coverage|\.git)\/|package-lock\.json$|\.(png|jpe?g|webp|gif|mp4|mov|webm|zip|bundle|pdf|woff2?|ttf|otf|ico|keystore|jks)$|web\/vendor\//;
const findings = []; let files = 0;
for (const repo of process.argv.slice(2).length ? process.argv.slice(2) : ['.']) {
  for (const f of execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)) {
    if (SKIP.test(f)) continue; const p = join(repo, f); let txt; try { if (statSync(p).size > 5_000_000) continue; txt = readFileSync(p, 'utf8'); } catch { continue; } files++;
    txt.split('\n').forEach((line, i) => { for (const [name, re] of RULES) { const m = line.match(re); if (m && !ALLOW.some((a) => a.test(m[0]) || a.test(line))) findings.push({ file: `${repo === '.' ? '' : repo + ':'}${f}:${i + 1}`, rule: name, sample: m[0].slice(0, 12) + '…' }); } });
  }
}
console.log(JSON.stringify({ files, findings: findings.length }));
for (const x of findings) console.log(`${x.rule} → ${x.file} (${x.sample})`); // nunca imprime o segredo inteiro
process.exit(findings.length ? 1 : 0);
