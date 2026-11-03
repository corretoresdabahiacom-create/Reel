import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });
const c = (name: string, help: string, labelNames: string[] = []) => new Counter({ name, help, labelNames, registers: [registry] });
const g = (name: string, help: string, labelNames: string[] = []) => new Gauge({ name, help, labelNames, registers: [registry] });
const h = (name: string, help: string, labelNames: string[] = [], buckets?: number[]) => new Histogram({ name, help, labelNames, buckets, registers: [registry] });

export const m = {
  httpRequests: c('http_requests_total', 'Requisições HTTP', ['method', 'route', 'status']),
  httpDuration: h('http_request_duration_seconds', 'Latência HTTP', ['method', 'route'], [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.25, 0.3, 0.5, 1, 2.5, 5]),
  httpErrors: c('http_errors_total', 'Respostas 5xx', ['route']),
  queueDepth: g('queue_depth', 'Jobs aguardando/ativos por fila', ['queue']),
  jobDuration: h('job_duration_ms', 'Duração dos jobs', ['queue'], [50, 200, 500, 1000, 3000, 10000, 30000, 90000, 120000, 300000, 600000]),
  jobFailures: c('job_failures_total', 'Falhas de job', ['queue']),
  dlqSize: g('dlq_size', 'Tamanho da DLQ', ['queue']),
  aiDuration: h('ai_generation_duration_ms', 'Duração de operações de IA', ['provider', 'operation'], [100, 500, 1000, 5000, 15000, 60000]),
  aiCost: c('ai_cost_cents_total', 'Custo de IA (centavos)', ['provider', 'operation']),
  aiFailures: c('ai_provider_failures_total', 'Falhas de provedor de IA', ['provider']),
  pubOk: c('publication_success_total', 'Publicações com sucesso', ['platform']),
  pubFail: c('publication_failure_total', 'Publicações com falha', ['platform']),
  mrr: g('mrr_cents', 'MRR estimado (centavos)'),
  credits: c('credits_consumed_total', 'Créditos consumidos', ['reason']),
  affCommission: c('affiliate_commission_cents_total', 'Comissões de afiliados (centavos)'),
  rateLimited: c('rate_limited_total', 'Requisições bloqueadas por rate limit', ['scope']),
  // Fase 7
  experimentAssignments: c('experiment_assignments_total', 'Atribuições de variante (primeira vez)', ['experiment', 'variant']),
  experimentExposures: c('experiment_exposures_total', 'Exposições registradas', ['experiment', 'variant']),
  experimentFallbacks: c('experiment_fallbacks_total', 'assign() caiu no fallback (controle) por erro'),
  experimentGuardrailPauses: c('experiment_guardrail_pauses_total', 'Pausas automáticas por guardrail', ['experiment']),
  churnScores: c('churn_scores_total', 'Scores de churn gerados', ['source']),
  mlRequests: c('ml_service_requests_total', 'Chamadas ao serviço de ML', ['outcome']),
  lifecycleSends: c('lifecycle_sends_total', 'Mensagens de ciclo de vida', ['campaign', 'status']),
  referralEvents: c('referral_events_total', 'Eventos de indicação', ['status']),
  recEvents: c('recommendation_events_total', 'Eventos de recomendação', ['surface', 'action']),
  paywallDecisions: c('paywall_decisions_total', 'Decisões de paywall', ['trigger', 'shown']),
  aiCostProjected: g('ai_cost_projected_month_cents', 'Projeção do custo de IA no mês (centavos)'),
  aiCostBudget: g('ai_cost_budget_month_cents', 'Orçamento mensal de IA (centavos)'),
};
