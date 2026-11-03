-- Módulo 3 — Inserção de elementos (pessoa/animal/objeto) e substituição (cor de roupa, remover objeto). Só acréscimos.
-- Doc: docs/modules/ELEMENTS.md. Tudo atrás de `ff_elements` (desligada).
SET LOCAL lock_timeout = '5s';

-- Elementos inseridos/substituídos registrados na versão da cena que os recebeu. Default '[]' (constante → instantâneo):
-- cenas antigas leem como lista vazia e a API só mostra o campo quando ele não está vazio.
ALTER TABLE scenes ADD COLUMN inserted_elements jsonb NOT NULL DEFAULT '[]'::jsonb;
-- Consentimento person_image: upload opcional de autorização (chave no storage, nunca URL pública).
ALTER TABLE consents ADD COLUMN evidence_url text NULL;

CREATE TABLE element_insertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_scene_id uuid NULL REFERENCES scenes(id) ON DELETE SET NULL,
  derived_scene_id uuid NULL REFERENCES scenes(id) ON DELETE SET NULL,  -- nova linha em scenes (R2)
  action text NOT NULL DEFAULT 'insert' CHECK (action IN ('insert','replace')),
  type text NOT NULL CHECK (type IN ('person','animal','object')),
  mode text NULL CHECK (mode IN ('recolor','remove')),                -- só em action='replace'
  reference_url text NULL,                                            -- foto de referência (inserção)
  description text NOT NULL DEFAULT '',
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  consent_id uuid NULL REFERENCES consents(id) ON DELETE SET NULL,    -- person_image usado (pessoa real)
  result_url text NULL,
  provider text NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_element_insertions_project ON element_insertions (project_id, created_at DESC);

ALTER TABLE element_insertions ENABLE ROW LEVEL SECURITY;
CREATE POLICY element_insertions_owner ON element_insertions
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = element_insertions.project_id AND (p.user_id = app_uid() OR app_bypass())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = element_insertions.project_id AND (p.user_id = app_uid() OR app_bypass())));
GRANT SELECT, INSERT, UPDATE, DELETE ON element_insertions TO nexus_app;
