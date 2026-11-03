-- Camada RAW do warehouse (contrato de carga). Em produção estas tabelas vivem no BigQuery (dataset `nexusreel_raw`);
-- localmente (Postgres) servem para validar o dbt. NENHUMA coluna contém user_id/e-mail: só `pseudo_id` (HMAC com sal).
-- Cada tabela é recarregada por snapshot completo (dimensões) ou incrementalmente (events); o staging deduplica.
CREATE SCHEMA IF NOT EXISTS raw;

CREATE TABLE IF NOT EXISTS raw.events (
  event_id text NOT NULL, pseudo_id text, anon_id text, session_id text, name text NOT NULL, props jsonb NOT NULL DEFAULT '{}'::jsonb,
  schema_version smallint NOT NULL DEFAULT 1, source text NOT NULL DEFAULT 'client', occurred_at timestamptz NOT NULL, _loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS raw_events_name_time ON raw.events (name, occurred_at);

CREATE TABLE IF NOT EXISTS raw.users (
  pseudo_id text NOT NULL, created_at timestamptz NOT NULL, plan text, region text, country text, locale text, attribution_source text, partner_id text,
  creator_verified boolean, churn_risk real, rfm_segment text, onboarding_goal text, referred boolean, snapshot_at timestamptz NOT NULL DEFAULT now(), _loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS raw.transactions (
  tx_id text NOT NULL, pseudo_id text, type text NOT NULL, amount_cents bigint, amount_brl_cents bigint, currency text, tax_cents bigint, region text, method text, source text,
  credits_delta integer, created_at timestamptz NOT NULL, _loaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS raw.projects (project_id text NOT NULL, pseudo_id text, status text, category text, template_id text, created_at timestamptz NOT NULL, _loaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS raw.publications (publication_id text NOT NULL, pseudo_id text, project_id text, platform text, status text, published_at timestamptz, created_at timestamptz NOT NULL, _loaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS raw.ai_usage (usage_id text NOT NULL, pseudo_id text, provider text, operation text, cost_cents numeric(12,4), status text, created_at timestamptz NOT NULL, _loaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS raw.experiment_assignments (experiment_key text NOT NULL, pseudo_id text NOT NULL, variant text NOT NULL, assigned_at timestamptz NOT NULL, exposed_at timestamptz, _loaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS raw.referrals (referral_id text NOT NULL, referrer_pseudo text, referred_pseudo text, status text, created_at timestamptz NOT NULL, signed_up_at timestamptz, activated_at timestamptz, reward_granted_at timestamptz, _loaded_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS raw.template_purchases (purchase_id text NOT NULL, template_id text, buyer_pseudo text, creator_pseudo text, price_credits integer, fee_credits integer, created_at timestamptz NOT NULL, _loaded_at timestamptz NOT NULL DEFAULT now());
