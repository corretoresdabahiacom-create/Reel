-- Reverte 0011. Recusa se já houver edições de fundo ou versão de cena escolhida manualmente (dados de usuário).
-- Antes: desligue `ff_background` e trate esses registros (as cenas derivadas ficam; só o histórico de edição e a escolha somem).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM background_edits) OR EXISTS (SELECT 1 FROM scenes WHERE selected) THEN
    RAISE EXCEPTION 'rollback 0011 bloqueado: existem edições de fundo ou versões escolhidas';
  END IF;
END $$;
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS background_edits;
ALTER TABLE scenes DROP COLUMN IF EXISTS selected;
