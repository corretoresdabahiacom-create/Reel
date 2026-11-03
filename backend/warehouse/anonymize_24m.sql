-- Anonimização do warehouse após 24 meses (política: docs/COMPLIANCE/RETENTION_POLICY.md; produz dados ANONIMIZADOS — fora do escopo de LGPD/GDPR).
-- Quebra a vinculação entre linhas: pseudo_id vira um identificador aleatório por linha ('anon-<md5 aleatório>'), irreversível (sem sal/chave guardados);
-- anon_id/session_id viram NULL e props perde chaves identificáveis. Agregados (plano, país, evento, valores) permanecem utilizáveis.
-- Idempotente (linhas já 'anon-%' são ignoradas). Rodar mensalmente no DW; sintaxe PostgreSQL (BigQuery: trocar md5(random()::text) por GENERATE_UUID()).
-- Contrapartida: análises de coorte/retenção NÃO são mais possíveis para dados > 24 meses — aceito pela política.
BEGIN;
UPDATE raw.events SET pseudo_id = 'anon-' || md5(random()::text || event_id), anon_id = NULL, session_id = NULL,
       props = props - 'email' - 'ip' - 'device_id' - 'user_agent' - 'phone' - 'name'
 WHERE occurred_at < now() - interval '24 months' AND (pseudo_id IS NULL OR pseudo_id NOT LIKE 'anon-%') AND (pseudo_id IS NOT NULL OR anon_id IS NOT NULL OR session_id IS NOT NULL);
UPDATE raw.users SET pseudo_id = 'anon-' || md5(random()::text || pseudo_id), partner_id = NULL
 WHERE created_at < now() - interval '24 months' AND pseudo_id NOT LIKE 'anon-%';
UPDATE raw.transactions SET pseudo_id = 'anon-' || md5(random()::text || tx_id)
 WHERE created_at < now() - interval '24 months' AND pseudo_id IS NOT NULL AND pseudo_id NOT LIKE 'anon-%';
UPDATE raw.projects SET pseudo_id = 'anon-' || md5(random()::text || project_id)
 WHERE created_at < now() - interval '24 months' AND pseudo_id IS NOT NULL AND pseudo_id NOT LIKE 'anon-%';
UPDATE raw.publications SET pseudo_id = 'anon-' || md5(random()::text || publication_id)
 WHERE created_at < now() - interval '24 months' AND pseudo_id IS NOT NULL AND pseudo_id NOT LIKE 'anon-%';
UPDATE raw.ai_usage SET pseudo_id = 'anon-' || md5(random()::text || usage_id)
 WHERE created_at < now() - interval '24 months' AND pseudo_id IS NOT NULL AND pseudo_id NOT LIKE 'anon-%';
UPDATE raw.experiment_assignments SET pseudo_id = 'anon-' || md5(random()::text || pseudo_id || experiment_key)
 WHERE assigned_at < now() - interval '24 months' AND pseudo_id NOT LIKE 'anon-%';
UPDATE raw.referrals SET referrer_pseudo = 'anon-' || md5(random()::text || referral_id), referred_pseudo = 'anon-' || md5(random()::text || referral_id || 'r')
 WHERE created_at < now() - interval '24 months' AND (referrer_pseudo IS NULL OR referrer_pseudo NOT LIKE 'anon-%');
UPDATE raw.template_purchases SET buyer_pseudo = 'anon-' || md5(random()::text || purchase_id), creator_pseudo = 'anon-' || md5(random()::text || purchase_id || 'c')
 WHERE created_at < now() - interval '24 months' AND (buyer_pseudo IS NULL OR buyer_pseudo NOT LIKE 'anon-%');
COMMIT;
