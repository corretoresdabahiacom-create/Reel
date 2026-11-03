-- Reverte 0015. Recusa se houver assets de usuários (os arquivos em derived/ ficariam órfãos).
DO $$ BEGIN IF EXISTS (SELECT 1 FROM derived_assets) THEN RAISE EXCEPTION 'rollback 0015 bloqueado: existem assets derivados de usuários'; END IF; END $$;
DROP TABLE IF EXISTS derived_assets;
