-- P0-1 etapa 4 — "Excluir projeto" apaga os arquivos de verdade. Antes, DELETE /projects/:id só marcava deleted_at:
-- vídeo, cenas e fotos ficavam no storage para sempre. Só acrescenta (coluna nula + índice parcial); nenhum dado muda.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS files_purged_at timestamptz;
CREATE INDEX IF NOT EXISTS projects_purge_due_idx ON projects (deleted_at) WHERE deleted_at IS NOT NULL AND files_purged_at IS NULL;
