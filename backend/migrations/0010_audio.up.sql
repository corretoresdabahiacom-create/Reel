-- Módulo 1 — Áudio (música, voz, SFX, mixagem). Só acréscimos: tabelas novas e uma coluna nula em `projects`.
-- Doc: docs/modules/AUDIO.md. Tudo atrás de `ff_audio` (desligada): sem a flag, nada aqui é lido ou gravado.
SET LOCAL lock_timeout = '5s';

-- Biblioteca de trilhas. license_region usa os valores de users.region (LATAM, EU, US) ou '*' (todas). owner_user_id NULL = biblioteca licenciada (visível a todos, filtrada por região);
-- preenchido = trilha gerada por IA para aquele usuário. file_url é uma referência de storage ou `builtin:<preset>`.
CREATE TABLE music_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, mood text NOT NULL, genre text NOT NULL,
  bpm integer NOT NULL CHECK (bpm BETWEEN 40 AND 220),
  duration integer NOT NULL CHECK (duration BETWEEN 5 AND 600),
  license_region text[] NOT NULL DEFAULT ARRAY['*']::text[],
  file_url text NOT NULL,
  owner_user_id uuid NULL REFERENCES users(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'library' CHECK (source IN ('library','generated')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_music_tracks_filters ON music_tracks (mood, genre, bpm) WHERE owner_user_id IS NULL;
CREATE INDEX idx_music_tracks_owner ON music_tracks (owner_user_id, created_at DESC) WHERE owner_user_id IS NOT NULL;

-- Modelos de voz clonada: sempre ligados a um consentimento voice_clone verificado. Revogar o consentimento apaga o modelo.
CREATE TABLE voice_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_id uuid NOT NULL REFERENCES consents(id) ON DELETE CASCADE,
  provider text NOT NULL, provider_voice_id text NOT NULL,
  status text NOT NULL DEFAULT 'ready' CHECK (status IN ('ready','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz NULL
);
CREATE INDEX idx_voice_models_user ON voice_models (user_id) WHERE status = 'ready';

-- Desafio do consentimento de voz: hash da frase única que o usuário lê na amostra (a frase em claro não é guardada).
ALTER TABLE consents ADD COLUMN challenge_hash text NULL;

-- Versões de áudio de um projeto. O vídeo final original nunca é tocado (R2): cada mixagem gera mídia nova.
-- Os três stems ficam em colunas separadas (não há coluna única `stems_url`).
CREATE TABLE audio_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  scene_id uuid NULL REFERENCES scenes(id) ON DELETE SET NULL,
  source_video_key text NOT NULL,
  music_track_id uuid NULL REFERENCES music_tracks(id) ON DELETE SET NULL,
  voice_source text NOT NULL DEFAULT 'original' CHECK (voice_source IN ('original','clone','none')),
  voice_model_id uuid NULL REFERENCES voice_models(id) ON DELETE SET NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  sfx_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  voice_url text NULL, music_url text NULL, sfx_url text NULL,
  voice_stem_url text NULL, music_stem_url text NULL, sfx_stem_url text NULL,
  mixed_url text NULL, video_url text NULL,
  loudness_lufs real NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','done','failed')),
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audio_versions_project ON audio_versions (project_id, created_at DESC);

-- Versão de áudio ativa (NULL = áudio original). Coluna nula e FK NOT VALID: não varre `projects` nem bloqueia escritas.
ALTER TABLE projects ADD COLUMN active_audio_version_id uuid NULL;
ALTER TABLE projects ADD CONSTRAINT projects_active_audio_version_fkey
  FOREIGN KEY (active_audio_version_id) REFERENCES audio_versions(id) ON DELETE SET NULL NOT VALID;

-- RLS (fail-closed, mesmo modelo da 0007)
ALTER TABLE music_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY music_tracks_read ON music_tracks FOR SELECT USING (owner_user_id IS NULL OR owner_user_id = app_uid() OR app_bypass());
CREATE POLICY music_tracks_write ON music_tracks FOR ALL USING (app_bypass()) WITH CHECK (app_bypass());
ALTER TABLE voice_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY voice_models_owner ON voice_models USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass());
ALTER TABLE audio_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY audio_versions_owner ON audio_versions
  USING (EXISTS (SELECT 1 FROM projects p WHERE p.id = audio_versions.project_id AND (p.user_id = app_uid() OR app_bypass())))
  WITH CHECK (EXISTS (SELECT 1 FROM projects p WHERE p.id = audio_versions.project_id AND (p.user_id = app_uid() OR app_bypass())));
GRANT SELECT, INSERT, UPDATE, DELETE ON music_tracks, voice_models, audio_versions TO nexus_app;

-- Biblioteca inicial: faixas SINTÉTICAS de demonstração (geradas por FFmpeg no primeiro uso, sem direitos de terceiros).
-- O catálogo licenciado real entra por importação administrativa, com license_region por contrato.
INSERT INTO music_tracks (title, mood, genre, bpm, duration, license_region, file_url) VALUES
 ('Manhã Clara (demo)',       'upbeat',    'pop',        120, 60, ARRAY['*'],             'builtin:upbeat'),
 ('Vitrine (demo)',           'corporate', 'corporate',  110, 60, ARRAY['*'],             'builtin:corporate'),
 ('Pulso (demo)',             'energetic', 'electronic', 128, 60, ARRAY['*'],             'builtin:energetic'),
 ('Fim de Tarde (demo)',      'calm',      'ambient',     72, 60, ARRAY['*'],             'builtin:calm'),
 ('Lembrança (demo)',         'emotional', 'piano',       80, 60, ARRAY['*'],             'builtin:emotional'),
 ('Brincadeira (demo)',       'fun',       'pop',        100, 60, ARRAY['*'],             'builtin:fun'),
 ('Estúdio Lo-fi (demo)',     'calm',      'lofi',        85, 60, ARRAY['LATAM'],         'builtin:lofi'),
 ('Grande Final (demo)',      'epic',      'cinematic',   90, 60, ARRAY['US','EU'],       'builtin:epic');
