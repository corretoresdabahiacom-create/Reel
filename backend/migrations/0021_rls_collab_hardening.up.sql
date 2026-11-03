-- Reauditoria 2026-10-21 — endurecimento de RLS na colaboração (Módulo 8) e no controle de migrations.
-- Só troca políticas/privilégios (nenhuma coluna, nenhum dado). Doc: audit/AUDIT_REPORT.md (achados RLS-1..RLS-4).
-- Antes: timeline_* e comments tinham UMA política ALL = collab_can(project_id); qualquer colaborador aceito — inclusive
-- 'viewer' — podia, no nível do banco, editar a timeline, reescrever o histórico (timeline_ops), editar/apagar comentário
-- alheio e criar comentário em nome de outro autor. O app já barrava isso (assertCan), mas o banco não era a 2ª linha.
SET LOCAL lock_timeout = '5s';

-- Dono do projeto (ou contexto de sistema/admin).
CREATE OR REPLACE FUNCTION collab_is_owner(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT app_bypass() OR EXISTS (SELECT 1 FROM projects WHERE id = p AND user_id = app_uid())
$$;
-- Pode EDITAR: dono ou colaborador aceito com papel 'editor' (espelha MATRIX['timeline.edit'] em permissions.ts).
CREATE OR REPLACE FUNCTION collab_can_edit(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT collab_is_owner(p)
    OR EXISTS (SELECT 1 FROM project_collaborators c WHERE c.project_id = p AND c.user_id = app_uid() AND c.status = 'accepted' AND c.role = 'editor')
$$;
REVOKE ALL ON FUNCTION collab_is_owner(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION collab_is_owner(uuid) TO nexus_app;
REVOKE ALL ON FUNCTION collab_can_edit(uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION collab_can_edit(uuid) TO nexus_app;

-- Estrutura da timeline: todos os colaboradores LEEM; só dono/editor ESCREVEM.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['timeline_tracks','timeline_clips','timeline_meta','timeline_snapshots'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_collab', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (collab_can(project_id))', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (collab_can_edit(project_id))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (collab_can_edit(project_id)) WITH CHECK (collab_can_edit(project_id))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (collab_can_edit(project_id))', t || '_delete', t);
  END LOOP;
END $$;

-- Histórico de operações: só acréscimo, sempre em nome de quem está logado; ninguém reescreve nem apaga (só sistema).
DROP POLICY IF EXISTS timeline_ops_collab ON timeline_ops;
CREATE POLICY timeline_ops_read ON timeline_ops FOR SELECT USING (collab_can(project_id));
CREATE POLICY timeline_ops_insert ON timeline_ops FOR INSERT WITH CHECK (app_bypass() OR (collab_can_edit(project_id) AND user_id = app_uid()));
CREATE POLICY timeline_ops_update ON timeline_ops FOR UPDATE USING (app_bypass()) WITH CHECK (app_bypass());
CREATE POLICY timeline_ops_delete ON timeline_ops FOR DELETE USING (app_bypass());

-- Comentários: todos leem e comentam (como si mesmos); editar texto = autor; resolver = autor/dono/editor; apagar = autor ou dono.
DROP POLICY IF EXISTS comments_collab ON comments;
CREATE POLICY comments_read ON comments FOR SELECT USING (collab_can(project_id));
CREATE POLICY comments_insert ON comments FOR INSERT WITH CHECK (app_bypass() OR (collab_can(project_id) AND author_id = app_uid()));
CREATE POLICY comments_update ON comments FOR UPDATE USING (app_bypass() OR (collab_can(project_id) AND (author_id = app_uid() OR collab_can_edit(project_id))))
  WITH CHECK (app_bypass() OR collab_can(project_id));
CREATE POLICY comments_delete ON comments FOR DELETE USING (app_bypass() OR author_id = app_uid() OR collab_is_owner(project_id));
-- Quem não é o autor pode resolver/reabrir, mas não reescrever o texto nem trocar o autor.
CREATE OR REPLACE FUNCTION comments_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT app_bypass() AND (NEW.body IS DISTINCT FROM OLD.body OR NEW.author_id IS DISTINCT FROM OLD.author_id OR NEW.project_id IS DISTINCT FROM OLD.project_id)
     AND OLD.author_id IS DISTINCT FROM app_uid() THEN
    RAISE EXCEPTION 'comment_edit_not_author' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_comments_guard BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION comments_guard();

-- Convites/colaboradores: todos os envolvidos leem; só o DONO convida, altera ou remove (aceite e "sair" rodam como sistema).
DROP POLICY IF EXISTS project_collaborators_access ON project_collaborators;
CREATE POLICY project_collaborators_read ON project_collaborators FOR SELECT USING (app_bypass() OR user_id = app_uid() OR collab_can(project_id));
CREATE POLICY project_collaborators_insert ON project_collaborators FOR INSERT WITH CHECK (collab_is_owner(project_id));
CREATE POLICY project_collaborators_update ON project_collaborators FOR UPDATE USING (collab_is_owner(project_id)) WITH CHECK (collab_is_owner(project_id));
CREATE POLICY project_collaborators_delete ON project_collaborators FOR DELETE USING (collab_is_owner(project_id));

-- Controle de migrations: a role da aplicação não lê nem altera (recebeu por GRANT ... ON ALL TABLES em 0002/0004/0006).
REVOKE ALL ON schema_migrations FROM nexus_app;
