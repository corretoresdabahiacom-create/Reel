-- Reverte 0013. Recusa se já houver uniões (os projetos resultantes ficam; só o vínculo de origem se perderia).
DO $$ BEGIN IF EXISTS (SELECT 1 FROM project_merges) THEN RAISE EXCEPTION 'rollback 0013 bloqueado: existem uniões de vídeos de usuários'; END IF; END $$;
DROP TABLE IF EXISTS project_merges;
