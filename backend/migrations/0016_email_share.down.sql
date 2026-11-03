-- Reverte 0016. Recusa se houver envios (links já entregues deixariam de ter registro de auditoria).
DO $$ BEGIN IF EXISTS (SELECT 1 FROM email_shares) THEN RAISE EXCEPTION 'rollback 0016 bloqueado: existem envios por e-mail de usuários'; END IF; END $$;
DROP TABLE IF EXISTS email_shares;
