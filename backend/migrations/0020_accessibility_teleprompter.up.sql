-- Módulo 11 — Acessibilidade (legendas animadas, audiodescrição, transcrição SRT/VTT) + Teleprompter. Só acréscimos.
-- Doc: docs/modules/ACCESSIBILITY_TELEPROMPTER.md
SET LOCAL lock_timeout = '5s';

-- Arquivos de acessibilidade derivados do vídeo (o original nunca muda). Texto (legendas, descrições, transcrição) fica
-- CIFRADO em `content_json` ({"v":1,"enc":"…"}); exportações de transcrição expiram (90 d, TRANSCRIPT_RETENTION_DAYS).
CREATE TABLE accessibility_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('captions_animated','audio_description','transcript_srt','transcript_vtt','transcript_txt')),
  locale text NOT NULL CHECK (locale IN ('pt-BR','en','es')),
  file_url text NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','pending_review','ready','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_video_key text NULL,
  style_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_json jsonb NULL,
  extra_file_url text NULL,
  signature text NULL, sha256 text NULL,
  reviewed_by uuid NULL REFERENCES users(id) ON DELETE SET NULL, reviewed_at timestamptz NULL,
  error_code text NULL,
  expires_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- audiodescrição só fica pronta (exportável) depois de revisão humana
  CONSTRAINT a11y_ad_reviewed CHECK (type <> 'audio_description' OR status <> 'ready' OR reviewed_at IS NOT NULL)
);
CREATE INDEX idx_a11y_project ON accessibility_assets (project_id, type, locale, created_at DESC);
CREATE INDEX idx_a11y_expires ON accessibility_assets (expires_at) WHERE expires_at IS NOT NULL;

-- Teleprompter: o vídeo gravado fica NO APARELHO; `recorded_video_url` só é preenchido quando o usuário envia (opt-in).
CREATE TABLE teleprompter_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  script text NOT NULL CHECK (char_length(script) BETWEEN 1 AND 20000),
  settings_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_video_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  upload_opt_in_at timestamptz NULL,
  recorded_bytes bigint NULL, recorded_mime text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tp_upload_needs_opt_in CHECK (recorded_video_url IS NULL OR upload_opt_in_at IS NOT NULL)
);
CREATE INDEX idx_tp_user ON teleprompter_sessions (user_id, created_at DESC);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['accessibility_assets','teleprompter_sessions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass())', t || '_owner', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO nexus_app', t);
  END LOOP;
END $$;
