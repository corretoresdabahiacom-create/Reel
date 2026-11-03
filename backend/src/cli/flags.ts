const out = (s: string) => process.stdout.write(`${s}\n`); // CLI: saída para o terminal de quem rodou
import { pool } from '../db/pool.js';
import { setFlag } from '../modules/flags.service.js';

/**
 * Liga/desliga flags pelo terminal do servidor (instalação gratuita, sem painel admin ainda):
 *   node dist/cli/flags.js on ff_voice_studio [ff_outra ...]     node dist/cli/flags.js off ff_voice_studio     node dist/cli/flags.js list
 * Fica registrado na auditoria (ator "sistema").
 */
const SYSTEM = '00000000-0000-0000-0000-000000000000';
export async function flagsCli(args: string[]): Promise<string> {
  const [cmd, ...keys] = args;
  if (cmd === 'list') return (await pool.query<{ key: string; enabled: boolean; rollout_percent: number }>('SELECT key, enabled, rollout_percent FROM feature_flags ORDER BY key')).rows.map((r) => `${r.enabled && r.rollout_percent > 0 ? 'ON ' : 'off'} ${r.key} (${r.rollout_percent}%)`).join('\n');
  if ((cmd !== 'on' && cmd !== 'off') || !keys.length) throw new Error('uso: flags on|off <chave...> | flags list');
  const out: string[] = [];
  for (const k of keys) {
    if (!/^[a-z0-9_]{2,60}$/.test(k)) throw new Error(`chave inválida: ${k}`);
    const exists = (await pool.query<{ "?column?": number | null }>('SELECT 1 FROM feature_flags WHERE key=$1', [k])).rowCount; if (!exists) throw new Error(`flag inexistente: ${k}`);
    await setFlag(SYSTEM, k, cmd === 'on' ? { enabled: true, rollout_percent: 100 } : { enabled: false, rollout_percent: 0 }); out.push(`${cmd === 'on' ? 'ligada' : 'desligada'}: ${k}`);
  }
  return out.join('\n');
}
if (process.argv[1] && /cli\/flags\.(js|ts)$/.test(process.argv[1])) {
  flagsCli(process.argv.slice(2)).then(async (r) => { out(r); await pool.end(); process.exit(0); }).catch(async (e) => { console.error(String((e as Error).message ?? e)); await pool.end().catch(() => undefined); process.exit(1); });
}
