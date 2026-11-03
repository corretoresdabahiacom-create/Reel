-- Reverte 0022: remove o índice e a marca de limpeza (os arquivos já apagados não voltam; nenhum outro dado muda).
DROP INDEX IF EXISTS projects_purge_due_idx;
ALTER TABLE projects DROP COLUMN IF EXISTS files_purged_at;
