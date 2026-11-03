-- Reverte 0017. Recusa se houver colaboração, timeline ou comentários de usuários.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM project_collaborators) OR EXISTS (SELECT 1 FROM timeline_tracks) OR EXISTS (SELECT 1 FROM comments) THEN
    RAISE EXCEPTION 'rollback 0017 bloqueado: existem colaboradores, timeline ou comentários de usuários';
  END IF;
END $$;
DROP TABLE IF EXISTS comments, timeline_ops, timeline_snapshots, timeline_meta, timeline_clips, timeline_tracks, project_collaborators;
DROP FUNCTION IF EXISTS collab_can(uuid);
