-- Módulo 4 — União de vídeos (2×60 s com transição). Só acréscimos. Doc: docs/modules/MERGE.md
-- Fonte de verdade da origem de um vídeo unido: project_merges.result_project_id (NÃO há campo mergedFrom em projects).
SET LOCAL lock_timeout = '5s';
CREATE TABLE project_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,          -- dono dos dois projetos (conferido no servidor)
  project_a_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_b_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  result_project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  transition_type text NULL,                                             -- escolhida (auto) ou pedida
  transition_requested text NOT NULL DEFAULT 'auto',
  analysis jsonb NOT NULL DEFAULT '{}'::jsonb,                           -- medidas que justificaram a transição
  stage text NOT NULL DEFAULT 'queued', progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
  error_code text NULL, duration_sec real NULL, loudness_lufs real NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (project_a_id <> project_b_id)
);
CREATE INDEX idx_project_merges_user ON project_merges (user_id, created_at DESC);
CREATE INDEX idx_project_merges_result ON project_merges (result_project_id) WHERE result_project_id IS NOT NULL;
ALTER TABLE project_merges ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_merges_owner ON project_merges USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON project_merges TO nexus_app;
