-- Módulo 6 — Assets derivados (GIF, sticker, wallpapers, multimídia automotiva, screensaver). Só acréscimos.
-- Doc: docs/modules/ASSETS.md. Conversões 100% locais (FFmpeg); nada vai a provedor externo.
SET LOCAL lock_timeout = '5s';
CREATE TABLE derived_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('gif','sticker','wallpaper','car','screensaver')),
  device_profile text NULL,                                     -- id em src/config/deviceProfiles.ts ou carProfiles.ts
  file_url text NULL,                                           -- chave no storage (derived/<user_id>/<cache_key>.<ext>); sai só como URL assinada
  size_bytes bigint NULL,
  cache_key text NULL,                                          -- sha256(user_id + source_project_id + hash do vídeo de origem + output_config)
  created_at timestamptz NOT NULL DEFAULT now(),
  output_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed','expired')),
  error_code text NULL, mime text NULL, file_name text NULL, cache_hit boolean NOT NULL DEFAULT false,
  info jsonb NOT NULL DEFAULT '{}'::jsonb,                      -- medidas do arquivo gerado (dimensões, duração, codec)
  expires_at timestamptz NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_derived_assets_user ON derived_assets (user_id, created_at DESC);
CREATE INDEX idx_derived_assets_cache ON derived_assets (user_id, cache_key) WHERE status = 'done';
CREATE INDEX idx_derived_assets_expiry ON derived_assets (expires_at) WHERE status = 'done';
ALTER TABLE derived_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY derived_assets_owner ON derived_assets USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON derived_assets TO nexus_app;
