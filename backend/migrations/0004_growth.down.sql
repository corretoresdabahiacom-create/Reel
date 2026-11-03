DROP TABLE IF EXISTS fx_rates CASCADE;
ALTER TABLE transactions DROP COLUMN IF EXISTS currency, DROP COLUMN IF EXISTS amount_brl_cents, DROP COLUMN IF EXISTS tax_cents, DROP COLUMN IF EXISTS region, DROP COLUMN IF EXISTS method;
DROP TABLE IF EXISTS erasure_queue, growth_alerts, waitlist_entries, partner_sales, partner_accounts CASCADE;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_partner_fk;
DROP TABLE IF EXISTS attribution_touches, market_expansion, pricing_regions, propensity_scores, ltv_predictions, churn_scores, notification_preferences, notifications, lifecycle_sends, lifecycle_campaigns, device_fingerprints, referrals, recommendation_events, experiment_events, experiment_assignments, experiments CASCADE;
DROP INDEX IF EXISTS analytics_events_event_id_uq, analytics_events_name_time_idx, analytics_events_user_time_idx;
ALTER TABLE analytics_events DROP COLUMN IF EXISTS pseudo_id, DROP COLUMN IF EXISTS anon_id, DROP COLUMN IF EXISTS session_id, DROP COLUMN IF EXISTS schema_version, DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS event_id;
DROP INDEX IF EXISTS users_referral_code_uq, users_last_seen_idx;
ALTER TABLE users DROP COLUMN IF EXISTS churn_risk, DROP COLUMN IF EXISTS rfm_segment, DROP COLUMN IF EXISTS referral_code, DROP COLUMN IF EXISTS referred_by, DROP COLUMN IF EXISTS attribution_source,
  DROP COLUMN IF EXISTS ltv_predicted_cents, DROP COLUMN IF EXISTS country, DROP COLUMN IF EXISTS timezone, DROP COLUMN IF EXISTS onboarding_goal, DROP COLUMN IF EXISTS onboarding_completed_at,
  DROP COLUMN IF EXISTS last_seen_at, DROP COLUMN IF EXISTS partner_id, DROP COLUMN IF EXISTS creator_verified;
