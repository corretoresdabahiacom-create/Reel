-- Reverte 0021: volta às políticas ALL = collab_can(project_id) de 0017 e devolve o GRANT em schema_migrations. Sem perda de dados.
DROP TRIGGER IF EXISTS trg_comments_guard ON comments; DROP FUNCTION IF EXISTS comments_guard();
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['timeline_tracks','timeline_clips','timeline_meta','timeline_snapshots','timeline_ops','comments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (collab_can(project_id)) WITH CHECK (collab_can(project_id))', t || '_collab', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS project_collaborators_read ON project_collaborators;
DROP POLICY IF EXISTS project_collaborators_insert ON project_collaborators;
DROP POLICY IF EXISTS project_collaborators_update ON project_collaborators;
DROP POLICY IF EXISTS project_collaborators_delete ON project_collaborators;
CREATE POLICY project_collaborators_access ON project_collaborators USING (app_bypass() OR user_id = app_uid() OR collab_can(project_id)) WITH CHECK (app_bypass() OR collab_can(project_id));
DROP FUNCTION IF EXISTS collab_can_edit(uuid); DROP FUNCTION IF EXISTS collab_is_owner(uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON schema_migrations TO nexus_app;
