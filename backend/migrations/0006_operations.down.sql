DROP TABLE IF EXISTS oncall_pages, status_subscribers, resilience_exercises, board_reports, data_residency_routes, bcp_scenarios, vendor_contracts, sanctions_checks, kyc_verifications, retention_runs, subprocessors, ai_act_registrations, dpia_records, compliance_ropa, ai_scene_cache, unit_economics, cost_snapshots, status_components, postmortems, incident_updates, incidents, slo_burn_alerts, slo_samples, slo_definitions CASCADE;
ALTER TABLE consents DROP COLUMN IF EXISTS jurisdiction, DROP COLUMN IF EXISTS user_agent_hash, DROP COLUMN IF EXISTS proof_hash;
ALTER TABLE payout_requests DROP COLUMN IF EXISTS first_approver, DROP COLUMN IF EXISTS first_approved_at, DROP COLUMN IF EXISTS hold_reason;
UPDATE users SET locale='es' WHERE locale='es-MX';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_locale_check;
ALTER TABLE users ADD CONSTRAINT users_locale_check CHECK (locale IN ('pt-BR','en','es'));
ALTER TABLE users DROP COLUMN IF EXISTS data_residency_region, DROP COLUMN IF EXISTS kyc_status, DROP COLUMN IF EXISTS sanctions_cleared;
DELETE FROM feature_flags WHERE key IN ('release_freeze','ai_scene_cache','ai_cost_router','ai_kill_switch','kyc_enforced');
DELETE FROM settings WHERE key='ops';
