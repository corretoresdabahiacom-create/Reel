-- NexusReel — Fase 7 (Growth & Data Science). Totalmente aditiva: só ADD COLUMN / CREATE TABLE.
-- Usuários: colunas de growth (todas anuláveis ou com default → nenhuma tela/rota antiga muda).
ALTER TABLE users
  ADD COLUMN churn_risk real CHECK (churn_risk IS NULL OR churn_risk BETWEEN 0 AND 1),
  ADD COLUMN rfm_segment text,
  ADD COLUMN referral_code text,
  ADD COLUMN referred_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN attribution_source text,
  ADD COLUMN ltv_predicted_cents bigint,
  ADD COLUMN country char(2),
  ADD COLUMN timezone text,
  ADD COLUMN onboarding_goal text CHECK (onboarding_goal IS NULL OR onboarding_goal IN ('sell','audience','test_ai')),
  ADD COLUMN onboarding_completed_at timestamptz,
  ADD COLUMN last_seen_at timestamptz,
  ADD COLUMN partner_id uuid,
  ADD COLUMN creator_verified boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX users_referral_code_uq ON users (referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX users_last_seen_idx ON users (last_seen_at) WHERE deleted_at IS NULL;

-- Transações multi-moeda (preços regionais). `amount_cents` continua na moeda da cobrança; `amount_brl_cents` normaliza para relatórios (NULL em linhas antigas ⇒ BRL).
ALTER TABLE transactions ADD COLUMN currency char(3) NOT NULL DEFAULT 'BRL', ADD COLUMN amount_brl_cents bigint, ADD COLUMN tax_cents bigint NOT NULL DEFAULT 0, ADD COLUMN region text, ADD COLUMN method text;
CREATE TABLE fx_rates (currency char(3) PRIMARY KEY, brl_per_major numeric(14,6) NOT NULL CHECK (brl_per_major > 0), exponent smallint NOT NULL DEFAULT 2, updated_at timestamptz NOT NULL DEFAULT now(), source text NOT NULL DEFAULT 'seed');

-- Analytics: campos para taxonomia versionada, deduplicação e pseudonimização (o warehouse só recebe pseudo_id).
ALTER TABLE analytics_events
  ADD COLUMN pseudo_id text, ADD COLUMN anon_id text, ADD COLUMN session_id text,
  ADD COLUMN schema_version smallint NOT NULL DEFAULT 1, ADD COLUMN source text NOT NULL DEFAULT 'client', ADD COLUMN event_id uuid;
CREATE UNIQUE INDEX analytics_events_event_id_uq ON analytics_events (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX analytics_events_name_time_idx ON analytics_events (name, created_at);
CREATE INDEX analytics_events_user_time_idx ON analytics_events (user_id, created_at) WHERE user_id IS NOT NULL;

-- Experimentação
CREATE TABLE experiments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9_]{3,60}$'),
  name text NOT NULL, hypothesis text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','concluded','archived')),
  variants_json jsonb NOT NULL,                       -- [{key,name,weight}] — a primeira é o controle (fallback seguro)
  primary_metric jsonb NOT NULL,                      -- {type:'conversion'|'mean', event, label?}
  secondary_metrics jsonb NOT NULL DEFAULT '[]'::jsonb,
  guardrails_json jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{metric:'ai_cost_cents'|'event:<nome>', direction:'increase_bad'|'decrease_bad', maxRelativeChange, minHours}]
  target_json jsonb NOT NULL DEFAULT '{}'::jsonb,     -- {plans?, regions?, countries?, newUsersOnly?, signedUpAfter?}
  traffic_pct integer NOT NULL DEFAULT 100 CHECK (traffic_pct BETWEEN 0 AND 100),
  salt text NOT NULL DEFAULT encode(gen_random_bytes(8), 'hex'),
  respects_holdout boolean NOT NULL DEFAULT true,
  baseline_rate real, mde_relative real, alpha real NOT NULL DEFAULT 0.05, power real NOT NULL DEFAULT 0.8, required_per_variant integer,
  conversion_window_days integer NOT NULL DEFAULT 14,
  decision text CHECK (decision IS NULL OR decision IN ('ship','keep_control','iterate','inconclusive')), decision_notes text, winner text, decided_by uuid, decided_at timestamptz,
  guardrail_breach_since timestamptz, paused_reason text,
  start_at timestamptz, end_at timestamptz, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE experiment_assignments (
  id bigserial PRIMARY KEY, experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  variant text NOT NULL, assigned_at timestamptz NOT NULL DEFAULT now(), exposed_at timestamptz,
  UNIQUE (experiment_id, user_id)
);
CREATE INDEX experiment_assignments_user_idx ON experiment_assignments (user_id);
CREATE TABLE experiment_events (
  id bigserial PRIMARY KEY, experiment_id uuid NOT NULL REFERENCES experiments(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event text NOT NULL, value numeric NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX experiment_events_idx ON experiment_events (experiment_id, event, user_id);

-- Recomendação
CREATE TABLE recommendation_events (
  id bigserial PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, surface text NOT NULL, item_type text NOT NULL, item_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('impression','click','use','purchase')), variant text, position integer, request_id uuid, context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recommendation_events_user_idx ON recommendation_events (user_id, created_at DESC);
CREATE INDEX recommendation_events_item_idx ON recommendation_events (item_type, item_id, action);
CREATE INDEX recommendation_events_surface_idx ON recommendation_events (surface, variant, action);

-- Referral
CREATE TABLE referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), referrer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, referred_id uuid REFERENCES users(id) ON DELETE SET NULL,
  code text NOT NULL, status text NOT NULL DEFAULT 'clicked' CHECK (status IN ('clicked','signed_up','activated','rewarded','fraud')),
  device_hash text, ip_hash text, fraud_reason text, utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  reward_granted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), signed_up_at timestamptz, activated_at timestamptz
);
CREATE UNIQUE INDEX referrals_referred_uq ON referrals (referred_id) WHERE referred_id IS NOT NULL;
CREATE INDEX referrals_referrer_idx ON referrals (referrer_id, status);
CREATE TABLE device_fingerprints (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, device_hash text NOT NULL, first_seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, device_hash));
CREATE INDEX device_fingerprints_hash_idx ON device_fingerprints (device_hash);

-- Ciclo de vida e notificações
CREATE TABLE lifecycle_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), key text NOT NULL UNIQUE, description text NOT NULL DEFAULT '', trigger_json jsonb NOT NULL, channel text NOT NULL CHECK (channel IN ('push','email','in_app')),
  template_id text NOT NULL, active boolean NOT NULL DEFAULT true, cooldown_days integer NOT NULL DEFAULT 30, requires_marketing_consent boolean NOT NULL DEFAULT true, priority integer NOT NULL DEFAULT 50
);
CREATE TABLE lifecycle_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES lifecycle_campaigns(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL, status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','suppressed','failed')), suppress_reason text, dedupe_key text NOT NULL UNIQUE,
  sent_at timestamptz NOT NULL DEFAULT now(), opened_at timestamptz, clicked_at timestamptz, converted_at timestamptz
);
CREATE INDEX lifecycle_sends_user_idx ON lifecycle_sends (user_id, sent_at DESC);
CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, channel text NOT NULL CHECK (channel IN ('push','email','in_app')),
  title text NOT NULL, body text NOT NULL, deep_link text, campaign_key text, sent_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz, action_taken text
);
CREATE INDEX notifications_user_idx ON notifications (user_id, sent_at DESC);
CREATE TABLE notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, push boolean NOT NULL DEFAULT true, email boolean NOT NULL DEFAULT true, in_app boolean NOT NULL DEFAULT true,
  quiet_start smallint NOT NULL DEFAULT 22 CHECK (quiet_start BETWEEN 0 AND 23), quiet_end smallint NOT NULL DEFAULT 8 CHECK (quiet_end BETWEEN 0 AND 23),
  preferred_hour smallint CHECK (preferred_hour IS NULL OR preferred_hour BETWEEN 0 AND 23), unsubscribed_all boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);

-- Modelos (churn, LTV, propensão)
CREATE TABLE churn_scores (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, score real NOT NULL CHECK (score BETWEEN 0 AND 1), updated_at timestamptz NOT NULL DEFAULT now(), top_features_json jsonb NOT NULL DEFAULT '[]'::jsonb, model_version text NOT NULL DEFAULT 'fallback', source text NOT NULL DEFAULT 'fallback');
CREATE TABLE ltv_predictions (user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, predicted_ltv_cents bigint NOT NULL, horizon_days integer NOT NULL DEFAULT 365, updated_at timestamptz NOT NULL DEFAULT now(), model_version text NOT NULL DEFAULT 'fallback');
CREATE TABLE propensity_scores (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, target text NOT NULL CHECK (target IN ('upgrade','credits')), score real NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), model_version text NOT NULL DEFAULT 'fallback', PRIMARY KEY (user_id, target));

-- Preços regionais, mercados, parceiros, atribuição, waitlist
CREATE TABLE pricing_regions (
  region text PRIMARY KEY, country_codes text[] NOT NULL, currency char(3) NOT NULL, locale text NOT NULL, plan_pro_price_cents integer NOT NULL, plan_business_price_cents integer NOT NULL,
  credits_price_cents integer NOT NULL,           -- preço de 1 crédito (centavos da moeda local) no pacote base
  credit_packs_json jsonb NOT NULL, tax_pct numeric(5,2) NOT NULL DEFAULT 0, tax_kind text NOT NULL DEFAULT 'none', tax_inclusive boolean NOT NULL DEFAULT false,
  payment_methods text[] NOT NULL, ppp_index numeric(5,2) NOT NULL DEFAULT 1, annual_discount_pct integer NOT NULL DEFAULT 20, active boolean NOT NULL DEFAULT true
);
CREATE TABLE market_expansion (region text PRIMARY KEY, name text NOT NULL, status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','research','beta','launched','paused')), priority integer NOT NULL, launch_date date, locales text[] NOT NULL DEFAULT '{}', kpis_json jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE attribution_touches (
  id bigserial PRIMARY KEY, touch_key text NOT NULL UNIQUE, user_id uuid REFERENCES users(id) ON DELETE CASCADE, anon_id text,
  source text NOT NULL, medium text NOT NULL DEFAULT '', campaign text NOT NULL DEFAULT '', content text NOT NULL DEFAULT '', term text NOT NULL DEFAULT '', landing text,
  first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(), touch_count integer NOT NULL DEFAULT 1,
  CHECK (user_id IS NOT NULL OR anon_id IS NOT NULL)
);
CREATE INDEX attribution_touches_user_idx ON attribution_touches (user_id, first_seen_at);
CREATE INDEX attribution_touches_anon_idx ON attribution_touches (anon_id) WHERE anon_id IS NOT NULL;
CREATE TABLE partner_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_type text NOT NULL CHECK (partner_type IN ('marketplace','agency','influencer','education','mei','ai_platform','integrator','affiliate_external')),
  name text NOT NULL, status text NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','active','paused','terminated')), revenue_share_pct numeric(5,2) NOT NULL DEFAULT 0 CHECK (revenue_share_pct BETWEEN 0 AND 60),
  contact text, contract_ref text, code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_-]{3,40}$'), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD CONSTRAINT users_partner_fk FOREIGN KEY (partner_id) REFERENCES partner_accounts(id) ON DELETE SET NULL;
CREATE TABLE partner_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES partner_accounts(id), user_id uuid NOT NULL REFERENCES users(id), transaction_id uuid NOT NULL UNIQUE REFERENCES transactions(id),
  amount_cents bigint NOT NULL, share_cents bigint NOT NULL, status text NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','paid','void')), created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
);
CREATE INDEX partner_sales_partner_idx ON partner_sales (partner_id, created_at DESC);
CREATE TABLE waitlist_entries (
  id bigserial PRIMARY KEY, email text NOT NULL, locale text NOT NULL DEFAULT 'pt-BR', country char(2), referral_code text NOT NULL UNIQUE, referred_by_code text, utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  bonus_positions integer NOT NULL DEFAULT 0, consent_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','invited','joined')), created_at timestamptz NOT NULL DEFAULT now(), invited_at timestamptz
);
CREATE UNIQUE INDEX waitlist_email_uq ON waitlist_entries (lower(email));

-- Operação: alertas de growth (guardrail pausou experimento, projeção de custo de IA) e fila de eliminação downstream (LGPD → warehouse)
CREATE TABLE growth_alerts (id bigserial PRIMARY KEY, kind text NOT NULL, severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('info','warning','critical')), message text NOT NULL, data jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz);
CREATE INDEX growth_alerts_open_idx ON growth_alerts (kind, created_at DESC) WHERE resolved_at IS NULL;
CREATE TABLE erasure_queue (pseudo_id text PRIMARY KEY, requested_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz);

-- RLS: dados do próprio usuário (notificações, preferências, referral, atribuição, assignments) — mesma convenção da 0002.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['notifications','notification_preferences','experiment_assignments','recommendation_events','device_fingerprints','lifecycle_sends','churn_scores','ltv_predictions','propensity_scores'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (user_id = app_uid() OR app_is_admin() OR app_system()) WITH CHECK (user_id = app_uid() OR app_is_admin() OR app_system())', t || '_owner', t);
  END LOOP;
END $$;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY referrals_party ON referrals USING (referrer_id = app_uid() OR referred_id = app_uid() OR app_is_admin() OR app_system()) WITH CHECK (referrer_id = app_uid() OR referred_id = app_uid() OR app_is_admin() OR app_system());
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexus_app;
