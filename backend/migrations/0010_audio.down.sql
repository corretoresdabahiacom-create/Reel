-- Reverte 0010. Recusa se já houver mixagens, vozes clonadas ou trilhas geradas por usuários, para não apagar dados em silêncio.
-- Antes: desligue `ff_audio`, exporte/apague esses registros (e os objetos em projects/<id>/audio/) e só então reverta.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM audio_versions) OR EXISTS (SELECT 1 FROM voice_models) OR EXISTS (SELECT 1 FROM music_tracks WHERE owner_user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'rollback 0010 bloqueado: existem dados de áudio de usuários';
  END IF;
END $$;
SET LOCAL lock_timeout = '5s';
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_active_audio_version_fkey;
ALTER TABLE projects DROP COLUMN IF EXISTS active_audio_version_id;
DROP TABLE IF EXISTS audio_versions;
DROP TABLE IF EXISTS voice_models;
DROP TABLE IF EXISTS music_tracks;
ALTER TABLE consents DROP COLUMN IF EXISTS challenge_hash;
