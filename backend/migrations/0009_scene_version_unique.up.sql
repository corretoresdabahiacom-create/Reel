-- migrate:no-transaction
-- Módulo 0, parte 2: índices e validações SEM bloquear escritas em `scenes` (RFC 2026-01, risco "volume alto").
-- Roda fora de transação (CREATE INDEX CONCURRENTLY exige). Cada "-- step" é um comando. É idempotente: se cair no
-- meio (timeout, deploy interrompido), basta rodar `npm run migrate` de novo — índices de construção com nome
-- *_build são descartados e refeitos, e as trocas de constraint são atômicas (um único bloco DO).
SET lock_timeout = '5s'
-- step: índice parcial do vínculo com a cena de origem
DROP INDEX CONCURRENTLY IF EXISTS scenes_derived_build
-- step
CREATE INDEX CONCURRENTLY scenes_derived_build ON scenes (derived_from_scene_id) WHERE derived_from_scene_id IS NOT NULL
-- step
DO $$ BEGIN IF to_regclass('public.idx_scenes_derived_from') IS NULL THEN ALTER INDEX scenes_derived_build RENAME TO idx_scenes_derived_from; END IF; END $$
-- step
DROP INDEX CONCURRENTLY IF EXISTS scenes_derived_build
-- step: índice do encadeamento (chained_from_scene_id). Faltava desde a 0001: sem ele, apagar uma cena ou um projeto
-- varre a tabela inteira para cada cena apagada (ON DELETE SET NULL). Achado no teste de volume do Módulo 0.
DROP INDEX CONCURRENTLY IF EXISTS scenes_chained_build
-- step
CREATE INDEX CONCURRENTLY scenes_chained_build ON scenes (chained_from_scene_id) WHERE chained_from_scene_id IS NOT NULL
-- step
DO $$ BEGIN IF to_regclass('public.idx_scenes_chained_from') IS NULL THEN ALTER INDEX scenes_chained_build RENAME TO idx_scenes_chained_from; END IF; END $$
-- step
DROP INDEX CONCURRENTLY IF EXISTS scenes_chained_build
-- step: nova unicidade (project_id, index, version), construída sem travar e anexada como constraint
DROP INDEX CONCURRENTLY IF EXISTS scenes_piv_build
-- step
CREATE UNIQUE INDEX CONCURRENTLY scenes_piv_build ON scenes (project_id, index, version)
-- step: troca atômica (lock curto, sem varredura: o índice já existe)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scenes_project_index_version_key') THEN
    ALTER TABLE scenes ADD CONSTRAINT scenes_project_index_version_key UNIQUE USING INDEX scenes_piv_build;
  END IF;
  ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_project_id_index_key;
END $$
-- step
DROP INDEX CONCURRENTLY IF EXISTS scenes_piv_build
-- step: validação das constraints NOT VALID da 0008 (SHARE UPDATE EXCLUSIVE: leituras e escritas continuam)
ALTER TABLE scenes VALIDATE CONSTRAINT scenes_version_check
-- step
ALTER TABLE scenes VALIDATE CONSTRAINT scenes_derived_from_scene_id_fkey
-- step
ALTER TABLE consents VALIDATE CONSTRAINT consents_type_check
-- step
RESET lock_timeout
