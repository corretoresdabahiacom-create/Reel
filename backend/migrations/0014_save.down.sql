-- Reverte 0014. Recusa se houver conexões ou salvamentos de usuários (tokens e arquivos da Nuvem NexusReel ficariam órfãos).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cloud_connections) OR EXISTS (SELECT 1 FROM destination_exports) THEN
    RAISE EXCEPTION 'rollback 0014 bloqueado: existem conexões de nuvem ou salvamentos de usuários';
  END IF;
END $$;
DROP TABLE IF EXISTS destination_exports;
DROP TABLE IF EXISTS cloud_connections;
