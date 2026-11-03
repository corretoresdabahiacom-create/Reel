import { pool } from '../db/pool.js';
import { runRetention } from '../jobs/retention.js';
/**
 * Retenção automatizada por política (Fase 8). Estende o job diário da Fase 6/7 (`runRetention`) e REGISTRA cada execução em `retention_runs` (base do relatório mensal).
 * Política (docs/RETENTION.md + docs/COMPLIANCE/RETENTION_POLICY.md): vídeos brutos 90 d (lifecycle S3), vídeo final Free 365 d / Pro e Business 730 d (RELATÓRIO — expurgo exige aviso
 * prévio ao usuário, decisão de produto pendente), logs 30 d, tokens até revogação (+30 d), exports 7 d, analytics pseudonimizado: transacional 180 d, warehouse anonimizado após 24 m
 * (warehouse/anonymize_24m.sql).
 */
export const RETENTION_POLICY = { rawSceneVideoDays: 90, finalVideoDays: { free: 365, pro: 730, business: 730 }, logsDays: 30, exportDays: 7, revokedTokenGraceDays: 30, analyticsTransactionalDays: 180, warehouseAnonymizeMonths: 24, aiCacheDays: 90, unconfirmedSubscriberDays: 7, incidentsYears: 3 } as const;
export async function runPolicyRetention(o: { dryRun?: boolean } = {}): Promise<Record<string, unknown>> {
  const dry = !!o.dryRun; const del = async (sql: string, params: unknown[] = []) => { if (dry) return (await pool.query(`SELECT count(*)::int n FROM (${sql.replace(/^DELETE FROM (\w+)( \w+)? (WHERE .*)$/s, 'SELECT 1 FROM $1$2 $3')}) q`, params).catch(() => ({ rows: [{ n: 0 }] }))).rows[0].n as number; return (await pool.query(sql, params)).rowCount ?? 0; };
  const base = dry ? {} : await runRetention();
  const extra = {
    refreshTokens: await del(`DELETE FROM refresh_tokens WHERE (expires_at < now() - interval '${RETENTION_POLICY.revokedTokenGraceDays} days') OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '${RETENTION_POLICY.revokedTokenGraceDays} days')`),
    exportsExpired: await del(`DELETE FROM data_export_requests WHERE expires_at IS NOT NULL AND expires_at < now() - interval '1 day'`),
    unconfirmedSubscribers: await del(`DELETE FROM status_subscribers WHERE NOT confirmed AND created_at < now() - interval '${RETENTION_POLICY.unconfirmedSubscriberDays} days'`),
    sloSamples: await del(`DELETE FROM slo_samples WHERE ts < now() - interval '95 days'`),
    aiCache: await del(`DELETE FROM ai_scene_cache c WHERE c.created_at < now() - interval '${RETENTION_POLICY.aiCacheDays} days' OR NOT EXISTS (SELECT 1 FROM projects p WHERE c.video_key LIKE 'projects/' || p.id::text || '/%')`),
    oncallPages: await del(`DELETE FROM oncall_pages WHERE paged_at < now() - interval '2 years'`),
  };
  const eligible = {
    finalVideosFree: (await pool.query(`SELECT count(*)::int n FROM projects p JOIN users u ON u.id=p.user_id WHERE p.final_video_url IS NOT NULL AND u.plan='free' AND p.created_at < now() - interval '${RETENTION_POLICY.finalVideoDays.free} days'`)).rows[0].n as number,
    finalVideosPaid: (await pool.query(`SELECT count(*)::int n FROM projects p JOIN users u ON u.id=p.user_id WHERE p.final_video_url IS NOT NULL AND u.plan IN ('pro','business') AND p.created_at < now() - interval '${RETENTION_POLICY.finalVideoDays.pro} days'`)).rows[0].n as number,
    rawScenesPastLifecycle: (await pool.query(`SELECT count(*)::int n FROM scenes s JOIN projects p ON p.id=s.project_id WHERE s.video_url IS NOT NULL AND p.created_at < now() - interval '${RETENTION_POLICY.rawSceneVideoDays} days'`)).rows[0].n as number,
  };
  const results = { dryRun: dry, ...base, ...extra, eligibleForExpiryReportOnly: eligible }; await pool.query(`INSERT INTO retention_runs (dry_run, results) VALUES ($1,$2)`, [dry, JSON.stringify(results)]); return results;
}
