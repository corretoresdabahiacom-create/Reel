-- Módulo 8 — Colaboração + Timeline multi-track. Só acréscimos; a política de `projects` NÃO muda (excluir = só o dono).
-- As tabelas novas liberam o dono do projeto e colaboradores ACEITOS (função collab_can). Doc: docs/modules/COLLABORATION.md
SET LOCAL lock_timeout = '5s';

CREATE TABLE project_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE,          -- preenchido no aceite
  role text NOT NULL CHECK (role IN ('editor','viewer')),             -- o dono é projects.user_id (não fica aqui)
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked','left')),
  invited_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_email_hash text NOT NULL,                                   -- HMAC-SHA256 do e-mail convidado (nunca o e-mail)
  token_hash text NULL,                                               -- sha256 do token do convite; NULL depois do uso (uso único)
  expires_at timestamptz NOT NULL, accepted_at timestamptz NULL, removed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_collab_member ON project_collaborators (project_id, user_id) WHERE status = 'accepted';
CREATE INDEX idx_collab_user ON project_collaborators (user_id) WHERE status = 'accepted';
CREATE INDEX idx_collab_project ON project_collaborators (project_id);

-- Papel do usuário atual no projeto: dono, colaborador aceito, ou nada. SECURITY DEFINER só para ler `projects`
-- (cuja política é só do dono) sem abrir a tabela; devolve apenas um booleano.
CREATE OR REPLACE FUNCTION collab_can(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_bypass() OR EXISTS (SELECT 1 FROM projects WHERE id = p AND user_id = app_uid())
    OR EXISTS (SELECT 1 FROM project_collaborators c WHERE c.project_id = p AND c.user_id = app_uid() AND c.status = 'accepted')
$$;
REVOKE ALL ON FUNCTION collab_can(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION collab_can(uuid) TO nexus_app;

ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;
CREATE POLICY project_collaborators_access ON project_collaborators USING (app_bypass() OR user_id = app_uid() OR collab_can(project_id)) WITH CHECK (app_bypass() OR collab_can(project_id));
GRANT SELECT, INSERT, UPDATE, DELETE ON project_collaborators TO nexus_app;

CREATE TABLE timeline_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('video','audio','text','effect')),
  name text NOT NULL DEFAULT '', position integer NOT NULL DEFAULT 0,
  muted boolean NOT NULL DEFAULT false, locked boolean NOT NULL DEFAULT false, hidden boolean NOT NULL DEFAULT false,
  volume real NOT NULL DEFAULT 1 CHECK (volume BETWEEN 0 AND 2), opacity real NOT NULL DEFAULT 1 CHECK (opacity BETWEEN 0 AND 1),
  version integer NOT NULL DEFAULT 1, updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tracks_project ON timeline_tracks (project_id, position);
CREATE TABLE timeline_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES timeline_tracks(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  start_ms integer NOT NULL CHECK (start_ms >= 0), duration_ms integer NOT NULL CHECK (duration_ms BETWEEN 100 AND 120000),
  source_ref text NULL,                                               -- cena, áudio ou asset de origem (só leitura)
  props jsonb NOT NULL DEFAULT '{}'::jsonb,                           -- texto, estilo, efeito, volume…
  version integer NOT NULL DEFAULT 1, updated_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_clips_track ON timeline_clips (track_id, position);
CREATE INDEX idx_clips_project ON timeline_clips (project_id);

-- Revisão do timeline (incrementa a cada operação) + contador para snapshot automático.
CREATE TABLE timeline_meta (project_id uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE, rev bigint NOT NULL DEFAULT 0, edits_since_snapshot integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
-- Histórico: snapshots automáticos (a cada N edições), manuais e forks de conflito crítico.
CREATE TABLE timeline_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('auto','manual','fork','restore')),
  label text NOT NULL DEFAULT '', rev bigint NOT NULL, data jsonb NOT NULL,
  created_by uuid NULL REFERENCES users(id) ON DELETE SET NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_snapshots_project ON timeline_snapshots (project_id, created_at DESC);
-- Registro de operações (versionamento e auditoria de quem mudou o quê; conflito LWW guarda o valor sobrescrito).
CREATE TABLE timeline_ops (
  id bigserial PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id uuid NULL REFERENCES users(id) ON DELETE SET NULL, rev bigint NOT NULL, op jsonb NOT NULL,
  conflict text NULL CHECK (conflict IN ('lww','critical')), overwritten jsonb NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ops_project ON timeline_ops (project_id, rev);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id uuid NULL REFERENCES users(id) ON DELETE SET NULL,        -- NULL = anonimizado (LGPD)
  time_ms integer NOT NULL CHECK (time_ms >= 0),                      -- âncora no tempo do vídeo
  clip_id uuid NULL REFERENCES timeline_clips(id) ON DELETE SET NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  anonymized boolean NOT NULL DEFAULT false,
  resolved_at timestamptz NULL, resolved_by uuid NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_comments_project ON comments (project_id, time_ms);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['timeline_tracks','timeline_clips','timeline_meta','timeline_snapshots','timeline_ops','comments'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (collab_can(project_id)) WITH CHECK (collab_can(project_id))', t || '_collab', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO nexus_app', t);
  END LOOP;
END $$;
GRANT USAGE, SELECT ON SEQUENCE timeline_ops_id_seq TO nexus_app;
