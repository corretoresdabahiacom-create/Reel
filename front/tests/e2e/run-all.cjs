// Roda todos os drivers E2E em sequência; falha se algum reportar FAIL ou erro de console. Uso: npm run e2e
const { spawnSync } = require('node:child_process'); const { join } = require('node:path');
let ok = 0, fail = 0;
for (const f of ['drive', 'drive3', 'drive4', 'drive5', 'rtl', 'drive-audio', 'drive-background', 'drive-elements', 'drive-merge', 'drive-save', 'drive-assets', 'drive-email', 'drive-collab', 'drive-transcript', 'drive-m10', 'drive-a11y']) {
  const r = spawnSync(process.execPath, [join(__dirname, f + '.cjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout || '') + (r.stderr || ''); process.stdout.write(`\n=== ${f}.cjs\n` + out);
  ok += (out.match(/^OK/gm) || []).length; const bad = (out.match(/^FAIL/gm) || []).length + (r.status ? 1 : 0) + (/console errors?\/warn\w*: [1-9]|^ERRORS [1-9]/m.test(out) ? 1 : 0); fail += bad;
}
console.log(`\nE2E: ${ok} verificações OK, ${fail} falha(s)`); process.exit(fail ? 1 : 0);
