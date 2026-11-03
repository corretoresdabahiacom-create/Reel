-- NexusReel — Fase 8 (Operação Contínua & Escala). Totalmente aditiva: só ADD COLUMN / CREATE TABLE / seeds idempotentes.
-- Tabelas operacionais internas: acesso apenas por rotas /admin e jobs (sem RLS por usuário; nexus_app recebe grants como nas demais).

-- Usuários: residência de dados, KYC e sanções (users.region já existe desde a 0001: LATAM|EU|US).
ALTER TABLE users
  ADD COLUMN data_residency_region text NOT NULL DEFAULT 'BR' CHECK (data_residency_region IN ('BR','US','EU','CA')),
  ADD COLUMN kyc_status text NOT NULL DEFAULT 'none' CHECK (kyc_status IN ('none','pending','verified','rejected')),
  ADD COLUMN sanctions_cleared boolean NOT NULL DEFAULT false;
-- Backfill coerente com a região de produto existente (EU→EU, US→US, demais→BR).
UPDATE users SET data_residency_region = CASE region WHEN 'EU' THEN 'EU' WHEN 'US' THEN 'US' ELSE 'BR' END;

-- Locale: ES-MX como locale de primeira classe (pt-BR | en | es | es-MX).
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_locale_check;
ALTER TABLE users ADD CONSTRAINT users_locale_check CHECK (locale IN ('pt-BR','en','es','es-MX'));

-- Payout: segregação de funções (quem solicita ≠ quem aprova; valor alto exige 2 aprovadores distintos) + retenção por KYC/sanções.
ALTER TABLE payout_requests
  ADD COLUMN first_approver uuid, ADD COLUMN first_approved_at timestamptz, ADD COLUMN hold_reason text;

-- SRE ---------------------------------------------------------------------------------------------------------------
CREATE TABLE slo_definitions (
  id text PRIMARY KEY, service text NOT NULL, sli_type text NOT NULL CHECK (sli_type IN ('availability','latency','success_rate','saturation')),
  target numeric(7,5) NOT NULL CHECK (target > 0 AND target < 1), window_days int NOT NULL DEFAULT 30 CHECK (window_days BETWEEN 1 AND 90),
  description text NOT NULL, owner text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
-- Amostras agregadas por minuto (good/total) alimentadas por jobs/métricas; base do cálculo de burn rate no próprio app.
CREATE TABLE slo_samples (
  slo_id text NOT NULL REFERENCES slo_definitions(id) ON DELETE CASCADE, ts timestamptz NOT NULL, good bigint NOT NULL CHECK (good >= 0), total bigint NOT NULL CHECK (total >= good),
  PRIMARY KEY (slo_id, ts)
);
CREATE TABLE slo_burn_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), slo_id text NOT NULL REFERENCES slo_definitions(id) ON DELETE CASCADE,
  alert_window text NOT NULL CHECK (alert_window IN ('1h','6h','3d')), burn_rate numeric(10,3) NOT NULL, severity text NOT NULL CHECK (severity IN ('page','ticket')),
  fired_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz
);
CREATE UNIQUE INDEX slo_burn_alerts_open_uq ON slo_burn_alerts (slo_id, alert_window) WHERE resolved_at IS NULL;

-- Incidentes ----------------------------------------------------------------------------------------------------------
CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), severity text NOT NULL CHECK (severity IN ('sev1','sev2','sev3')), title text NOT NULL,
  status text NOT NULL DEFAULT 'investigating' CHECK (status IN ('investigating','identified','monitoring','resolved')),
  components text[] NOT NULL DEFAULT ARRAY[]::text[], channel text, roles jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(), detected_at timestamptz, mitigated_at timestamptz, resolved_at timestamptz,
  commander_id uuid, postmortem_url text, impact_summary text, source text NOT NULL DEFAULT 'manual', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incidents_status_idx ON incidents (status, started_at DESC);
CREATE TABLE incident_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE, message text NOT NULL,
  status text NOT NULL, public boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), author_id uuid
);
CREATE INDEX incident_updates_inc_idx ON incident_updates (incident_id, created_at);
CREATE TABLE postmortems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
  root_cause text, timeline jsonb NOT NULL DEFAULT '[]'::jsonb, actions_json jsonb NOT NULL DEFAULT '[]'::jsonb, five_whys jsonb NOT NULL DEFAULT '[]'::jsonb,
  draft boolean NOT NULL DEFAULT true, published_at timestamptz, reviewed_at timestamptz, reviewed_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
-- Componentes da status page pública (estado derivado dos incidentes abertos + override manual).
CREATE TABLE status_components (
  key text PRIMARY KEY, name text NOT NULL, position int NOT NULL DEFAULT 0, override_status text CHECK (override_status IS NULL OR override_status IN ('operational','degraded','partial_outage','major_outage'))
);

CREATE TABLE status_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel text NOT NULL CHECK (channel IN ('email','sms')), target text NOT NULL, components text[] NOT NULL DEFAULT ARRAY[]::text[],
  confirmed boolean NOT NULL DEFAULT false, token text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (channel, target)
);

-- On-call saudável: registro de pages por pessoa (base do alerta de burnout).
CREATE TABLE oncall_pages (
  id bigserial PRIMARY KEY, person text NOT NULL, team text NOT NULL DEFAULT 'backend', severity text NOT NULL, incident_id uuid REFERENCES incidents(id) ON DELETE SET NULL,
  paged_at timestamptz NOT NULL DEFAULT now(), off_hours boolean NOT NULL DEFAULT false, ack_seconds int
);
CREATE INDEX oncall_pages_person_idx ON oncall_pages (person, paged_at DESC);

-- FinOps -------------------------------------------------------------------------------------------------------------
CREATE TABLE cost_snapshots (
  id bigserial PRIMARY KEY, date date NOT NULL, service text NOT NULL, region text NOT NULL DEFAULT 'global', provider text NOT NULL DEFAULT 'internal',
  cost_cents bigint NOT NULL CHECK (cost_cents >= 0), metadata jsonb NOT NULL DEFAULT '{}'::jsonb, UNIQUE (date, service, region, provider)
);
CREATE TABLE unit_economics (
  id bigserial PRIMARY KEY, date date NOT NULL, metric text NOT NULL, value numeric(18,4) NOT NULL, region text NOT NULL DEFAULT 'all', plan text NOT NULL DEFAULT 'all', cohort text NOT NULL DEFAULT 'all',
  UNIQUE (date, metric, region, plan, cohort)
);
-- Cache de geração (hash de prompt + referências → resultado já gerado). Reuso evita custo de IA.
CREATE TABLE ai_scene_cache (
  cache_key text PRIMARY KEY, provider text NOT NULL, video_key text NOT NULL, last_frame_key text NOT NULL, duration_sec numeric(6,2) NOT NULL, cost_saved_cents numeric(12,4) NOT NULL DEFAULT 0,
  hits int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), last_hit_at timestamptz
);

-- Compliance ---------------------------------------------------------------------------------------------------------
CREATE TABLE compliance_ropa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), processing_activity text NOT NULL, purpose_basis text NOT NULL, data_categories text[] NOT NULL, recipients text[] NOT NULL DEFAULT ARRAY[]::text[],
  retention text NOT NULL, jurisdiction text[] NOT NULL DEFAULT ARRAY['BR']::text[], source text NOT NULL DEFAULT 'manual', owner text, updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processing_activity)
);
CREATE TABLE dpia_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','approved','rejected')),
  subject jsonb NOT NULL DEFAULT '{}'::jsonb, content jsonb NOT NULL DEFAULT '{}'::jsonb, generated_by text NOT NULL DEFAULT 'template', reviewed_by uuid, reviewed_at timestamptz, document_url text,
  next_review_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ai_act_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), model_provider text NOT NULL, purpose text NOT NULL, risk_classification text NOT NULL CHECK (risk_classification IN ('minimal','limited','high','prohibited')),
  mitigations text[] NOT NULL DEFAULT ARRAY[]::text[], dpia_id uuid REFERENCES dpia_records(id), data_region text, updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (model_provider, purpose)
);
CREATE TABLE subprocessors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, purpose text NOT NULL, location text NOT NULL, dpa_signed_at timestamptz, contact text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending_dpa','removed'))
);
-- Consentimento com prova: jurisdição, texto/versão, user agent (ip_hash já existe).
ALTER TABLE consents ADD COLUMN jurisdiction text, ADD COLUMN user_agent_hash text, ADD COLUMN proof_hash text;
CREATE TABLE retention_runs (id bigserial PRIMARY KEY, ran_at timestamptz NOT NULL DEFAULT now(), dry_run boolean NOT NULL, results jsonb NOT NULL);

-- Governança ---------------------------------------------------------------------------------------------------------
CREATE TABLE kyc_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','verified','rejected')), verified_at timestamptz, document_type text, external_ref text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kyc_user_idx ON kyc_verifications (user_id, created_at DESC);
CREATE TABLE sanctions_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE SET NULL, entity_name text NOT NULL, list_source text NOT NULL, match boolean NOT NULL,
  score numeric(5,4), checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE vendor_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), vendor text NOT NULL, service text NOT NULL, sla text, exit_plan_url text, renewal_date date, owner text NOT NULL, criticality text NOT NULL DEFAULT 'medium' CHECK (criticality IN ('low','medium','high','critical')),
  UNIQUE (vendor, service)
);
CREATE TABLE bcp_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, rto_minutes int NOT NULL, rpo_minutes int NOT NULL, procedure_url text NOT NULL, last_tested_at timestamptz, last_measured_minutes int
);
CREATE TABLE data_residency_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_region text NOT NULL CHECK (user_region IN ('BR','US','EU','CA')), data_type text NOT NULL, storage_region text NOT NULL, provider text NOT NULL,
  UNIQUE (user_region, data_type)
);
CREATE TABLE board_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period text NOT NULL UNIQUE, mrr_cents bigint NOT NULL, arr_cents bigint NOT NULL, ndr_pct numeric(7,2), grr_pct numeric(7,2), churn_pct numeric(7,2),
  burn_multiple numeric(8,2), cash_runway_months numeric(6,1), metrics jsonb NOT NULL DEFAULT '{}'::jsonb, published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
-- Calendário de testes de resiliência (chaos, DR, BCP, game days).
CREATE TABLE resilience_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL CHECK (kind IN ('chaos','dr','bcp','gameday','load','restore')), name text NOT NULL, owner text NOT NULL, scheduled_for date NOT NULL,
  executed_at timestamptz, outcome text CHECK (outcome IN ('passed','gaps_found','failed')), measured_minutes int, evidence_url text, postmortem_incident_id uuid REFERENCES incidents(id)
);

-- Seeds -------------------------------------------------------------------------------------------------------------
INSERT INTO status_components (key, name, position) VALUES ('api','API',1),('generation','Geração de vídeo',2),('publishing','Publicação',3),('dubbing','Dublagem',4),('marketplace','Marketplace',5),('cdn','CDN',6),('auth','Login',7)
ON CONFLICT DO NOTHING;
INSERT INTO subprocessors (name, purpose, location, dpa_signed_at, contact, status) VALUES
 ('AWS', 'Hospedagem (RDS, S3, ECS, ElastiCache)', 'sa-east-1 / us-east-1 / eu-west-1', NULL, NULL, 'pending_dpa'),
 ('Stripe', 'Pagamentos e assinaturas', 'EUA/UE', NULL, NULL, 'pending_dpa'),
 ('Kling', 'IA de geração de vídeo', 'global (provedor)', NULL, NULL, 'pending_dpa'),
 ('ElevenLabs', 'IA de síntese de voz', 'global (provedor)', NULL, NULL, 'pending_dpa'),
 ('OpenAI', 'Moderação de conteúdo', 'EUA', NULL, NULL, 'pending_dpa'),
 ('Provedor de e-mail transacional', 'Envio de e-mails', 'a definir', NULL, NULL, 'pending_dpa'),
 ('Provedor de KYC', 'Verificação de identidade para saques', 'a definir', NULL, NULL, 'pending_dpa')
ON CONFLICT (name) DO NOTHING;
INSERT INTO vendor_contracts (vendor, service, sla, exit_plan_url, renewal_date, owner, criticality) VALUES
 ('AWS', 'cloud', 'SLA padrão do provedor (a confirmar no contrato)', 'docs/BCP/VENDORS.md#cloud', NULL, 'sre', 'critical'),
 ('Google Cloud (candidato)', 'cloud-secundario', 'não contratado — candidato', 'docs/BCP/VENDORS.md#cloud', NULL, 'sre', 'high'),
 ('Stripe', 'pagamentos', 'a confirmar', 'docs/BCP/VENDORS.md#pagamentos', NULL, 'financeiro', 'critical'),
 ('Mercado Pago (candidato)', 'pagamentos-secundario', 'não contratado — candidato', 'docs/BCP/VENDORS.md#pagamentos', NULL, 'financeiro', 'high'),
 ('Kling', 'ia-video', 'a confirmar', 'docs/BCP/VENDORS.md#ia-video', NULL, 'produto', 'critical'),
 ('Luma (candidato)', 'ia-video-secundario', 'não contratado — candidato', 'docs/BCP/VENDORS.md#ia-video', NULL, 'produto', 'critical'),
 ('ElevenLabs', 'ia-voz', 'a confirmar', 'docs/BCP/VENDORS.md#ia-voz', NULL, 'produto', 'high'),
 ('Azure TTS (candidato)', 'ia-voz-secundario', 'não contratado — candidato', 'docs/BCP/VENDORS.md#ia-voz', NULL, 'produto', 'high'),
 ('CloudFront', 'cdn', 'a confirmar', 'docs/BCP/VENDORS.md#cdn', NULL, 'sre', 'high'),
 ('Cloudflare (candidato)', 'cdn-secundario', 'não contratado — candidato', 'docs/BCP/VENDORS.md#cdn', NULL, 'sre', 'medium')
ON CONFLICT (vendor, service) DO NOTHING;
INSERT INTO bcp_scenarios (name, rto_minutes, rpo_minutes, procedure_url) VALUES
 ('ai_provider_failure', 15, 0, 'docs/BCP/PLAN.md#ai-provider'), ('cloud_region_failure', 60, 5, 'docs/SRE/DR.md'), ('ddos', 30, 0, 'docs/BCP/PLAN.md#ddos'), ('ransomware', 240, 15, 'docs/BCP/PLAN.md#ransomware'),
 ('key_person_loss', 1440, 0, 'docs/BCP/PLAN.md#key-person'), ('publishing_platform_down', 30, 0, 'docs/BCP/PLAN.md#publishing'), ('regulatory_change', 10080, 0, 'docs/BCP/PLAN.md#regulatory')
ON CONFLICT (name) DO NOTHING;
INSERT INTO data_residency_routes (user_region, data_type, storage_region, provider) VALUES
 ('BR','primary_db','sa-east-1','aws-rds'),('BR','media','sa-east-1','aws-s3'),('BR','ai_inference','global','provider-default'),
 ('EU','primary_db','eu-west-1','aws-rds'),('EU','media','eu-west-1','aws-s3'),('EU','ai_inference','eu','provider-eu-region'),
 ('US','primary_db','us-east-1','aws-rds'),('US','media','us-east-1','aws-s3'),('US','ai_inference','global','provider-default'),
 ('CA','primary_db','ca-central-1','aws-rds'),('CA','media','ca-central-1','aws-s3'),('CA','ai_inference','global','provider-default')
ON CONFLICT DO NOTHING;
INSERT INTO feature_flags (key, description, enabled, rollout_percent) VALUES
 ('release_freeze','Congelamento de releases de features (error budget esgotado)', false, 100),
 ('ai_scene_cache','Reutiliza cenas geradas com os mesmos inputs', false, 100),
 ('ai_cost_router','Roteamento de provedor por custo/qualidade', false, 100),
 ('ai_kill_switch','Kill switch automático de geração por anomalia de custo', false, 100),
 ('ai_disclosure_visible','Marca visível "Gerado por IA" no vídeo (AI Act art. 50) — por região', true, 100),
 ('kyc_enforced','Exigir KYC e sanções em saques acima do limite', true, 100)
ON CONFLICT (key) DO NOTHING;
UPDATE feature_flags SET regions = ARRAY['EU'] WHERE key='ai_disclosure_visible';
INSERT INTO settings (key, value) VALUES ('ops', '{"kycThresholdCents":500000,"dualApprovalThresholdCents":1000000,"aiAnomalyMultiplier":3,"aiDailyThresholdCents":300000,"dsarSlaDays":{"EU":30,"BR":15,"CA":45,"US":45},"paymentFeePct":3.99,"creditValueCents":5,"oncall":{"maxPagesPerPersonPerMonth":8,"maxOffHoursPagesPerPersonPerMonth":3,"offHoursStart":22,"offHoursEnd":7,"utcOffsetHours":-3}}'::jsonb) ON CONFLICT (key) DO NOTHING;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nexus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nexus_app;
