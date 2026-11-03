-- Reverte 0018. Recusa se houver transcrições, edições ou execuções do agente de usuários.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM transcripts) OR EXISTS (SELECT 1 FROM agent_runs) THEN RAISE EXCEPTION 'rollback 0018 bloqueado: existem transcrições ou execuções do agente de usuários'; END IF;
END $$;
DROP TABLE IF EXISTS agent_runs, transcript_edits, transcripts;
