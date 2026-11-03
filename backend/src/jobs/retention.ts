import { pool } from '../db/pool.js';
/** Expurgo diário conforme docs/RETENTION.md (logs de geração 30 d, analytics 180 d, webhooks 60 d, cliques de afiliado 90 d). */
export async function runRetention(): Promise<Record<string, number>> {
  const del = async (sql: string) => (await pool.query(sql)).rowCount ?? 0;
  return {
    generationLogs: await del(`DELETE FROM generation_logs WHERE created_at < now() - interval '30 days'`),
    analytics: await del(`DELETE FROM analytics_events WHERE created_at < now() - interval '180 days'`),
    webhooks: await del(`DELETE FROM webhook_events WHERE created_at < now() - interval '60 days'`),
    notifications: await del(`DELETE FROM notifications WHERE COALESCE(sent_at, now()) < now() - interval '90 days'`),
    lifecycleSends: await del(`DELETE FROM lifecycle_sends WHERE sent_at < now() - interval '180 days'`),
    attributionTouches: await del(`DELETE FROM attribution_touches WHERE last_seen_at < now() - interval '180 days' AND user_id IS NULL`),
    recommendationEvents: await del(`DELETE FROM recommendation_events WHERE created_at < now() - interval '180 days'`),
    experimentEvents: await del(`DELETE FROM experiment_events WHERE created_at < now() - interval '365 days'`),
    deviceFingerprints: await del(`DELETE FROM device_fingerprints WHERE first_seen_at < now() - interval '90 days'`),
    growthAlerts: await del(`DELETE FROM growth_alerts WHERE resolved_at IS NOT NULL AND resolved_at < now() - interval '180 days'`),
    affiliateClicks: await del(`DELETE FROM affiliate_clicks WHERE created_at < now() - interval '90 days'`),
  };
}
