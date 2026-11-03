-- Módulo 7 — Envio por e-mail (link assinado). Só acréscimos. Doc: docs/modules/EMAIL_SHARE.md
-- Destinatários NUNCA em texto: só HMAC-SHA256 (recipients_hash). Senha opcional só como hash argon2id.
SET LOCAL lock_timeout = '5s';
CREATE TABLE email_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asset_id uuid NULL REFERENCES derived_assets(id) ON DELETE SET NULL,   -- asset do Módulo 6, quando o arquivo é um
  recipients_hash text[] NOT NULL DEFAULT ARRAY[]::text[],
  sent_at timestamptz NULL,
  expires_at timestamptz NOT NULL,
  password_hash text NULL,
  access_count integer NOT NULL DEFAULT 0,
  project_id uuid NULL REFERENCES projects(id) ON DELETE SET NULL,
  asset_kind text NOT NULL DEFAULT 'video' CHECK (asset_kind IN ('video','derived_asset','zip')),
  catalog_id uuid NULL REFERENCES catalogs(id) ON DELETE SET NULL, catalog_item_id uuid NULL REFERENCES catalog_items(id) ON DELETE SET NULL, batch_id uuid NULL,
  file_ref text NULL, file_name text NULL,
  sender_name text NOT NULL DEFAULT '', message text NOT NULL DEFAULT '', locale text NOT NULL DEFAULT 'pt-BR',
  recipient_count integer NOT NULL DEFAULT 0, include_self boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('preparing','sent','failed','revoked')),
  last_access_at timestamptz NULL, revoked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (recipient_count BETWEEN 0 AND 21)
);
CREATE INDEX idx_email_shares_user ON email_shares (user_id, created_at DESC);
CREATE INDEX idx_email_shares_batch ON email_shares (batch_id) WHERE batch_id IS NOT NULL;
ALTER TABLE email_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_shares_owner ON email_shares USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON email_shares TO nexus_app;
