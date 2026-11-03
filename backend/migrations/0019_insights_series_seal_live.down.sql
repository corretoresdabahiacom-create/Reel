-- Reverte 0019. Recusa se houver séries, selos ou lives de usuários (predições são recalculáveis e não bloqueiam).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM series) OR EXISTS (SELECT 1 FROM authenticity_records) OR EXISTS (SELECT 1 FROM live_sessions) THEN
    RAISE EXCEPTION 'rollback 0019 bloqueado: existem séries, selos de autenticidade ou lives de usuários'; END IF;
END $$;
DROP TABLE IF EXISTS live_session_events, live_sessions, authenticity_records, series_episodes, series, predictions;
