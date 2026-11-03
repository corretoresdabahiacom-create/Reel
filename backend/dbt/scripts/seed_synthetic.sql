-- Seeder SINTÉTICO determinístico (só para validar dbt). Coorte golden: 10 usuários cadastrados em 2026-01-05 (segunda-feira);
-- 5 ativos no dia 7 (2026-01-12) => D7 = 0.5 ; 8 ativos no dia 1 => D1 = 0.8 ; 2 ativos no dia 30 (2026-02-04) => D30 = 0.2; D90 imaturo (as_of 2026-03-01) => NULL.
-- Segunda coorte (2026-02-23, 4 usuários) é imatura para D7 em as_of 2026-03-01 => D7 NULL (nunca 0 falso).
truncate raw.events, raw.users, raw.transactions, raw.projects, raw.publications, raw.ai_usage, raw.experiment_assignments, raw.referrals, raw.template_purchases;
insert into raw.users (pseudo_id, created_at, plan, region, country, locale, attribution_source, referred)
select 'g' || lpad(i::text, 2, '0'), timestamptz '2026-01-05 12:00+00', case when i <= 2 then 'pro' else 'free' end, 'BR', 'BR', 'pt-BR', case when i <= 5 then 'tiktok' else 'organic' end, false from generate_series(1, 10) i;
insert into raw.users (pseudo_id, created_at, plan, region, country, locale, attribution_source, referred)
select 'h' || i, timestamptz '2026-02-23 12:00+00', 'free', 'MX', 'MX', 'es-MX', 'meta', false from generate_series(1, 4) i;
-- sinais de cadastro
insert into raw.events (event_id, pseudo_id, name, source, occurred_at)
select 'su-' || pseudo_id, pseudo_id, 'user_signed_up', 'server', created_at from raw.users;
-- atividade golden: dia 0 todos; dia 1 g01-g08; dia 7 g01-g05; dia 30 g01-g02
insert into raw.events (event_id, pseudo_id, name, source, occurred_at)
select 'a-' || p || '-' || d, p, 'project_created', 'server', timestamptz '2026-01-05 15:00+00' + (d || ' days')::interval
from (select 'g' || lpad(i::text, 2, '0') p, d from generate_series(1, 10) i, (values (0),(1),(7),(30)) v(d)
      where d = 0 or (d = 1 and i <= 8) or (d = 7 and i <= 5) or (d = 30 and i <= 2)) x;
-- evento passivo (não conta como atividade): g09 e g10 veem paywall no dia 7
insert into raw.events (event_id, pseudo_id, name, source, occurred_at) values ('pv-g09', 'g09', 'paywall_viewed', 'server', '2026-01-12 10:00+00'), ('pv-g10', 'g10', 'paywall_viewed', 'server', '2026-01-12 10:00+00');
-- coorte imatura: ativa só no dia 0; um evento em 2026-03-01 define o as_of
insert into raw.events (event_id, pseudo_id, name, source, occurred_at) select 'a-' || pseudo_id, pseudo_id, 'project_created', 'server', created_at from raw.users where pseudo_id like 'h%';
insert into raw.events (event_id, pseudo_id, name, source, occurred_at) values ('asof', 'h1', 'project_created', 'server', '2026-03-01 09:00+00');
-- quarentena e duplicata (não podem contaminar)
insert into raw.events (event_id, pseudo_id, name, source, occurred_at, schema_version) values ('q1', 'g10', 'project_created', 'client', '2026-01-12 11:00+00', 0);
insert into raw.events (event_id, pseudo_id, name, source, occurred_at) values ('a-g01-7', 'g01', 'project_created', 'server', '2026-01-12 15:00+00');
-- projetos / publicações / IA
insert into raw.projects (project_id, pseudo_id, status, category, created_at) select 'pr' || i, 'g' || lpad(i::text, 2, '0'), case when i <= 6 then 'ready' else 'failed' end, 'moda', timestamptz '2026-01-05 15:00+00' from generate_series(1, 10) i;
insert into raw.publications (publication_id, pseudo_id, project_id, platform, status, published_at, created_at) select 'pb' || i, 'g' || lpad(i::text, 2, '0'), 'pr' || i, 'tiktok', case when i <= 3 then 'published' else 'failed' end, case when i <= 3 then timestamptz '2026-01-05 16:00+00' end, timestamptz '2026-01-05 16:00+00' from generate_series(1, 4) i;
insert into raw.ai_usage (usage_id, pseudo_id, provider, operation, cost_cents, status, created_at) select 'ai' || i, 'g' || lpad(i::text, 2, '0'), 'openai', 'script', 12.5, 'ok', timestamptz '2026-01-05 15:10+00' from generate_series(1, 6) i;
-- receita: 2 assinantes pro (BRL 2990) + 1 MXN com amount_brl diferente; 1 reembolso/negativo não conta
insert into raw.transactions (tx_id, pseudo_id, type, amount_cents, amount_brl_cents, currency, tax_cents, region, method, created_at) values
 ('t1', 'g01', 'subscription', 2990, 2990, 'BRL', 0, 'BR', 'pix', '2026-01-06 10:00+00'), ('t2', 'g02', 'subscription', 2990, 2990, 'BRL', 0, 'BR', 'card', '2026-01-07 10:00+00'),
 ('t3', 'h1', 'credit_purchase', 9900, 2700, 'MXN', 1584, 'MX', 'oxxo', '2026-02-24 10:00+00'), ('t4', 'g02', 'refund', -2990, -2990, 'BRL', 0, 'BR', 'card', '2026-01-08 10:00+00');
-- experimento + indicações + marketplace
insert into raw.experiment_assignments (experiment_key, pseudo_id, variant, assigned_at, exposed_at) select 'paywall_copy', 'g' || lpad(i::text, 2, '0'), case when i % 2 = 0 then 'b' else 'a' end, '2026-01-05 12:00+00', '2026-01-05 13:00+00' from generate_series(1, 10) i;
insert into raw.referrals (referral_id, referrer_pseudo, referred_pseudo, status, created_at) values ('r1', 'g01', 'g03', 'rewarded', '2026-01-05 12:00+00'), ('r2', 'g01', 'g04', 'fraud', '2026-01-05 12:00+00');
insert into raw.template_purchases (purchase_id, template_id, buyer_pseudo, creator_pseudo, price_credits, fee_credits, created_at) values ('tp1', 'tpl1', 'g03', 'g01', 100, 20, '2026-01-06 10:00+00');
