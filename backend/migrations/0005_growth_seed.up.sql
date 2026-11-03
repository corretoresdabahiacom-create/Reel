-- Seeds da Fase 7. Impostos e preços são PONTO DE PARTIDA (ver docs/PRICING.md): confirmar com contador/Stripe Tax antes de cobrar.
INSERT INTO pricing_regions (region, country_codes, currency, locale, plan_pro_price_cents, plan_business_price_cents, credits_price_cents, credit_packs_json, tax_pct, tax_kind, tax_inclusive, payment_methods, ppp_index, annual_discount_pct) VALUES
 ('BR','{BR}','BRL','pt-BR',4900,19900,38,'[{"id":"c10","credits":10,"priceCents":590},{"id":"c50","credits":50,"priceCents":1900},{"id":"c200","credits":200,"priceCents":6900}]',0,'included',true,'{pix,card,boleto}',0.55,20),
 ('MX','{MX}','MXN','es-MX',19900,79900,118,'[{"id":"c10","credits":10,"priceCents":1900},{"id":"c50","credits":50,"priceCents":5900},{"id":"c200","credits":200,"priceCents":19900}]',16,'IVA',true,'{oxxo,spei,card}',0.60,20),
 ('AR','{AR}','ARS','es-AR',1290000,4990000,9800,'[{"id":"c10","credits":10,"priceCents":150000},{"id":"c50","credits":50,"priceCents":490000},{"id":"c200","credits":200,"priceCents":1590000}]',21,'IVA',true,'{card,bank_transfer}',0.35,20),
 ('US','{US,CA}','USD','en-US',1299,3999,14,'[{"id":"c10","credits":10,"priceCents":199},{"id":"c50","credits":50,"priceCents":699},{"id":"c200","credits":200,"priceCents":2299}]',0,'sales_tax_exclusive',false,'{card,apple_pay}',1.00,20),
 ('EU','{DE,FR,IT,ES,PT,NL,BE,AT,IE,PL,SE,DK,FI,GR,CZ}','EUR','en-IE',1199,3699,13,'[{"id":"c10","credits":10,"priceCents":199},{"id":"c50","credits":50,"priceCents":649},{"id":"c200","credits":200,"priceCents":2149}]',21,'VAT',true,'{card,sepa,ideal}',0.95,20),
 ('IN','{IN}','INR','en-IN',39900,149900,398,'[{"id":"c10","credits":10,"priceCents":4900},{"id":"c50","credits":50,"priceCents":19900},{"id":"c200","credits":200,"priceCents":59900}]',18,'GST',true,'{upi,card,netbanking}',0.25,25),
 ('ID','{ID}','IDR','id-ID',59000,229000,580,'[{"id":"c10","credits":10,"priceCents":9000},{"id":"c50","credits":50,"priceCents":29000},{"id":"c200","credits":200,"priceCents":99000}]',11,'PPN',true,'{bank_transfer,qris,card}',0.30,25),
 ('PH','{PH}','PHP','en-PH',29900,109900,298,'[{"id":"c10","credits":10,"priceCents":4900},{"id":"c50","credits":50,"priceCents":14900},{"id":"c200","credits":200,"priceCents":49900}]',12,'VAT',true,'{gcash,card,bank_transfer}',0.35,25)
ON CONFLICT (region) DO NOTHING;

-- Câmbio inicial (PLACEHOLDER p/ relatórios; em produção o job de FX sobrescreve a partir de um provedor). `brl_per_major` = BRL por 1 unidade da moeda.
INSERT INTO fx_rates (currency, brl_per_major, exponent) VALUES ('BRL',1,2),('USD',5.40,2),('EUR',5.90,2),('MXN',0.29,2),('ARS',0.0055,2),('INR',0.065,2),('IDR',0.00034,0),('PHP',0.095,2) ON CONFLICT (currency) DO NOTHING;

INSERT INTO market_expansion (region, name, status, priority, locales, kpis_json) VALUES
 ('BR','Brasil','beta',1,'{pt-BR}','{"targets":{"cacCents":2500,"ltvCacMin":3,"paybackMonths":4,"d30Retention":0.18}}'),
 ('MX_LATAM','México e LATAM hispânica','planned',2,'{es}','{"targets":{"cacCents":2200,"ltvCacMin":3,"paybackMonths":5,"d30Retention":0.16}}'),
 ('US_HISPANIC','EUA hispânico','planned',3,'{es,en}','{"targets":{"cacCents":4500,"ltvCacMin":3,"paybackMonths":6,"d30Retention":0.18}}'),
 ('EU','Europa','planned',4,'{en,es}','{"targets":{"cacCents":6000,"ltvCacMin":3,"paybackMonths":8,"d30Retention":0.2}}'),
 ('IN','Índia','planned',5,'{en}','{"targets":{"cacCents":300,"ltvCacMin":3,"paybackMonths":6,"d30Retention":0.14}}'),
 ('SEA','Sudeste Asiático','planned',6,'{en}','{"targets":{"cacCents":500,"ltvCacMin":3,"paybackMonths":6,"d30Retention":0.14}}')
ON CONFLICT (region) DO NOTHING;

INSERT INTO lifecycle_campaigns (key, description, trigger_json, channel, template_id, cooldown_days, requires_marketing_consent, priority) VALUES
 ('d1_onboarding_incomplete','D+1: onboarding incompleto → lembrete + dica','{"minAgeDays":1,"maxAgeDays":3,"onboardingIncomplete":true}','push','lc_d1_onboarding',30,true,60),
 ('d7_never_published','D+7: nunca publicou → template sugerido + tutorial','{"minAgeDays":7,"maxAgeDays":14,"neverPublished":true}','push','lc_d7_publish',30,true,50),
 ('d21_churn_risk','D+21: risco de churn → oferta de créditos/upgrade','{"minAgeDays":21,"churnRiskGte":0.6}','email','lc_d21_offer',45,true,40),
 ('d45_winback','D+45: winback → caso de sucesso','{"inactiveDaysGte":45,"inactiveDaysLte":120}','email','lc_d45_winback',60,true,30),
 ('post_publish_next_platform','Pós-publicação: parabenizar + sugerir nova plataforma','{"publishedWithinHours":24,"platformsPublishedLt":3}','in_app','lc_post_publish',7,false,70)
ON CONFLICT (key) DO NOTHING;

INSERT INTO feature_flags (key, description, enabled, rollout_percent, regions, plans) VALUES
 ('experiments_enabled','Kill switch: plataforma de experimentação (desligada → todos no controle)',true,100,'{}','{}'),
 ('lifecycle_enabled','Kill switch: campanhas de ciclo de vida',true,100,'{}','{}'),
 ('referral_enabled','Programa de indicação',true,100,'{}','{}'),
 ('recs_personalized','Recomendação personalizada (desligada → só regras/cold-start)',true,100,'{}','{}'),
 ('paywall_contextual','Paywall contextual no servidor',true,100,'{}','{}'),
 ('waitlist_open','Waitlist pública aberta',true,100,'{}','{}')
ON CONFLICT (key) DO NOTHING;

INSERT INTO settings (key, value) VALUES ('growth', '{
 "holdoutPct": 0,
 "referral": {"rewardReferrerCredits": 20, "rewardReferredCredits": 20, "monthlyCapPerReferrer": 50, "signupVelocityPerIp24h": 5},
 "lifecycle": {"capPerDay": 1, "capPerWeek": 3, "defaultQuietStart": 22, "defaultQuietEnd": 8},
 "paywall": {"capPerDayPerTrigger": 1, "capPerWeek": 3},
 "recommendations": {"minInteractionsForPersonalized": 5},
 "churn": {"highRisk": 0.6, "modelTimeoutMs": 50},
 "aiCostMonthlyBudgetCents": 1500000,
 "creatorVerifiedFeePct": 12,
 "iofPct": 3.5,
 "disposableDomains": ["mailinator.com","10minutemail.com","guerrillamail.com","tempmail.com","yopmail.com","trashmail.com","sharklasers.com","dispostable.com"]
}'::jsonb) ON CONFLICT DO NOTHING;

-- Catálogo de 10 experimentos iniciais (rascunho — ninguém é exposto até `start`). Detalhes em docs/EXPERIMENT_BACKLOG.md.
INSERT INTO experiments (key, name, hypothesis, variants_json, primary_metric, guardrails_json, target_json, baseline_rate, mde_relative, conversion_window_days) VALUES
 ('onboarding_flow','Onboarding: 3 slides vs 1 slide vs vídeo curto','Reduzir o atrito inicial aumenta a ativação (1º vídeo montado em 7 dias).',
  '[{"key":"control","name":"3 slides","weight":34},{"key":"one_slide","name":"1 slide","weight":33},{"key":"short_video","name":"Vídeo de 15s","weight":33}]','{"type":"conversion","event":"video_assembled","label":"Ativação"}',
  '[{"metric":"ai_cost_cents","direction":"increase_bad","maxRelativeChange":0.25,"minHours":24}]','{"newUsersOnly":true}',0.30,0.10,7),
 ('paywall_price','Paywall: preço do Pro (R$49 vs R$39 vs R$59)','Preço menor eleva a conversão o suficiente para aumentar a receita por usuário exposto.',
  '[{"key":"control","name":"R$49","weight":34},{"key":"low","name":"R$39","weight":33},{"key":"high","name":"R$59","weight":33}]','{"type":"conversion","event":"subscription_started","label":"Free→Pro"}',
  '[{"metric":"event:refund_requested","direction":"increase_bad","maxRelativeChange":0.5,"minHours":48}]','{"plans":["free"]}',0.04,0.20,14),
 ('paywall_trigger_timing','Paywall: momento de exibição','Mostrar a oferta logo após a 1ª geração bem-sucedida converte mais que após a 3ª ou no download.',
  '[{"key":"control","name":"após 3ª geração","weight":34},{"key":"after_first","name":"após 1ª geração","weight":33},{"key":"on_download","name":"ao baixar sem marca","weight":33}]','{"type":"conversion","event":"subscription_started"}',
  '[{"metric":"event:project_created","direction":"decrease_bad","maxRelativeChange":0.10,"minHours":48}]','{"plans":["free"]}',0.04,0.20,14),
 ('paywall_trial_structure','Paywall: trial 7 dias vs mensal vs anual','Trial de 7 dias aumenta conversão; o anual com desconto aumenta o LTV.',
  '[{"key":"control","name":"mensal","weight":34},{"key":"trial_7d","name":"trial 7 dias","weight":33},{"key":"annual","name":"anual −20%","weight":33}]','{"type":"mean","event":"revenue_recorded","label":"Receita por usuário exposto"}',
  '[{"metric":"event:refund_requested","direction":"increase_bad","maxRelativeChange":0.5,"minHours":72}]','{"plans":["free"]}',NULL,0.15,30),
 ('marketplace_ranking','Marketplace: ordem de listagem','Ranking personalizado aumenta o uso de templates versus popularidade.',
  '[{"key":"control","name":"popularidade","weight":34},{"key":"personalized","name":"personalizado","weight":33},{"key":"recent","name":"recentes","weight":33}]','{"type":"conversion","event":"template_used"}',
  '[]','{}',0.12,0.15,7),
 ('create_flow_order','Fluxo Criar: PhotoCoach → roteiro vs roteiro → PhotoCoach','Começar pelo PhotoCoach melhora a qualidade das fotos e a taxa de vídeos montados.',
  '[{"key":"control","name":"PhotoCoach → roteiro","weight":50},{"key":"script_first","name":"roteiro → PhotoCoach","weight":50}]','{"type":"conversion","event":"video_assembled"}',
  '[{"metric":"ai_cost_cents","direction":"increase_bad","maxRelativeChange":0.20,"minHours":24}]','{}',0.35,0.08,7),
 ('push_timing','Notificações push: horário','Enviar no horário preferido do usuário aumenta o clique frente a horário fixo.',
  '[{"key":"control","name":"19h local","weight":34},{"key":"preferred_hour","name":"horário preferido","weight":33},{"key":"morning","name":"9h local","weight":33}]','{"type":"conversion","event":"project_created","label":"Projeto em 24h após push"}',
  '[{"metric":"event:notifications_disabled","direction":"increase_bad","maxRelativeChange":0.30,"minHours":24}]','{}',0.10,0.15,1),
 ('watermark_free','Marca d''água no Free: presente vs ausente vs QR','Marca d''água com QR gera mais indicações sem reduzir a ativação.',
  '[{"key":"control","name":"marca d''água texto","weight":34},{"key":"none","name":"sem marca","weight":33},{"key":"qr","name":"marca + QR","weight":33}]','{"type":"conversion","event":"referral_clicked"}',
  '[{"metric":"event:video_published","direction":"decrease_bad","maxRelativeChange":0.10,"minHours":48}]','{"plans":["free"]}',0.03,0.25,14),
 ('rec_personalized','Recomendação personalizada vs baseline','Recomendações personalizadas elevam o CTR → uso de templates.',
  '[{"key":"control","name":"baseline (regras)","weight":50},{"key":"personalized","name":"personalizada","weight":50}]','{"type":"conversion","event":"template_used"}',
  '[]','{}',0.10,0.15,7),
 ('referral_reward','Indicação: recompensa 20 vs 10 vs 40 créditos','Recompensa maior aumenta indicações ativadas sem destruir a margem.',
  '[{"key":"control","name":"20 créditos","weight":34},{"key":"low","name":"10 créditos","weight":33},{"key":"high","name":"40 créditos","weight":33}]','{"type":"conversion","event":"referral_converted"}',
  '[{"metric":"ai_cost_cents","direction":"increase_bad","maxRelativeChange":0.30,"minHours":48}]','{}',0.02,0.30,30)
ON CONFLICT (key) DO NOTHING;
UPDATE experiments SET required_per_variant = NULL; -- calculado ao iniciar (POST /admin/experiments/:key/start) a partir de baseline/MDE
