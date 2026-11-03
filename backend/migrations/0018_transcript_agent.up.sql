-- Módulo 9 — Transcrição + edição agêntica. Só acréscimos. Doc: docs/modules/TRANSCRIPT_AGENT.md
-- Transcrição é dado sensível: `segments_json` guarda só o envelope cifrado ({"v":1,"enc":"v1:…"}, AES-256-GCM) e expira (90 d).
SET LOCAL lock_timeout = '5s';
CREATE TABLE transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  language text NOT NULL,
  segments_json jsonb NOT NULL DEFAULT '{}'::jsonb,               -- {"v":1,"enc":"…"}: segmentos + palavras com tempo, CIFRADOS
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_video_key text NOT NULL, source_sha256 text NULL,
  provider text NULL, status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
  error_code text NULL, word_count integer NOT NULL DEFAULT 0, duration_ms integer NULL,
  expires_at timestamptz NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transcripts_project ON transcripts (project_id, created_at DESC);
CREATE INDEX idx_transcripts_expiry ON transcripts (expires_at);

-- Edição pela transcrição (apagar → corte; substituir → TTS no ponto): staging → prévia → aplicar.
CREATE TABLE transcript_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transcript_id uuid NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
  ops_json jsonb NOT NULL,                                           -- operações em tempo (sem o texto da transcrição)
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','previewed','applied','failed','discarded')),
  error_code text NULL, preview_video_key text NULL, result_json jsonb NULL, previous_video_key text NULL,
  applied_at timestamptz NULL, applied_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transcript_edits_project ON transcript_edits (project_id, created_at DESC);

-- Execuções do agente: comando → plano (staging) → prévia → aplicação (só com confirmação).
CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  command text NOT NULL CHECK (char_length(command) BETWEEN 1 AND 500),
  plan_json jsonb NOT NULL,
  applied boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','queued','processing','previewed','applied','failed','discarded')),
  error_code text NULL, preview_video_key text NULL, result_json jsonb NULL, previous_video_key text NULL, applied_at timestamptz NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_agent_runs_project ON agent_runs (project_id, created_at DESC);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['transcripts','transcript_edits','agent_runs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass())', t || '_owner', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO nexus_app', t);
  END LOOP;
END $$;
