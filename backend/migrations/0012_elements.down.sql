-- Reverte 0012. Recusa se já houver inserções, cenas com elementos registrados ou consentimento com evidência enviada.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM element_insertions) OR EXISTS (SELECT 1 FROM scenes WHERE inserted_elements <> '[]'::jsonb)
     OR EXISTS (SELECT 1 FROM consents WHERE evidence_url IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback 0012 bloqueado: existem inserções de elementos de usuários';
  END IF;
END $$;
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS element_insertions;
ALTER TABLE consents DROP COLUMN IF EXISTS evidence_url;
ALTER TABLE scenes DROP COLUMN IF EXISTS inserted_elements;
