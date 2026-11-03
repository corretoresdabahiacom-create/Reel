-- Módulo 0 — preparação para os 11 módulos pós-lançamento. Só acréscimos; nenhum código de aplicação muda.
-- Doc: docs/modules/MODULE_0_PREPARATION.md · RFC: docs/RFC/2026-01-scene-versioning.md

-- 1) Versionamento de cenas (R2): o original nunca é sobrescrito; derivados entram como linha nova com version+1.
--    Tudo aqui é instantâneo mesmo com muitas linhas: ADD COLUMN com default constante só altera metadados, e as
--    constraints entram NOT VALID (sem varrer a tabela). A validação, o índice e a troca da unicidade ficam na 0009,
--    que roda sem transação e sem bloquear escritas. lock_timeout evita enfileirar atrás de transações longas.
SET LOCAL lock_timeout = '5s';
ALTER TABLE scenes
  ADD COLUMN version integer NOT NULL DEFAULT 1,
  ADD COLUMN derived_from_scene_id uuid NULL;
ALTER TABLE scenes ADD CONSTRAINT scenes_version_check CHECK (version >= 1) NOT VALID;
ALTER TABLE scenes ADD CONSTRAINT scenes_derived_from_scene_id_fkey
  FOREIGN KEY (derived_from_scene_id) REFERENCES scenes(id) ON DELETE SET NULL NOT VALID;

-- 2) Consentimentos de voz, imagem de pessoa, avatar ao vivo e provedor externo (R6).
--    audio_sample_url guarda a CHAVE do objeto no storage (nunca URL pública); a leitura gera URL assinada (R5).
ALTER TABLE consents
  ADD COLUMN audio_sample_url text NULL,
  ADD COLUMN verified_at timestamptz NULL;
ALTER TABLE consents DROP CONSTRAINT consents_type_check;
ALTER TABLE consents ADD CONSTRAINT consents_type_check CHECK (type IN
  ('cookies','ai','marketing','terms','voice_clone','person_image','avatar_live','external_provider')) NOT VALID;

-- 3) Flags dos módulos (R1): todas DESLIGADAS. Os defaults da tabela são enabled=true/100%, por isso explícito.
INSERT INTO feature_flags (key, description, enabled, rollout_percent, regions, plans) VALUES
 ('ff_audio','M1 — áudio (trilha, narração, voz clonada)',false,0,'{}','{}'),
 ('ff_background','M2 — edição de fundo',false,0,'{}','{}'),
 ('ff_elements','M3 — inserção de elementos',false,0,'{}','{}'),
 ('ff_merge','M4 — junção de vídeos',false,0,'{}','{}'),
 ('ff_save','M5 — salvamento e exportação',false,0,'{}','{}'),
 ('ff_assets','M6 — ativos derivados',false,0,'{}','{}'),
 ('ff_email','M7 — compartilhamento por e-mail',false,0,'{}','{}'),
 ('ff_collaboration','M8 — colaboração',false,0,'{}','{}'),
 ('ff_timeline','M8 — timeline',false,0,'{}','{}'),
 ('ff_transcript','M9 — transcrição',false,0,'{}','{}'),
 ('ff_agent','M9 — agente',false,0,'{}','{}'),
 ('ff_insights','M10 — insights',false,0,'{}','{}'),
 ('ff_series','M10 — séries',false,0,'{}','{}'),
 ('ff_seal','M10 — selo de procedência (C2PA)',false,0,'{}','{}'),
 ('ff_live','M10 — ao vivo',false,0,'{}','{}'),
 ('ff_accessibility','M11 — acessibilidade',false,0,'{}','{}'),
 ('ff_teleprompter','M11 — teleprompter',false,0,'{}','{}')
ON CONFLICT (key) DO NOTHING;
