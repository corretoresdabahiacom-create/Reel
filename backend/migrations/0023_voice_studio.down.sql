-- Reverte 0023. Recusa se houver gravações ou músicas enviadas por usuários (não apaga dados em silêncio).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM voice_recordings) OR EXISTS (SELECT 1 FROM music_tracks WHERE source = 'upload') THEN
    RAISE EXCEPTION 'rollback 0023 bloqueado: existem gravações ou músicas enviadas por usuários';
  END IF;
END $$;
SET LOCAL lock_timeout = '5s';
ALTER TABLE projects DROP COLUMN IF EXISTS audio_settings;
DROP TABLE IF EXISTS voice_recordings;
ALTER TABLE music_tracks DROP CONSTRAINT IF EXISTS music_tracks_source_check;
ALTER TABLE music_tracks ADD CONSTRAINT music_tracks_source_check CHECK (source IN ('library','generated'));
ALTER TABLE music_tracks DROP COLUMN IF EXISTS source_url;
ALTER TABLE music_tracks DROP COLUMN IF EXISTS attribution;
ALTER TABLE music_tracks DROP COLUMN IF EXISTS license;
DELETE FROM feature_flags WHERE key = 'ff_voice_studio';
