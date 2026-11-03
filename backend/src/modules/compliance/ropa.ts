import { pool } from '../../db/pool.js';
import type { Row } from '../../db/rows.generated.js';
/**
 * ROPA automático: cruza (a) catálogo de atividades de tratamento (finalidade/base legal/destinatários/retenção) com (b) o schema real do Postgres
 * (information_schema) para derivar as categorias de dados efetivamente armazenadas. Atividade cujas tabelas não existem é ignorada; coluna nova com cara de dado pessoal aparece sozinha.
 */
const PII_RULES: Array<[RegExp, string]> = [[/email/, 'e-mail'], [/^name$|display_name/, 'nome'], [/birth/, 'data de nascimento'], [/ip_hash|ip$/, 'IP (hash)'], [/user_agent/, 'user agent (hash)'], [/country|region|locale|timezone/, 'localização aproximada/idioma'], [/stripe|payment|pix|amount|cents/, 'dados de pagamento/transação'], [/photo|upload|reference|video|image|storage_key/, 'mídia enviada/gerada'], [/token/, 'credenciais/tokens'], [/pseudo_id|anon_id|device|fingerprint/, 'identificadores pseudonimizados'], [/consent|accepted/, 'consentimentos'], [/cpf|document/, 'documento de identidade'], [/churn|rfm|ltv/, 'perfil/pontuação inferida']];
export interface Activity { activity: string; tables: string[]; purposeBasis: string; recipients: string[]; retention: string; jurisdiction: string[]; owner: string }
export const ACTIVITIES: Activity[] = [
  { activity: 'Cadastro e autenticação', tables: ['users', 'auth_identities', 'refresh_tokens', 'api_keys'], purposeBasis: 'Execução de contrato (LGPD art. 7 V / GDPR 6(1)(b)) — operar a conta', recipients: ['AWS (hospedagem)'], retention: 'Enquanto a conta existir + 30 dias de carência; tokens expiram em 30 dias', jurisdiction: ['BR', 'EU', 'US-CA'], owner: 'backend' },
  { activity: 'Geração de vídeos por IA', tables: ['projects', 'scenes', 'storyboards', 'generation_logs', 'ai_usage'], purposeBasis: 'Execução de contrato — gerar o vídeo solicitado; consentimento para uso de IA (type=ai)', recipients: ['Provedores de IA (vídeo/TTS/moderação)', 'AWS S3'], retention: 'Cenas brutas 90 d; vídeo final Free 365 d / Pro 730 d; logs 30 d', jurisdiction: ['BR', 'EU', 'US-CA'], owner: 'ia' },
  { activity: 'Publicação em plataformas', tables: ['publications', 'publication_jobs', 'connected_accounts'], purposeBasis: 'Execução de contrato — publicar a pedido do usuário (tokens OAuth cifrados)', recipients: ['TikTok', 'YouTube', 'Instagram', 'Shopee', 'Temu', 'OLX', 'Mercado Livre'], retention: 'Tokens até revogação; histórico enquanto o projeto existir', jurisdiction: ['BR', 'EU', 'US-CA'], owner: 'backend' },
  { activity: 'Pagamentos, créditos e saques', tables: ['transactions', 'payout_requests', 'kyc_verifications', 'sanctions_checks'], purposeBasis: 'Execução de contrato + obrigação legal (fiscal, PLD/AML)', recipients: ['Stripe', 'Provedor de KYC', 'Contador'], retention: '5 anos (obrigação fiscal), anonimizados — nunca apagados', jurisdiction: ['BR', 'EU', 'US-CA'], owner: 'financeiro' },
  { activity: 'Marketplace e afiliados', tables: ['templates', 'template_purchases', 'affiliate_accounts', 'affiliate_links', 'affiliate_conversions'], purposeBasis: 'Execução de contrato; legítimo interesse (antifraude de cliques)', recipients: ['Marketplaces parceiros'], retention: 'Cliques (IP em hash) 90 d; agregados mantidos', jurisdiction: ['BR', 'EU'], owner: 'produto' },
  { activity: 'Analytics e experimentação (pseudonimizado)', tables: ['analytics_events', 'experiment_assignments', 'attribution_touches', 'recommendation_events'], purposeBasis: 'Consentimento (cookies/analytics); legítimo interesse para métricas agregadas sem identificação', recipients: ['Data warehouse (somente pseudo_id)'], retention: 'Transacional 180 d; warehouse pseudonimizado, anonimizado após 24 meses', jurisdiction: ['BR', 'EU', 'US-CA'], owner: 'dados' },
  { activity: 'Marketing e ciclo de vida', tables: ['lifecycle_sends', 'notifications', 'waitlist_entries'], purposeBasis: 'Consentimento (type=marketing), revogável; opt-out por canal', recipients: ['Provedor de e-mail/push'], retention: '180 d (envios) / 90 d (notificações)', jurisdiction: ['BR', 'EU', 'US-CA'], owner: 'growth' },
  { activity: 'Indicações e antifraude', tables: ['referrals', 'device_fingerprints'], purposeBasis: 'Legítimo interesse (prevenção a fraude) — fingerprint em hash, 90 d', recipients: [], retention: '90 d (fingerprints)', jurisdiction: ['BR', 'EU'], owner: 'growth' },
  { activity: 'Direitos do titular e conformidade', tables: ['consents', 'data_export_requests', 'deletion_requests', 'audit_logs'], purposeBasis: 'Obrigação legal (LGPD/GDPR) e prova de consentimento', recipients: [], retention: 'Consentimentos e audit_logs 5 anos; exports 7 d', jurisdiction: ['BR', 'EU', 'US-CA'], owner: 'dpo' },
  { activity: 'Operação e confiabilidade (incidentes)', tables: ['incidents', 'incident_updates', 'status_subscribers'], purposeBasis: 'Legítimo interesse (segurança e continuidade); consentimento para assinantes da status page', recipients: ['Slack', 'PagerDuty'], retention: 'Incidentes 3 anos; assinantes até cancelar', jurisdiction: ['BR', 'EU'], owner: 'sre' },
];
export async function classifyTable(table: string): Promise<string[]> {
  const cols = (await pool.query<{ column_name: string | null }>(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table])).rows.map((r) => r.column_name as string); const cats = new Set<string>();
  for (const c of cols) for (const [re, label] of PII_RULES) if (re.test(c)) cats.add(label); return [...cats];
}
export const ropaService = {
  async autoPopulate(): Promise<{ upserted: number; skipped: string[] }> {
    let upserted = 0; const skipped: string[] = [];
    for (const a of ACTIVITIES) {
      const existing = (await pool.query<{ table_name: string | null }>(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1)`, [a.tables])).rows.map((r) => r.table_name as string);
      if (!existing.length) { skipped.push(a.activity); continue; } const cats = new Set<string>(); for (const t of existing) for (const c of await classifyTable(t)) cats.add(c);
      await pool.query(`INSERT INTO compliance_ropa (processing_activity, purpose_basis, data_categories, recipients, retention, jurisdiction, source, owner) VALUES ($1,$2,$3,$4,$5,$6,'auto',$7)
        ON CONFLICT (processing_activity) DO UPDATE SET purpose_basis=EXCLUDED.purpose_basis, data_categories=EXCLUDED.data_categories, recipients=EXCLUDED.recipients, retention=EXCLUDED.retention, jurisdiction=EXCLUDED.jurisdiction, owner=EXCLUDED.owner, updated_at=now()`,
        [a.activity, a.purposeBasis, [...cats], a.recipients, a.retention, a.jurisdiction, a.owner]); upserted++;
    }
    return { upserted, skipped };
  },
  async list() { return (await pool.query<Row<'compliance_ropa'>>('SELECT * FROM compliance_ropa ORDER BY processing_activity')).rows; },
  /** Atividades com tabelas inexistentes no schema ou desatualizadas (> 12 meses) — para a revisão anual. */
  async stale() { return (await pool.query<{ processing_activity: string; updated_at: Date }>(`SELECT processing_activity, updated_at FROM compliance_ropa WHERE updated_at < now() - interval '12 months' ORDER BY updated_at`)).rows; },
};
