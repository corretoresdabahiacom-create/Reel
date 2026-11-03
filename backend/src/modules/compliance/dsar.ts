import { pool } from '../../db/pool.js';
/**
 * SLA de direitos do titular medido por jurisdição de residência: exportação (acesso/portabilidade) e exclusão. Prazo por região de residência: BR 15 d (LGPD), EU 30 d (GDPR), CA 30 d (PIPEDA), US 45 d (CCPA/estados).
 * Exportação = requested_at → expires_at-7d (conclusão); `completed` com download_url. Exclusão = created_at → completed_at (após carência de 30 d, que NÃO conta contra o SLA:
 * o prazo legal é para dar início/efeito; a carência é um período de arrependimento opcional do titular — documentado em docs/COMPLIANCE/DSAR_SLA).
 */
/** Prazo por REGIÃO DE RESIDÊNCIA (não por jurisdição: IN/SEA/CN compartilham a região 'US' e distorceriam o mínimo). */
const SLA_DAYS: Record<string, number> = { BR: 15, EU: 30, CA: 30, US: 45 };
export const slaFor = (region: string): number => SLA_DAYS[region] ?? 30;
export const dsarService = {
  async report(days = 90, now = new Date()) {
    const ex = (await pool.query<{ id: string; status: string; requested_at: Date; expires_at: Date | null; region: string }>(`SELECT r.id, r.status, r.requested_at, r.expires_at, u.data_residency_region AS region FROM data_export_requests r JOIN users u ON u.id=r.user_id WHERE r.requested_at > $1::timestamptz - ($2 || ' days')::interval ORDER BY r.requested_at DESC`, [now, String(days)])).rows;
    const rows = ex.map((r) => { const sla = slaFor(r.region); const done = r.status === 'completed'; const finished = done && r.expires_at ? new Date(new Date(r.expires_at).getTime() - 7 * 86400_000) : null; const elapsedDays = ((finished ?? now).getTime() - new Date(r.requested_at).getTime()) / 86400_000;
      return { id: r.id, kind: 'export', region: r.region, slaDays: sla, status: r.status, elapsedDays: +elapsedDays.toFixed(3), withinSla: elapsedDays <= sla, overdue: !done && elapsedDays > sla, nearDue: !done && elapsedDays <= sla && elapsedDays > 0.8 * sla }; });
    const byRegion = Object.fromEntries([...new Set(rows.map((x) => x.region))].map((rg) => { const xs = rows.filter((x) => x.region === rg); return [rg, { total: xs.length, withinSla: xs.filter((x) => x.withinSla && x.status === 'completed').length, open: xs.filter((x) => x.status !== 'completed').length, overdue: xs.filter((x) => x.overdue).length, slaDays: slaFor(rg), avgDays: +(xs.reduce((a, x) => a + x.elapsedDays, 0) / xs.length).toFixed(3) }]; }));
    return { windowDays: days, scope: 'exports (acesso/portabilidade)', total: rows.length, overdue: rows.filter((x) => x.overdue).length, nearDue: rows.filter((x) => x.nearDue).length, byRegion, items: rows.slice(0, 100) };
  },
};
