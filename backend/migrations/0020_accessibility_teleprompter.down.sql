-- Reverte 0020. Recusa se houver arquivos de acessibilidade ou sessões de teleprompter de usuários.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM accessibility_assets) OR EXISTS (SELECT 1 FROM teleprompter_sessions) THEN
    RAISE EXCEPTION 'rollback 0020 bloqueado: existem arquivos de acessibilidade ou sessões de teleprompter de usuários'; END IF;
END $$;
DROP TABLE IF EXISTS teleprompter_sessions, accessibility_assets;
