-- Módulo 10 — Inteligência preditiva + seriado + selo de autenticidade (C2PA) + live commerce. Só acréscimos.
-- Doc: docs/modules/INSIGHTS_SERIES_SEAL_LIVE.md
SET LOCAL lock_timeout = '5s';

-- Predições: só features AGREGADAS (números/booleanos, sem texto nem PII) e o rótulo "estimativa" fixo (AI Act).
CREATE TABLE predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  score_retention smallint NOT NULL CHECK (score_retention BETWEEN 0 AND 100),
  score_ctr smallint NOT NULL CHECK (score_ctr BETWEEN 0 AND 100),
  score_conversion smallint NOT NULL CHECK (score_conversion BETWEEN 0 AND 100),
  suggestions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  features_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_version text NOT NULL,
  label text NOT NULL DEFAULT 'estimativa' CHECK (label = 'estimativa')
);
CREATE INDEX idx_predictions_project ON predictions (project_id, created_at DESC);

-- Séries (mininovelas): episódios = projetos, em ordem, com CTA por capítulo.
CREATE TABLE series (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  template text NOT NULL DEFAULT 'mininovela' CHECK (template IN ('mininovela','tutorial','lancamento','livre')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_series_user ON series (user_id, created_at DESC);
CREATE TABLE series_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id uuid NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "order" integer NOT NULL CHECK ("order" >= 1),
  cta_url text NULL CHECK (cta_url IS NULL OR cta_url ~ '^https://'),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cta_label text NULL CHECK (cta_label IS NULL OR char_length(cta_label) <= 60),
  recap_text text NULL CHECK (recap_text IS NULL OR char_length(recap_text) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT series_episodes_order_key UNIQUE (series_id, "order") DEFERRABLE INITIALLY IMMEDIATE,
  CONSTRAINT series_episodes_project_key UNIQUE (series_id, project_id)
);
CREATE INDEX idx_series_episodes_project ON series_episodes (project_id);

-- Selo de autenticidade: o manifest C2PA é EMBUTIDO no MP4 (verify_url fica NULL; só existiria para manifest remoto).
CREATE TABLE authenticity_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  c2pa_manifest_embedded boolean NOT NULL DEFAULT false,
  verify_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
  error_code text NULL,
  source_video_key text NOT NULL, signed_video_key text NULL,
  manifest_label text NULL, signed_sha256 text NULL, signer_subject text NULL, seal_text text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT authenticity_done_embedded CHECK (status <> 'done' OR (c2pa_manifest_embedded AND signed_video_key IS NOT NULL))
);
CREATE INDEX idx_authenticity_project ON authenticity_records (project_id, created_at DESC);

-- Live commerce com avatar de IA (B2B). Rótulo "IA" é OBRIGATÓRIO (CHECK) e o opt-in do lojista também.
CREATE TABLE live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  catalog_id uuid NOT NULL REFERENCES catalogs(id) ON DELETE CASCADE,
  avatar_config jsonb NOT NULL,
  ai_label_enabled boolean NOT NULL DEFAULT true CHECK (ai_label_enabled = true),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','live','ended')),
  started_at timestamptz NULL, ended_at timestamptz NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  disclosure_text text NOT NULL CHECK (char_length(disclosure_text) BETWEEN 10 AND 400),
  merchant_opt_in_at timestamptz NOT NULL,
  label_impressions bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_live_sessions_owner ON live_sessions (owner_id, created_at DESC);
CREATE TABLE live_session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('created','ai_disclosure_shown','started','product_shown','stopped')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_live_events_session ON live_session_events (session_id, created_at);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['predictions','series','series_episodes','authenticity_records'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass())', t || '_owner', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO nexus_app', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['live_sessions','live_session_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (owner_id = app_uid() OR app_bypass()) WITH CHECK (owner_id = app_uid() OR app_bypass())', t || '_owner', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO nexus_app', t);
  END LOOP;
END $$;
