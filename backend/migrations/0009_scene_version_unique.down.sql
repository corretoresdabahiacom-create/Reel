-- migrate:no-transaction
-- Reverte 0009: volta à unicidade (project_id, index) sem travar a tabela. Recusa se já houver versões > 1
-- (a unicidade antiga não as comporta) — trate os derivados antes (docs/modules/MODULE_0_PREPARATION.md).
SET lock_timeout = '5s'
-- step
DO $$ BEGIN IF EXISTS (SELECT 1 FROM scenes WHERE version > 1) THEN RAISE EXCEPTION 'rollback 0009 bloqueado: existem cenas com version>1'; END IF; END $$
-- step
DROP INDEX CONCURRENTLY IF EXISTS scenes_pi_build
-- step
CREATE UNIQUE INDEX CONCURRENTLY scenes_pi_build ON scenes (project_id, index)
-- step
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scenes_project_id_index_key') THEN
    ALTER TABLE scenes ADD CONSTRAINT scenes_project_id_index_key UNIQUE USING INDEX scenes_pi_build;
  END IF;
  ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_project_index_version_key;
END $$
-- step
DROP INDEX CONCURRENTLY IF EXISTS scenes_pi_build
-- step
DROP INDEX CONCURRENTLY IF EXISTS idx_scenes_derived_from
-- step
DROP INDEX CONCURRENTLY IF EXISTS idx_scenes_chained_from
-- step
RESET lock_timeout
