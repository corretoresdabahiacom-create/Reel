DELETE FROM experiments WHERE key IN ('onboarding_flow','paywall_price','paywall_trigger_timing','paywall_trial_structure','marketplace_ranking','create_flow_order','push_timing','watermark_free','rec_personalized','referral_reward');
DELETE FROM settings WHERE key='growth';
DELETE FROM feature_flags WHERE key IN ('experiments_enabled','lifecycle_enabled','referral_enabled','recs_personalized','paywall_contextual','waitlist_open');
DELETE FROM lifecycle_campaigns; DELETE FROM market_expansion; DELETE FROM pricing_regions;
DELETE FROM fx_rates;
