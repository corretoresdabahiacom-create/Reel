#!/usr/bin/env tsx
/**
 * bcp-simulator — executa os drills automatizados de continuidade e registra o resultado (bcp_scenarios + resilience_exercises).
 *   tsx tools/bcp-simulator/index.ts list
 *   tsx tools/bcp-simulator/index.ts run ai_provider_failure|publishing_platform_down|cloud_region_failure [--no-record]
 *   tsx tools/bcp-simulator/index.ts overdue
 * Os drills validam LÓGICA (breaker, kill switch, mapa de DR). Não substituem exercício em infraestrutura real; as limitações vêm em `limitations`.
 */
import { bcpService } from '../../src/modules/bcp/bcp.service.js';
import { arg, flag, isMain, run } from '../lib/cli.js';

async function main(): Promise<void> {
  const [cmd, name] = process.argv.slice(2); const a = process.argv.slice(2);
  if (cmd === 'list') { console.log(JSON.stringify(await bcpService.scenarios(), null, 2)); return; }
  if (cmd === 'overdue') { console.log(JSON.stringify(await bcpService.overdue(), null, 2)); return; }
  if (cmd === 'run' && name) {
    const d = flag(a, 'no-record') ? await (name === 'ai_provider_failure' ? bcpService.drillAiProviderFailover() : name === 'cloud_region_failure' ? bcpService.drillRegionLoss(arg(a, 'lost')) : bcpService.drillPlatformKillSwitch()) : await bcpService.run(name, null);
    console.log(JSON.stringify(d, null, 2)); if (d.outcome === 'failed') process.exitCode = 1; return;
  }
  throw new Error('uso: list | overdue | run <cenário>');
}
if (isMain(import.meta.url)) await run(main);
