-- Módulo 2 — Edição de fundo (remoção, troca, outpainting). Só acréscimos. Doc: docs/modules/BACKGROUND.md
-- Tudo atrás de `ff_background` (desligada): sem a flag, nada aqui é gravado e `scenes.selected` fica false em todas as linhas.
SET LOCAL lock_timeout = '5s';

-- Escolha manual da versão em uso de uma cena (seletor de versões / "reverter"). Só metadado: nenhuma mídia muda.
-- Leitura (projectsRepo.scenes): por posição, a versão marcada; sem marcação, a de maior número. Com tudo false = igual a antes.
-- ADD COLUMN com default constante é instantâneo (não reescreve a tabela).
ALTER TABLE scenes ADD COLUMN selected boolean NOT NULL DEFAULT false;

CREATE TABLE background_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id uuid NULL REFERENCES scenes(id) ON DELETE SET NULL,           -- cena de origem
  operation text NOT NULL CHECK (operation IN ('remove','replace','outpaint')),
  target text NOT NULL DEFAULT 'video' CHECK (target IN ('video','photo')),
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_media_url text NOT NULL,
  result_media_url text NULL,
  result_alpha_url text NULL,                                             -- remoção: versão com transparência (PNG/WebM)
  derived_scene_id uuid NULL REFERENCES scenes(id) ON DELETE SET NULL,   -- nova linha em scenes (R2)
  provider text NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_background_edits_scene ON background_edits (project_id, created_at DESC);

ALTER TABLE background_edits ENABLE ROW LEVEL SECURITY;
CREATE POLICY background_edits_owner ON background_edits
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = background_edits.project_id AND (p.user_id = app_uid() OR app_bypass())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = background_edits.project_id AND (p.user_id = app_uid() OR app_bypass())));
GRANT SELECT, INSERT, UPDATE, DELETE ON background_edits TO nexus_app;
