-- Reverte 0008. Recusa reverter se já houver dados que dependem dela (cena derivada ou consentimento de tipo novo),
-- para não apagar nada em silêncio: nesse caso, desligue as flags e trate os dados antes (docs/modules/MODULE_0_PREPARATION.md).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM scenes WHERE version > 1 OR derived_from_scene_id IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback 0008 bloqueado: existem cenas derivadas (version>1)';
  END IF;
  IF EXISTS (SELECT 1 FROM consents WHERE type NOT IN ('cookies','ai','marketing','terms')) THEN
    RAISE EXCEPTION 'rollback 0008 bloqueado: existem consentimentos dos tipos novos';
  END IF;
END $$;

DELETE FROM feature_flags WHERE key IN ('ff_audio','ff_background','ff_elements','ff_merge','ff_save','ff_assets','ff_email',
  'ff_collaboration','ff_timeline','ff_transcript','ff_agent','ff_insights','ff_series','ff_seal','ff_live','ff_accessibility','ff_teleprompter');

ALTER TABLE consents DROP CONSTRAINT consents_type_check;
ALTER TABLE consents ADD CONSTRAINT consents_type_check CHECK (type IN ('cookies','ai','marketing','terms'));
ALTER TABLE consents DROP COLUMN verified_at, DROP COLUMN audio_sample_url;

DROP INDEX IF EXISTS idx_scenes_derived_from;
ALTER TABLE scenes DROP COLUMN derived_from_scene_id, DROP COLUMN version;
