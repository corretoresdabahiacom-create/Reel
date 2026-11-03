import { pool } from '../../db/pool.js';
import type { Row } from '../../db/rows.generated.js';
/** On-call saudável: limites de pages por pessoa/mês (total e fora do expediente) e alerta de burnout. Limites em settings.ops.oncall. */
const cfg = async () => (((await pool.query<Pick<Row<'settings'>, 'value'>>(`SELECT value FROM settings WHERE key='ops'`)).rows.at(0)?.value as Record<string, any> | undefined)?.oncall ?? { maxPagesPerPersonPerMonth: 8, maxOffHoursPagesPerPersonPerMonth: 3, offHoursStart: 22, offHoursEnd: 7, utcOffsetHours: -3 }) as { maxPagesPerPersonPerMonth: number; maxOffHoursPagesPerPersonPerMonth: number; offHoursStart: number; offHoursEnd: number; utcOffsetHours: number };
export const isOffHours = (d: Date, c: { offHoursStart: number; offHoursEnd: number; utcOffsetHours: number }): boolean => { const h = (d.getUTCHours() + c.utcOffsetHours + 24) % 24; const dow = new Date(d.getTime() + c.utcOffsetHours * 3600_000).getUTCDay(); return dow === 0 || dow === 6 || h >= c.offHoursStart || h < c.offHoursEnd; };
export const oncallService = {
  async record(person: string, severity: string, incidentId: string | null, at = new Date(), team = 'backend') { const c = await cfg(); await pool.query(`INSERT INTO oncall_pages (person, team, severity, incident_id, paged_at, off_hours) VALUES ($1,$2,$3,$4,$5,$6)`, [person, team, severity, incidentId, at, isOffHours(at, c)]); },
  /** Carga por pessoa na janela; `risk`: ok | atenção (>=75% do limite) | burnout (acima do limite). Sugere compensação (folga) quando há pages fora do expediente. */
  async load(days = 30) {
    const c = await cfg(); const rows = (await pool.query<{ person: string; pages: number; off: number; sev1: number; last_page: Date | null }>(`SELECT person, count(*)::int pages, count(*) FILTER (WHERE off_hours)::int off, count(*) FILTER (WHERE severity='sev1')::int sev1, max(paged_at) last_page FROM oncall_pages WHERE paged_at > now() - ($1 || ' days')::interval GROUP BY person ORDER BY pages DESC`, [String(days)])).rows;
    const scale = days / 30; const maxP = c.maxPagesPerPersonPerMonth * scale, maxO = c.maxOffHoursPagesPerPersonPerMonth * scale;
    return { windowDays: days, limits: { pages: Math.round(maxP), offHours: Math.round(maxO) }, people: rows.map((r) => { const over = r.pages > maxP || r.off > maxO; const near = r.pages >= 0.75 * maxP || r.off >= 0.75 * maxO; return { person: r.person, pages: r.pages, offHoursPages: r.off, sev1: r.sev1, lastPage: r.last_page, risk: over ? 'burnout' : near ? 'atencao' : 'ok', suggestion: over ? 'Rotacionar a escala, dar folga compensatória e revisar alertas ruidosos' : r.off > 0 ? 'Registrar folga compensatória pelos pages fora do expediente' : null }; }) };
  },
};
