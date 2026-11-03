/**
 * Taxonomia canônica de eventos (versionada). Fonte única: o endpoint de ingestão valida contra ela, o dbt a usa como
 * lista de eventos esperados e docs/ANALYTICS_TAXONOMY.md é gerado/conferido a partir dela (teste de paridade).
 */
export const TAXONOMY_VERSION = 1;
export type PropType = 'string' | 'number' | 'boolean';
export interface EventDef { src: 'client' | 'server' | 'both'; category: string; desc: string; props: Record<string, PropType>; required?: string[] }
const common: Record<string, PropType> = { locale: 'string', region: 'string', country: 'string', plan: 'string', utm_source: 'string', utm_medium: 'string', utm_campaign: 'string', experiment_key: 'string', variant: 'string', surface: 'string' };
const e = (src: EventDef['src'], category: string, desc: string, props: Record<string, PropType> = {}, required: string[] = []): EventDef => ({ src, category, desc, props: { ...common, ...props }, ...(required.length ? { required } : {}) });
export const EVENTS: Record<string, EventDef> = {
  user_signed_up: e('server', 'acquisition', 'Conta criada', { method: 'string', referred: 'boolean', partner_code: 'string' }),
  onboarding_completed: e('both', 'activation', 'Onboarding concluído', { goal: 'string', steps_seen: 'number', duration_ms: 'number' }),
  consent_given: e('server', 'compliance', 'Consentimento registrado/revogado', { consent_type: 'string', accepted: 'boolean' }, ['consent_type']),
  photo_idea_viewed: e('client', 'creation', 'PhotoCoach: ideia exibida', { idea_id: 'string', category: 'string' }),
  photo_idea_used: e('client', 'creation', 'PhotoCoach: ideia usada', { idea_id: 'string', category: 'string' }),
  project_created: e('server', 'creation', 'Projeto criado', { project_id: 'string', category: 'string', template_id: 'string', photos: 'number' }, ['project_id']),
  storyboard_generated: e('server', 'creation', 'Storyboard gerado', { project_id: 'string', scenes: 'number' }, ['project_id']),
  scene_generated: e('server', 'creation', 'Cena gerada', { project_id: 'string', scene_index: 'number', provider: 'string' }, ['project_id']),
  scene_regenerated: e('server', 'creation', 'Cena regenerada', { project_id: 'string', scene_index: 'number' }, ['project_id']),
  video_assembled: e('server', 'activation', 'Vídeo final montado (ativação)', { project_id: 'string', duration_sec: 'number', is_first: 'boolean' }, ['project_id']),
  video_dubbed: e('server', 'creation', 'Vídeo dublado', { project_id: 'string', target_locale: 'string' }, ['project_id']),
  video_published: e('server', 'distribution', 'Vídeo publicado em uma plataforma', { project_id: 'string', platform: 'string', publication_id: 'string' }, ['platform']),
  publication_failed: e('server', 'distribution', 'Publicação falhou', { project_id: 'string', platform: 'string', error_code: 'string' }, ['platform']),
  template_viewed: e('client', 'marketplace', 'Template visualizado', { template_id: 'string', category: 'string', position: 'number' }, ['template_id']),
  template_used: e('both', 'marketplace', 'Template usado em um projeto', { template_id: 'string', category: 'string' }, ['template_id']),
  template_purchased: e('server', 'marketplace', 'Template comprado', { template_id: 'string', price_credits: 'number' }, ['template_id']),
  paywall_viewed: e('both', 'monetization', 'Paywall/oferta exibido', { trigger: 'string', offer: 'string', blocking: 'boolean' }, ['trigger']),
  checkout_started: e('server', 'monetization', 'Checkout iniciado', { kind: 'string', amount_cents: 'number', currency: 'string', method: 'string' }),
  subscription_started: e('server', 'monetization', 'Assinatura ativada', { plan: 'string', amount_cents: 'number', currency: 'string' }),
  credits_purchased: e('server', 'monetization', 'Créditos comprados', { credits: 'number', amount_cents: 'number', currency: 'string', method: 'string' }),
  revenue_recorded: e('server', 'monetization', 'Receita reconhecida (value = centavos BRL equivalentes)', { kind: 'string', amount_cents: 'number', currency: 'string' }),
  refund_requested: e('server', 'monetization', 'Reembolso solicitado', { kind: 'string' }),
  affiliate_link_clicked: e('server', 'affiliates', 'Clique em link de afiliado (amostrado/agregado)', { link_id: 'string', platform: 'string' }),
  affiliate_conversion: e('server', 'affiliates', 'Conversão de afiliado confirmada', { link_id: 'string', platform: 'string', amount_cents: 'number', commission_cents: 'number' }),
  referral_clicked: e('server', 'growth', 'Clique em link de indicação', { code: 'string' }),
  referral_converted: e('server', 'growth', 'Indicação ativada e recompensada', { code: 'string', credits: 'number' }),
  share_card_created: e('both', 'growth', 'Card social gerado', { project_id: 'string', channel: 'string' }),
  waitlist_joined: e('server', 'acquisition', 'Entrada na waitlist', { has_referral: 'boolean' }),
  notification_clicked: e('client', 'retention', 'Notificação clicada', { campaign_key: 'string', channel: 'string' }),
  notifications_disabled: e('server', 'retention', 'Usuário desligou notificações', { channel: 'string' }),
  experiment_exposed: e('server', 'experimentation', 'Exposição a uma variante', { experiment_key: 'string', variant: 'string' }, ['experiment_key', 'variant']),
  experiment_converted: e('server', 'experimentation', 'Conversão atribuída a um experimento', { experiment_key: 'string', variant: 'string', event: 'string' }, ['experiment_key', 'variant']),
};
// ── Guarda de PII ──────────────────────────────────────────────────────────────
const PII_KEY = /(e-?mail|phone|telefone|celular|whats|cpf|cnpj|passport|password|senha|token|secret|address|endere[cç]o|full_?name|first_?name|last_?name|^name$|^nome$|^ip$|ip_address|lat|lng|geo)/i;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i; const PHONE = /(?:\+?\d[\s().-]?){10,}/; const CPF = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
export function piiProblem(props: Record<string, unknown>): string | null {
  for (const [k, v] of Object.entries(props)) {
    if (PII_KEY.test(k)) return `propriedade '${k}' parece PII`;
    // UUIDs (ids de projeto/usuário) têm trechos de 10+ dígitos com hífen e eram tomados por telefone: o evento era descartado
    if (typeof v === 'string') { const t = v.replace(UUID_RE, ' '); if (EMAIL.test(v) || CPF.test(t) || PHONE.test(t)) return `valor de '${k}' parece PII (e-mail/telefone/CPF)`; }
  }
  return null;
}
export type Validation = { ok: true; props: Record<string, string | number | boolean | null>; quarantine: boolean } | { ok: false; reason: string };
/** Valida um evento vindo de `origin`. Desconhecido → quarentena (schema_version 0, fora dos marts); server-only vindo do client → rejeitado. */
export function validateEvent(name: string, props: Record<string, unknown>, origin: 'client' | 'server'): Validation {
  const pii = piiProblem(props); if (pii) return { ok: false, reason: `pii_detected: ${pii}` };
  const def = EVENTS[name]; if (!def) return { ok: true, props: props as Record<string, string | number | boolean | null>, quarantine: true };
  if (origin === 'client' && def.src === 'server') return { ok: false, reason: 'server_only_event' };
  const out: Record<string, string | number | boolean | null> = {};
  for (const [k, v] of Object.entries(props)) { const t = def.props[k]; if (!t) continue; if (v === null) { out[k] = null; continue; } if (typeof v !== t) return { ok: false, reason: `tipo inválido em '${k}' (esperado ${t})` }; out[k] = v as string | number | boolean; }
  for (const r of def.required ?? []) if (out[r] === undefined || out[r] === null) return { ok: false, reason: `propriedade obrigatória ausente: ${r}` };
  return { ok: true, props: out, quarantine: false };
}
