-- NexusReel — schema inicial (Fase 6). Postgres 16.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS "uuid-ossp"; EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'uuid-ossp indisponível; usando gen_random_uuid()'; END $$;

CREATE TYPE plan_t AS ENUM ('free','pro','business');
CREATE TYPE platform_t AS ENUM ('tiktok','youtube','instagram','shopee','temu','olx','mercadolivre');
CREATE TYPE ref_mode_t AS ENUM ('product','person','both');
CREATE TYPE job_status_t AS ENUM ('pending','queued','running','completed','failed','cancelled');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  password_hash text,
  locale text NOT NULL DEFAULT 'pt-BR' CHECK (locale IN ('pt-BR','en','es')),
  region text NOT NULL DEFAULT 'LATAM' CHECK (region IN ('LATAM','EU','US')),
  plan plan_t NOT NULL DEFAULT 'free',
  credits integer NOT NULL DEFAULT 30 CHECK (credits >= 0),
  affiliate_balance_cents bigint NOT NULL DEFAULT 0 CHECK (affiliate_balance_cents >= 0),
  marketplace_balance_cents bigint NOT NULL DEFAULT 0 CHECK (marketplace_balance_cents >= 0),
  is_admin boolean NOT NULL DEFAULT false,
  banned boolean NOT NULL DEFAULT false,
  birth_date date,
  totp_secret_enc text,
  totp_enabled boolean NOT NULL DEFAULT false,
  stripe_customer_id text,
  subscription_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deletion_scheduled_for timestamptz
);
CREATE UNIQUE INDEX users_email_uq ON users (lower(email)) WHERE deleted_at IS NULL;

CREATE TABLE auth_identities (
  provider text NOT NULL, provider_user_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, email text,
  PRIMARY KEY (provider, provider_user_id)
);
CREATE INDEX auth_identities_user_idx ON auth_identities (user_id);

CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL, revoked_at timestamptz,
  rotated_from uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

CREATE TABLE api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, prefix text NOT NULL, key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['catalogs:generate'], last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz
);

CREATE TABLE connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform platform_t NOT NULL, handle text, external_user_id text,
  access_token_enc text NOT NULL, refresh_token_enc text, expires_at timestamptz, scope text,
  status text NOT NULL DEFAULT 'connected', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform)
);

CREATE TABLE storyboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL, voice_id text, track_id text, caption_style text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL, script text NOT NULL DEFAULT '',
  source_locale text NOT NULL DEFAULT 'pt-BR',
  storyboard_id uuid REFERENCES storyboards(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','generating','ready','failed')),
  versions text[] NOT NULL DEFAULT ARRAY[]::text[],
  final_video_url text, duration_sec integer, category text, template_id uuid, photo_refs text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX projects_user_created_idx ON projects (user_id, created_at DESC);
CREATE INDEX projects_title_trgm ON projects USING gin (title gin_trgm_ops);
ALTER TABLE storyboards ADD CONSTRAINT storyboards_project_fk FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

CREATE TABLE scenes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  index integer NOT NULL, text text NOT NULL DEFAULT '',
  duration_sec integer NOT NULL DEFAULT 8 CHECK (duration_sec BETWEEN 3 AND 15),
  prompt text NOT NULL DEFAULT '', reference_mode ref_mode_t NOT NULL DEFAULT 'product',
  reference_images text[] NOT NULL DEFAULT ARRAY[]::text[],
  video_url text, last_frame_url text,
  chained_from_scene_id uuid REFERENCES scenes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','done','error')),
  error_message text, retried boolean NOT NULL DEFAULT false, consistency real,
  UNIQUE (project_id, index)
);
CREATE INDEX scenes_project_idx ON scenes (project_id, index);

CREATE TABLE localized_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  locale text NOT NULL, video_url text, subtitles_url text, audio_url text, voice text,
  status text NOT NULL DEFAULT 'pending', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, locale)
);

CREATE TABLE publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform platform_t NOT NULL, locale text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','uploading','processing','published','failed')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  external_id text, external_url text, error text, retry_count integer NOT NULL DEFAULT 0,
  published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX publications_project_platform_idx ON publications (project_id, platform);
CREATE INDEX publications_user_idx ON publications (user_id, created_at DESC);

CREATE TABLE publication_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued', progress real NOT NULL DEFAULT 0, stage text,
  provider_job_id text, queue_job_id text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, description text NOT NULL DEFAULT '', category text NOT NULL DEFAULT 'geral',
  tags text[] NOT NULL DEFAULT ARRAY[]::text[],
  price_credits integer NOT NULL DEFAULT 0 CHECK (price_credits BETWEEN 0 AND 500),
  preview_url text, scene_structure jsonb NOT NULL DEFAULT '[]'::jsonb,
  prompt_hints text[] NOT NULL DEFAULT ARRAY[]::text[],
  voice_id text, track_id text, caption_style text, locale text NOT NULL DEFAULT 'pt-BR',
  rating_avg real NOT NULL DEFAULT 0, rating_count integer NOT NULL DEFAULT 0, usage_count integer NOT NULL DEFAULT 0,
  moderation_status text NOT NULL DEFAULT 'draft' CHECK (moderation_status IN ('draft','pending','approved','rejected')),
  rejection_reason text, moderated_by uuid, moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE INDEX templates_status_idx ON templates (moderation_status, usage_count DESC);
CREATE INDEX templates_name_trgm ON templates USING gin (name gin_trgm_ops);

CREATE TABLE template_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES templates(id),
  buyer_id uuid NOT NULL REFERENCES users(id),
  price_credits integer NOT NULL, creator_share_credits integer NOT NULL DEFAULT 0, fee_credits integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, buyer_id)
);
CREATE TABLE template_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), template_id uuid NOT NULL REFERENCES templates(id),
  user_id uuid NOT NULL REFERENCES users(id), stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5), comment text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (template_id, user_id)
);

CREATE TABLE catalogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL, description text NOT NULL DEFAULT '', niche text NOT NULL DEFAULT '',
  default_template_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE catalog_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), catalog_id uuid NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  name text NOT NULL, description text NOT NULL DEFAULT '', price numeric(12,2) NOT NULL DEFAULT 0,
  category text NOT NULL DEFAULT '', sku text NOT NULL, photo_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','generating','ready','error')), error text,
  UNIQUE (catalog_id, sku)
);
CREATE INDEX catalog_items_catalog_idx ON catalog_items (catalog_id);
CREATE TABLE batch_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('generation','publication')), catalog_id uuid NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  total_items integer NOT NULL DEFAULT 0, completed_items integer NOT NULL DEFAULT 0, failed_items integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','partial','failed','cancelled')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz
);

CREATE TABLE affiliate_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('shopee','mercadolivre')), external_user_id text NOT NULL, token_enc text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (user_id, platform)
);
CREATE TABLE affiliate_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid REFERENCES publications(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('shopee','mercadolivre')),
  original_url text NOT NULL, tracking_url text NOT NULL, price_cents bigint NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0, conversions integer NOT NULL DEFAULT 0, commission_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_links_publication_idx ON affiliate_links (publication_id);
CREATE TABLE affiliate_clicks (
  id bigserial PRIMARY KEY, link_id uuid NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
  ip_hash text NOT NULL, user_agent text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX affiliate_clicks_link_idx ON affiliate_clicks (link_id, created_at);
CREATE TABLE affiliate_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), link_id uuid NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
  order_id text NOT NULL, amount_cents bigint NOT NULL, commission_cents bigint NOT NULL,
  status text NOT NULL DEFAULT 'confirmed', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (link_id, order_id)
);

CREATE TABLE payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  source text NOT NULL DEFAULT 'affiliate' CHECK (source IN ('affiliate','marketplace')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz, processed_by uuid, gateway_ref text, reason text
);
CREATE TABLE transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL, amount_cents bigint NOT NULL, credits_delta integer NOT NULL DEFAULT 0,
  source text NOT NULL, external_ref text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_idx ON transactions (user_id, created_at DESC);
CREATE UNIQUE INDEX transactions_ext_uq ON transactions (source, external_ref) WHERE external_ref IS NOT NULL;

CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('cookies','ai','marketing','terms')), version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, ip_hash text
);
CREATE INDEX consents_user_idx ON consents (user_id, type, accepted_at DESC);
CREATE TABLE data_export_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  storage_key text, download_url text, requested_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz
);
CREATE TABLE deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','cancelled','completed')),
  scheduled_for timestamptz NOT NULL, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feature_flags (
  key text PRIMARY KEY, description text NOT NULL DEFAULT '', enabled boolean NOT NULL DEFAULT true,
  rollout_percent integer NOT NULL DEFAULT 100 CHECK (rollout_percent BETWEEN 0 AND 100),
  regions text[] NOT NULL DEFAULT ARRAY[]::text[], plans text[] NOT NULL DEFAULT ARRAY[]::text[],
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid, action text NOT NULL,
  target_type text, target_id text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id, created_at DESC);
CREATE TABLE ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, project_id uuid, provider text NOT NULL, operation text NOT NULL,
  cost_cents numeric(12,4) NOT NULL DEFAULT 0, latency_ms integer NOT NULL DEFAULT 0, status text NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_user_idx ON ai_usage (user_id, created_at DESC);
CREATE INDEX ai_usage_project_idx ON ai_usage (project_id);
CREATE TABLE webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider text NOT NULL, event_id text NOT NULL, event_type text NOT NULL,
  payload jsonb NOT NULL, processed_at timestamptz, error text, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);
CREATE TABLE generation_logs (
  id bigserial PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, scene_id uuid,
  step text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX generation_logs_project_idx ON generation_logs (project_id, id);
CREATE TABLE analytics_events (
  id bigserial PRIMARY KEY, user_id uuid, name text NOT NULL, props jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE settings (key text PRIMARY KEY, value jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), publication_id uuid REFERENCES publications(id) ON DELETE CASCADE, reporter_id uuid,
  reason text NOT NULL, status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now()
);
