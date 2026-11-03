import { pool } from '../../db/pool.js';
import { redis } from '../../db/redis.js';
import { env } from '../../config/env.js';
import { audit } from '../../repositories/audit.js';
import { AppError } from '../../utils/errors.js';
import { PLATFORMS } from '../../utils/validate.js';
import { breakerOpen } from '../../providers/ai/router.js';
import { isEnabled, invalidateFlags } from '../flags.service.js';
import { PROVIDER_MATRIX } from '../cost-optimization/matrix.js';
import type { Row } from '../../db/rows.generated.js';
import { residencyService, REGIONS, CLOUD_REGION } from '../residency/residency.js';
/**
 * Continuidade de negócio (Fase 8). Simuladores EXECUTÁVEIS de lógica (breaker, kill switch, mapa de residência/DR) — não substituem teste em infraestrutura real:
 * cada drill devolve `outcome` ('passed'|'gaps_found'|'failed') e `gaps` explícitos, e grava em bcp_scenarios + resilience_exercises.
 */
export const DR_PAIRS: Record<string, string> = { 'sa-east-1': 'us-east-1', 'us-east-1': 'sa-east-1', 'eu-west-1': 'us-east-1', 'ca-central-1': 'us-east-1' };
type Outcome = 'passed' | 'gaps_found' | 'failed';
export interface DrillResult { scenario: string; outcome: Outcome; measuredMinutes: number; steps: Array<{ step: string; ok: boolean; detail?: string }>; gaps: string[]; limitations: string[] }
const result = (scenario: string, steps: DrillResult['steps'], gaps: string[], t0: number, limitations: string[]): DrillResult => ({ scenario, outcome: steps.some((s) => !s.ok) ? 'failed' : gaps.length ? 'gaps_found' : 'passed', measuredMinutes: Math.max(0, +((Date.now() - t0) / 60000).toFixed(3)), steps, gaps, limitations });

export const bcpService = {
  async scenarios() { return (await pool.query<Row<'bcp_scenarios'>>('SELECT * FROM bcp_scenarios ORDER BY name')).rows; },
  /** Provedores de IA reais (não-mock) integrados por categoria: ≥2 é o requisito de continuidade. */
  integratedProviders() { const real = (k: 'video' | 'tts') => PROVIDER_MATRIX.filter((p) => p.kind === k && p.integrated && p.name !== 'mock').map((p) => p.name); return { video: real('video'), tts: real('tts'), moderation: ['openai'] }; },
  async drillAiProviderFailover(): Promise<DrillResult> {
    const t0 = Date.now(); const steps: DrillResult['steps'] = []; const gaps: string[] = []; const p = env.AI_VIDEO_PROVIDER; const fb = env.AI_VIDEO_FALLBACK; const key = `cb:open:${p}`;
    const had = (await redis.exists(key)) === 1;
    try {
      await redis.set(key, '1', 'EX', 120); steps.push({ step: `abrir circuit breaker de ${p}`, ok: await breakerOpen(p) });
      const routed = (await breakerOpen(p)) ? fb : p; steps.push({ step: 'roteamento escolhe o fallback com breaker aberto', ok: routed === fb || p === fb, detail: `${p} → ${routed}` });
    } finally { if (!had) await redis.del(key); }
    steps.push({ step: 'breaker restaurado ao estado original', ok: (await redis.exists(key)) === (had ? 1 : 0) });
    const real = this.integratedProviders();
    for (const [cat, list] of Object.entries(real)) if (list.length < 2) gaps.push(`Categoria ${cat}: apenas ${list.length} provedor(es) real(is) integrado(s) (${list.join(', ') || 'nenhum'}) — failover cai no mock/degradado; integrar um segundo provedor (candidatos na PROVIDER_MATRIX).`);
    if (fb === 'mock') gaps.push('AI_VIDEO_FALLBACK=mock: em falha do provedor primário o fallback NÃO gera vídeo real.');
    return result('ai_provider_failure', steps, gaps, t0, ['Simula o breaker e a escolha de rota; não derruba o provedor real.']);
  },
  async drillPlatformKillSwitch(adminId: string | null = null, platform: (typeof PLATFORMS)[number] = 'tiktok'): Promise<DrillResult> {
    const t0 = Date.now(); const steps: DrillResult['steps'] = []; const flag = `publish_${platform}`; const before = await isEnabled(flag);
    try {
      await pool.query(`UPDATE feature_flags SET enabled=false, updated_at=now() WHERE key=$1`, [flag]); await invalidateFlags(); steps.push({ step: `kill switch ${flag} desliga publicação`, ok: !(await isEnabled(flag)) });
    } finally { await pool.query(`UPDATE feature_flags SET enabled=$2, updated_at=now() WHERE key=$1`, [flag, before]); await invalidateFlags(); }
    steps.push({ step: 'flag restaurada', ok: (await isEnabled(flag)) === before }); await audit(pool, adminId ?? 'system', 'bcp.drill', 'flag', flag, { scenario: 'publishing_platform_down' });
    return result('publishing_platform_down', steps, [], t0, ['Valida o kill switch e o restore; a degradação para "salvar e publicar manualmente" no app é fluxo de produto fora deste drill.']);
  },
  async drillRegionLoss(lost: string = 'sa-east-1'): Promise<DrillResult> {
    const t0 = Date.now(); const steps: DrillResult['steps'] = []; const gaps: string[] = []; const pair = DR_PAIRS[lost];
    steps.push({ step: `região de DR definida para ${lost}`, ok: !!pair, detail: pair });
    const affected = REGIONS.filter((r) => CLOUD_REGION[r] === lost); let routes = 0;
    for (const r of affected) { const rs = await residencyService.routesFor(r); routes += rs.length; for (const x of rs) if (x.storageRegion !== 'global' && !DR_PAIRS[x.storageRegion]) gaps.push(`Rota ${r}/${x.dataType} (${x.storageRegion}) sem par de DR`); }
    steps.push({ step: 'rotas de residência afetadas mapeadas', ok: routes > 0, detail: `${routes} rotas` });
    const eu = affected.includes('EU'); if (pair && eu && pair.startsWith('us')) gaps.push('Residência UE: failover para região fora da UE exige base legal (SCC) ou segunda região UE — decisão jurídica registrada em docs/COMPLIANCE/DATA_RESIDENCY.md.');
    const lostUsers = (await residencyService.distribution()).filter((d: { region: string }) => affected.includes(d.region as never)).reduce((a: number, d: { users: number }) => a + d.users, 0);
    return { ...result('cloud_region_failure', steps, gaps, t0, ['Verifica mapeamento e pares de DR; promoção real do Postgres/S3 só em exercício de DR em infraestrutura (docs/SRE/DR.md).']), steps: [...steps, { step: 'usuários impactados estimados', ok: true, detail: String(lostUsers) }] };
  },
  async record(adminId: string | null, d: DrillResult, o: { owner?: string; evidenceUrl?: string } = {}) {
    await pool.query(`UPDATE bcp_scenarios SET last_tested_at=now(), last_measured_minutes=$2 WHERE name=$1`, [d.scenario, Math.ceil(d.measuredMinutes)]);
    const r = (await pool.query<{ id: string }>(`INSERT INTO resilience_exercises (kind, name, owner, scheduled_for, executed_at, outcome, measured_minutes, evidence_url) VALUES ('bcp',$1,$2,current_date,now(),$3,$4,$5) RETURNING id`, [d.scenario, o.owner ?? 'sre', d.outcome, Math.ceil(d.measuredMinutes), o.evidenceUrl ?? null])).rows[0];
    await audit(pool, adminId ?? 'system', 'bcp.drill_recorded', 'bcp_scenario', d.scenario, { outcome: d.outcome, gaps: d.gaps.length }); return { exerciseId: r.id as string };
  },
  async run(name: string, adminId: string | null) {
    const d = name === 'ai_provider_failure' ? await this.drillAiProviderFailover() : name === 'publishing_platform_down' ? await this.drillPlatformKillSwitch(adminId) : name === 'cloud_region_failure' ? await this.drillRegionLoss() : null;
    if (!d) throw new AppError(400, 'drill_not_automated', `Cenário "${name}" é exercício de mesa (tabletop) — registre via POST /admin/ops/exercises`);
    return { ...d, ...(await this.record(adminId, d)) };
  },
  /** Cenários nunca testados ou com teste vencido (>180 d) — alimenta o calendário de continuidade. */
  async overdue(days = 180) { return (await pool.query<{ name: string; rto_minutes: number; last_tested_at: Date | null }>(`SELECT name, rto_minutes, last_tested_at FROM bcp_scenarios WHERE last_tested_at IS NULL OR last_tested_at < now() - ($1 || ' days')::interval ORDER BY last_tested_at NULLS FIRST`, [String(days)])).rows; },
  async exercises(limit = 100) { return (await pool.query<Row<'resilience_exercises'>>(`SELECT * FROM resilience_exercises ORDER BY scheduled_for DESC LIMIT $1`, [limit])).rows; },
  async schedule(b: { kind: string; name: string; owner: string; scheduledFor: string }) { return (await pool.query<Row<'resilience_exercises'>>(`INSERT INTO resilience_exercises (kind,name,owner,scheduled_for) VALUES ($1,$2,$3,$4) RETURNING *`, [b.kind, b.name, b.owner, b.scheduledFor])).rows[0]; },
  async complete(id: string, b: { outcome: Outcome; measuredMinutes?: number; evidenceUrl?: string; postmortemIncidentId?: string }) { const r = await pool.query<Row<'resilience_exercises'>>(`UPDATE resilience_exercises SET executed_at=now(), outcome=$2, measured_minutes=$3, evidence_url=$4, postmortem_incident_id=$5 WHERE id=$1 RETURNING *`, [id, b.outcome, b.measuredMinutes ?? null, b.evidenceUrl ?? null, b.postmortemIncidentId ?? null]); if (!r.rowCount) throw new AppError(404, 'not_found', 'Exercício inexistente'); return r.rows[0]; },
};
