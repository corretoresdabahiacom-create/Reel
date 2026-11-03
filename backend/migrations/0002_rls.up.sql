-- Defesa em profundidade: RLS owner-based. A aplicação define `SET LOCAL app.user_id` / `app.is_admin` por transação
-- (db/pool.ts → withUser). O papel de aplicação `nexus_app` NÃO é dono das tabelas (RLS se aplica); migrations rodam como dono.
DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'nexus_app') THEN CREATE ROLE nexus_app NOLOGIN; END IF; END $$;
GRANT USAGE ON SCHEMA public TO nexus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexus_app;

CREATE OR REPLACE FUNCTION app_uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION app_is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('app.is_admin', true), '') = 'true' $$;
CREATE OR REPLACE FUNCTION app_system() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT COALESCE(current_setting('app.system', true), '') = 'true' $$;

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY projects_owner ON projects USING (user_id = app_uid() OR app_is_admin() OR app_system()) WITH CHECK (user_id = app_uid() OR app_is_admin() OR app_system());
ALTER TABLE scenes ENABLE ROW LEVEL SECURITY;
CREATE POLICY scenes_owner ON scenes USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = scenes.project_id AND (p.user_id = app_uid() OR app_is_admin() OR app_system())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = scenes.project_id AND (p.user_id = app_uid() OR app_is_admin() OR app_system())));
ALTER TABLE publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY publications_owner ON publications USING (user_id = app_uid() OR app_is_admin() OR app_system()) WITH CHECK (user_id = app_uid() OR app_is_admin() OR app_system());
-- templates: aprovados são públicos para leitura; escrita só do criador/admin
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY templates_read ON templates FOR SELECT USING (moderation_status = 'approved' OR creator_id = app_uid() OR app_is_admin() OR app_system());
CREATE POLICY templates_write ON templates FOR ALL USING (creator_id = app_uid() OR app_is_admin() OR app_system()) WITH CHECK (creator_id = app_uid() OR app_is_admin() OR app_system());
-- Permite que a conexão do app faça `SET LOCAL ROLE nexus_app` (RLS efetivo) dentro de withUser().
DO $$ BEGIN EXECUTE format('GRANT nexus_app TO %I', current_user); END $$;
