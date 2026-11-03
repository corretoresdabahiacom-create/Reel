-- Estúdio de voz (instalação gratuita): voz aberta escolhida, narração gravada pelo usuário e música (composta pelo app,
-- enviada pelo usuário ou de biblioteca livre CC0). Só acréscimos; tudo atrás de `ff_voice_studio` (desligada).
SET LOCAL lock_timeout = '5s';

INSERT INTO feature_flags (key, description, enabled, rollout_percent, regions, plans) VALUES
 ('ff_voice_studio','Estúdio de voz: escolher voz, gravar narração, música própria/composta/CC0',false,0,'{}','{}')
ON CONFLICT (key) DO NOTHING;

-- Música: licença e crédito guardados com a faixa (CC0/domínio público/CC BY importadas, ou declaração do usuário no envio).
ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS license text NULL;
ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS attribution text NULL;
ALTER TABLE music_tracks ADD COLUMN IF NOT EXISTS source_url text NULL;
-- 'upload' = música enviada pelo próprio usuário (só ele vê, pelo RLS de owner_user_id). Só amplia a regra existente.
ALTER TABLE music_tracks DROP CONSTRAINT IF EXISTS music_tracks_source_check;
ALTER TABLE music_tracks ADD CONSTRAINT music_tracks_source_check CHECK (source IN ('library','generated','upload')) NOT VALID;
ALTER TABLE music_tracks VALIDATE CONSTRAINT music_tracks_source_check;

-- Narração gravada pelo usuário (já tratada: ruído reduzido e volume padronizado). Transcrição local (Whisper) opcional.
CREATE TABLE IF NOT EXISTS voice_recordings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id uuid NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  duration_sec real NOT NULL CHECK (duration_sec > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_voice_recordings_user ON voice_recordings (user_id, created_at DESC);
ALTER TABLE voice_recordings ENABLE ROW LEVEL SECURITY;
CREATE POLICY voice_recordings_owner ON voice_recordings USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass());
GRANT SELECT, INSERT, UPDATE, DELETE ON voice_recordings TO nexus_app;

-- Escolhas de áudio do projeto, aplicadas na montagem: {narration:{mode,voiceId,recordingId}, music:{trackId,volume}}.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS audio_settings jsonb NULL;
