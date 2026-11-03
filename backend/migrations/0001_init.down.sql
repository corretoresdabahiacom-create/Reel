DROP TABLE IF EXISTS reports, settings, analytics_events, generation_logs, webhook_events, ai_usage, audit_logs, feature_flags,
  deletion_requests, data_export_requests, consents, transactions, payout_requests, affiliate_conversions, affiliate_clicks,
  affiliate_links, affiliate_accounts, batch_jobs, catalog_items, catalogs, template_reviews, template_purchases, templates,
  publication_jobs, publications, localized_versions, scenes, projects, storyboards, connected_accounts, api_keys,
  refresh_tokens, auth_identities, users CASCADE;
DROP TYPE IF EXISTS job_status_t, ref_mode_t, platform_t, plan_t;
