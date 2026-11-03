-- Auditoria pós-Fase 8 — RLS em todas as tabelas com dados de usuário ou dados internos sensíveis.
-- Antes: 14 de 81 tabelas tinham RLS e só as consultas feitas via asUser() passavam por ele.
-- Agora: toda conexão do app assume `nexus_app` (src/db/pool.ts) e recebe o contexto da requisição (src/db/context.ts).
-- Regras: dono vê/escreve o que é seu; admin e system (workers, rotas públicas, webhooks assinados) passam.
-- Inventário completo e justificativa de cada escalonamento para system: docs/SECURITY_RLS.md.

CREATE OR REPLACE FUNCTION app_bypass() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT app_is_admin() OR app_system() $$;

-- 1) Tabelas com dono direto em user_id
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['ai_usage','api_keys','auth_identities','connected_accounts','consents','data_export_requests','deletion_requests',
    'experiment_events','kyc_verifications','payout_requests','refresh_tokens','sanctions_checks','transactions','affiliate_accounts','affiliate_links','partner_sales'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass())', t || '_owner', t);
  END LOOP;
END $$;

-- 2) Usuários: cada um só enxerga a própria linha (perfis públicos de terceiros via view user_public_profiles)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self ON users USING (id = app_uid() OR app_bypass()) WITH CHECK (id = app_uid() OR app_bypass());
-- View com só o que pode aparecer para outras pessoas (nome de criador no marketplace, autor de avaliação, selo de verificado).
-- Views rodam com os privilégios do dono (security_invoker = false): ignora o RLS de users, mas expõe apenas estas colunas.
CREATE VIEW user_public_profiles WITH (security_barrier = true) AS SELECT id, name, creator_verified FROM users WHERE deleted_at IS NULL AND NOT banned;
GRANT SELECT ON user_public_profiles TO nexus_app;

-- 3) Dono em owner_id (B2B)
ALTER TABLE catalogs ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalogs_owner ON catalogs USING (owner_id = app_uid() OR app_bypass()) WITH CHECK (owner_id = app_uid() OR app_bypass());
ALTER TABLE batch_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY batch_jobs_owner ON batch_jobs USING (owner_id = app_uid() OR app_bypass()) WITH CHECK (owner_id = app_uid() OR app_bypass());

-- 4) Filhas: herdam o dono do pai
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY catalog_items_owner ON catalog_items USING (app_bypass() OR EXISTS (SELECT 1 FROM catalogs c WHERE c.id = catalog_items.catalog_id AND c.owner_id = app_uid()))
  WITH CHECK (app_bypass() OR EXISTS (SELECT 1 FROM catalogs c WHERE c.id = catalog_items.catalog_id AND c.owner_id = app_uid()));
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['localized_versions','storyboards','generation_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = %I.project_id AND p.user_id = app_uid())) WITH CHECK (app_bypass() OR EXISTS (SELECT 1 FROM projects p WHERE p.id = %I.project_id AND p.user_id = app_uid()))', t || '_owner', t, t, t);
  END LOOP;
END $$;
ALTER TABLE publication_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY publication_jobs_owner ON publication_jobs USING (app_bypass() OR EXISTS (SELECT 1 FROM publications p WHERE p.id = publication_jobs.publication_id AND p.user_id = app_uid()))
  WITH CHECK (app_bypass() OR EXISTS (SELECT 1 FROM publications p WHERE p.id = publication_jobs.publication_id AND p.user_id = app_uid()));
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['affiliate_conversions','affiliate_clicks'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass() OR EXISTS (SELECT 1 FROM affiliate_links l WHERE l.id = %I.link_id AND l.user_id = app_uid())) WITH CHECK (app_bypass())', t || '_owner', t, t);
  END LOOP;
END $$;

-- 5) Marketplace: comprador vê a compra; criador vê as vendas dos próprios templates; só o comprador (ou system) registra
ALTER TABLE template_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY template_purchases_read ON template_purchases FOR SELECT USING (buyer_id = app_uid() OR app_bypass() OR EXISTS (SELECT 1 FROM templates t WHERE t.id = template_purchases.template_id AND t.creator_id = app_uid()));
CREATE POLICY template_purchases_write ON template_purchases FOR INSERT WITH CHECK (buyer_id = app_uid() OR app_bypass());
CREATE POLICY template_purchases_admin ON template_purchases FOR UPDATE USING (app_bypass()) WITH CHECK (app_bypass());
CREATE POLICY template_purchases_delete ON template_purchases FOR DELETE USING (app_bypass());
-- Avaliações são públicas para leitura; cada um escreve as suas
ALTER TABLE template_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY template_reviews_read ON template_reviews FOR SELECT USING (true);
CREATE POLICY template_reviews_insert ON template_reviews FOR INSERT WITH CHECK (user_id = app_uid() OR app_bypass());
CREATE POLICY template_reviews_update ON template_reviews FOR UPDATE USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id = app_uid() OR app_bypass());
CREATE POLICY template_reviews_delete ON template_reviews FOR DELETE USING (user_id = app_uid() OR app_bypass());
-- Denúncias: quem denunciou vê a sua; moderação (admin) vê todas
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY reports_owner ON reports USING (reporter_id = app_uid() OR app_bypass()) WITH CHECK (reporter_id = app_uid() OR app_bypass());

-- 6) Telemetria: o usuário pode gravar eventos próprios ou anônimos; leitura só admin/system (warehouse, dashboards)
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY analytics_events_read ON analytics_events FOR SELECT USING (app_bypass());
CREATE POLICY analytics_events_insert ON analytics_events FOR INSERT WITH CHECK (user_id IS NULL OR user_id = app_uid() OR app_bypass());
CREATE POLICY analytics_events_maint ON analytics_events FOR UPDATE USING (app_bypass()) WITH CHECK (app_bypass());
CREATE POLICY analytics_events_delete ON analytics_events FOR DELETE USING (app_bypass());
ALTER TABLE attribution_touches ENABLE ROW LEVEL SECURITY;
CREATE POLICY attribution_touches_owner ON attribution_touches USING (user_id = app_uid() OR app_bypass()) WITH CHECK (user_id IS NULL OR user_id = app_uid() OR app_bypass());

-- 7) Trilhas e caixas de entrada internas: qualquer contexto registra; só admin/system lê
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['audit_logs','webhook_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (app_bypass())', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (true)', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (app_bypass()) WITH CHECK (app_bypass())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (app_bypass())', t || '_delete', t);
  END LOOP;
END $$;

-- 8) Dados internos com PII ou confidenciais: só admin/system (nenhuma requisição de usuário comum precisa deles)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['waitlist_entries','status_subscribers','erasure_queue','partner_accounts','oncall_pages','board_reports','dpia_records','incidents','incident_updates','postmortems'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass()) WITH CHECK (app_bypass())', t || '_internal', t);
  END LOOP;
END $$;

-- 9) Configuração e dados operacionais sem dono: ninguém altera fora de admin/system (preço, comissão, flags,
--    experimentos não podem ser mudados por uma rota de usuário com bug). Leitura: configuração é legível pela app;
--    dados operacionais/financeiros internos só por admin/system.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['settings','feature_flags','pricing_regions','experiments','lifecycle_campaigns','fx_rates','market_expansion',
    'status_components','slo_definitions','ai_scene_cache','data_residency_routes'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (app_bypass())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (app_bypass()) WITH CHECK (app_bypass())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (app_bypass())', t || '_delete', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['cost_snapshots','unit_economics','slo_samples','slo_burn_alerts','growth_alerts','retention_runs','subprocessors',
    'vendor_contracts','bcp_scenarios','resilience_exercises','ai_act_registrations','compliance_ropa'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON %I USING (app_bypass()) WITH CHECK (app_bypass())', t || '_internal', t);
  END LOOP;
END $$;
