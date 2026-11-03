-- Módulo 5 — Salvamento (aparelho, pasta local, nuvem do usuário, Nuvem NexusReel, ZIP em lote). Só acréscimos.
-- Doc: docs/modules/SAVE.md. Nome `destination_exports` (e não export_jobs) para não confundir com `data_export_requests` (LGPD).
SET LOCAL lock_timeout = '5s';

-- Conexões OAuth com nuvens do usuário. Tokens só cifrados (envelope AES-256-GCM, chave de dados gerada pelo KMS);
-- nunca saem do servidor. Revogar = DELETE da linha (os tokens deixam de existir no banco).
CREATE TABLE cloud_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google_drive','dropbox','onedrive')),
  access_token_enc text NOT NULL,
  refresh_token_enc text NULL,
  expires_at timestamptz NULL,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  kms_key_id text NOT NULL,                                     -- chave mestra (KMS) que embrulhou as chaves de dados
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','expired')),
  refresh_count integer NOT NULL DEFAULT 0, rotated_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
ALTER TABLE cloud_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY cloud_connections_owner ON cloud_connections USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON cloud_connections TO nexus_app;

-- Cada salvamento (um vídeo ou um ZIP de produto) para um destino.
CREATE TABLE destination_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  destination text NOT NULL CHECK (destination IN ('device','local_folder','icloud','google_drive','dropbox','onedrive','nexus_cloud')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed','expired','deleted')),
  external_url text NULL,                                       -- link do arquivo na nuvem do usuário (nunca um token)
  error text NULL,                                              -- só o código do erro (sem PII)
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL DEFAULT 'video' CHECK (kind IN ('video','zip')),
  batch_id uuid NULL, catalog_id uuid NULL REFERENCES catalogs(id) ON DELETE SET NULL, catalog_item_id uuid NULL REFERENCES catalog_items(id) ON DELETE SET NULL,
  file_name text NULL, storage_key text NULL,                   -- storage_key: arquivo no bucket `archive` (Nuvem NexusReel / ZIP para baixar)
  bytes bigint NULL, sha256 text NULL, expires_at timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_destination_exports_user ON destination_exports (user_id, created_at DESC);
CREATE INDEX idx_destination_exports_batch ON destination_exports (batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX idx_destination_exports_expiry ON destination_exports (expires_at) WHERE storage_key IS NOT NULL AND status = 'done';
ALTER TABLE destination_exports ENABLE ROW LEVEL SECURITY;
CREATE POLICY destination_exports_owner ON destination_exports USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON destination_exports TO nexus_app;
