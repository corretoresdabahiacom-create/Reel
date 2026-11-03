-- Reverte 0007: remove as policies e desliga o RLS nas tabelas cobertas por ela (as 14 da 0002/0004 permanecem).
DROP VIEW IF EXISTS user_public_profiles;
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT p.tablename, p.policyname FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = ANY (ARRAY[
    'ai_usage','api_keys','auth_identities','connected_accounts','consents','data_export_requests','deletion_requests','experiment_events','kyc_verifications',
    'payout_requests','refresh_tokens','sanctions_checks','transactions','affiliate_accounts','affiliate_links','partner_sales','users','catalogs','batch_jobs',
    'catalog_items','localized_versions','storyboards','generation_logs','publication_jobs','affiliate_conversions','affiliate_clicks','template_purchases',
    'template_reviews','reports','analytics_events','attribution_touches','audit_logs','webhook_events','waitlist_entries','status_subscribers','erasure_queue',
    'partner_accounts','oncall_pages','board_reports','dpia_records','incidents','incident_updates','postmortems',
    'settings','feature_flags','pricing_regions','experiments','lifecycle_campaigns','fx_rates','market_expansion','status_components','slo_definitions',
    'ai_scene_cache','data_residency_routes','cost_snapshots','unit_economics','slo_samples','slo_burn_alerts','growth_alerts','retention_runs',
    'subprocessors','vendor_contracts','bcp_scenarios','resilience_exercises','ai_act_registrations','compliance_ropa'])
  LOOP EXECUTE format('DROP POLICY %I ON %I', r.policyname, r.tablename); EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', r.tablename); END LOOP;
END $$;
DROP FUNCTION IF EXISTS app_bypass();
