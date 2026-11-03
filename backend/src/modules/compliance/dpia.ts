import { pool } from '../../db/pool.js';
import { audit } from '../../repositories/audit.js';
import { AppError, notFound } from '../../utils/errors.js';
import { JURISDICTIONS, jurisdictionFor } from './matrix.js';
import { ropaService } from './ropa.js';
import { camelOut } from '../../utils/case.js';
import type { Row } from '../../db/rows.generated.js';

/**
 * DPIA assistido: gera rascunho estruturado a partir do que o sistema JÁ sabe (ROPA, residência, subprocessadores, retenção, uso de IA) + do "assunto" informado.
 * Redação = regras determinísticas (generated_by='template'). Um redator LLM pode ser plugado via `setDraftWriter` — mesmo assim a REVISÃO HUMANA é obrigatória:
 * aprovação exige revisor humano (usuário admin) e bloqueia se houver risco alto sem mitigação.
 */
export interface DpiaSubject { kind: 'ai_provider' | 'subprocessor' | 'jurisdiction' | 'data_type'; name: string; purpose: string; dataCategories: string[]; countries?: string[]; transferOutsideRegion?: boolean; processesMinors?: boolean; automatedDecisions?: boolean; special?: string[]; dpaSigned?: boolean; region?: string }
export interface Risk { id: string; risk: string; likelihood: 'baixa' | 'media' | 'alta'; severity: 'baixa' | 'media' | 'alta'; level: 'baixo' | 'medio' | 'alto'; mitigations: string[] }
const LV = { baixa: 1, media: 2, alta: 3 }; const lvl = (l: keyof typeof LV, s: keyof typeof LV): Risk['level'] => (LV[l] * LV[s] >= 6 ? 'alto' : LV[l] * LV[s] >= 3 ? 'medio' : 'baixo');
export function assessRisks(s: DpiaSubject): Risk[] {
  const r: Risk[] = []; const add = (id: string, risk: string, l: keyof typeof LV, sev: keyof typeof LV, mitigations: string[]) => r.push({ id, risk, likelihood: l, severity: sev, level: lvl(l, sev), mitigations });
  const media = s.dataCategories.some((c) => /m[ií]dia|foto|imagem|v[ií]deo/i.test(c)); const faces = media && (s.kind === 'ai_provider' || s.kind === 'subprocessor');
  if (faces) add('R1', 'Fotos enviadas podem conter rostos de terceiros e dados biométricos potenciais enviados a provedor externo', 'media', 'alta', ['Consentimento específico de IA (type=ai) antes do envio', 'Contrato/DPA proibindo uso para treino de modelo', 'Minimização: enviar apenas referências necessárias', 'Retenção curta no provedor (zero-retention quando disponível)']);
  if (s.transferOutsideRegion) add('R2', 'Transferência internacional de dados pessoais', 'media', 'media', ['SCC/cláusulas-padrão + avaliação de impacto da transferência (TIA)', 'Roteamento por residência (data_residency_routes)', 'Criptografia em trânsito e em repouso']);
  if (s.dpaSigned === false) add('R3', 'Provedor sem DPA assinado', 'alta', 'alta', ['Bloquear uso em produção até assinatura do DPA', 'Registrar em subprocessors com status pending_dpa']);
  if (s.processesMinors) add('R4', 'Tratamento de dados de menores', 'media', 'alta', ['Verificação de idade no cadastro (<13 bloqueado; 13-17 com restrições)', 'Sem perfilamento comercial de menores']);
  if (s.automatedDecisions) add('R5', 'Decisão automatizada com efeito relevante (ex.: bloqueio, preço individualizado)', 'baixa', 'alta', ['Revisão humana de bloqueios', 'Não usar churn/propensão para negar serviço ou individualizar preço']);
  if (s.special?.length) add('R6', `Categorias especiais de dados: ${s.special.join(', ')}`, 'media', 'alta', ['Base legal específica (consentimento explícito)', 'Pseudonimização e acesso restrito']);
  if (s.kind === 'ai_provider') add('R7', 'Conteúdo sintético enganoso (deepfake) ou violação de direitos de imagem', 'media', 'media', ['Rotulagem AI Act art. 50 (marca visível + metadados C2PA-style)', 'Moderação de roteiro e imagens', 'Canal de denúncia/remoção']);
  if (s.kind === 'jurisdiction') add('R8', 'Operar em jurisdição sem matriz de obrigações revisada', 'media', 'alta', ['Matriz atualizada e aprovada por jurídico local', 'Rollout por feature flag regional com kill switch']);
  if (!r.length) add('R0', 'Risco baixo identificado pelas regras automáticas', 'baixa', 'baixa', ['Manter monitoramento e revisão anual']);
  return r;
}
let writer: ((draft: Record<string, unknown>) => Promise<Record<string, unknown>>) | null = null; export const setDraftWriter = (w: typeof writer) => { writer = w; };
export async function buildDraft(s: DpiaSubject): Promise<{ content: Record<string, any>; generatedBy: string }> {
  const ropa = await ropaService.list(); const tokens = s.dataCategories.flatMap((d) => d.toLowerCase().split(/[^a-zà-ÿ]+/).filter((t) => t.length >= 4).map((t) => t.slice(0, 5)));
  const nm = s.name.toLowerCase().split(/\s+/)[0]!;
  // Atividades relacionadas: o fornecedor consta como destinatário, OU (provedor de IA) a atividade de geração por IA, OU categorias de dados afins (por radical).
  const related = ropa.filter((x) => (x.recipients as string[]).some((r) => r.toLowerCase().includes(nm)) || (s.kind === 'ai_provider' && /\bIA\b/.test(x.processing_activity)) || x.data_categories.some((c: string) => tokens.some((t) => c.toLowerCase().includes(t))));
  const subs = (await pool.query<Pick<Row<'subprocessors'>, 'name' | 'status' | 'dpa_signed_at'>>('SELECT name, status, dpa_signed_at FROM subprocessors WHERE name ILIKE $1', [s.name])).rows[0]; const risks = assessRisks({ ...s, dpaSigned: s.dpaSigned ?? (subs ? !!subs.dpa_signed_at : undefined) });
  const jur = (s.countries ?? []).map((c) => jurisdictionFor(c)).filter((j): j is NonNullable<typeof j> => !!j); const routes = (await pool.query<Pick<Row<'data_residency_routes'>, 'user_region' | 'data_type' | 'storage_region'>>(`SELECT user_region, data_type, storage_region FROM data_residency_routes ORDER BY 1,2`)).rows;
  const high = risks.filter((r) => r.level === 'alto'); const content: Record<string, any> = {
    title: `DPIA — ${s.name}`, subject: s, purpose: s.purpose, legalBasis: s.kind === 'ai_provider' ? 'Execução de contrato (gerar vídeo solicitado) + consentimento específico para IA (type=ai)' : 'Execução de contrato / legítimo interesse (documentar teste de balanceamento)',
    dataCategories: s.dataCategories, dataSubjects: ['Usuários (criadores/vendedores)', 'Terceiros presentes em mídias enviadas'], recipients: [s.name, ...new Set(related.flatMap((x) => x.recipients as string[]))],
    retention: related.map((x) => `${x.processing_activity}: ${x.retention}`), transfers: { outsideRegion: !!s.transferOutsideRegion, residencyRoutes: camelOut(routes.filter((x) => !s.region || x.user_region === s.region)) }, jurisdictions: jur.map((j) => ({ code: j.code, law: j.law, dsarDays: j.dsarDays, status: j.status })),
    necessityProportionality: 'Dados limitados ao necessário para a finalidade; sem reutilização para treino de modelos de terceiros (exigir em contrato).', risks, residualRisk: high.every((r) => r.mitigations.length) ? (high.length ? 'medio' : 'baixo') : 'alto', blockers: high.filter((r) => !r.mitigations.length).map((r) => r.id),
    dpoConsultation: high.length > 0, reviewCadence: 'anual e a cada mudança significativa (novo provedor, jurisdição ou tipo de dado)', humanReviewRequired: true, status: 'rascunho — não publicar sem revisão humana',
  };
  if (writer) return { content: await writer(content), generatedBy: 'llm+template' }; return { content, generatedBy: 'template' };
}
export function renderDpiaMarkdown(name: string, c: Record<string, any>): string {
  return `# ${c.title ?? name}\n\n> **${c.status}** — Revisão humana obrigatória (DPO/jurídico) antes de aprovar.\n\n## 1. Finalidade\n${c.purpose}\n\n## 2. Base legal\n${c.legalBasis}\n\n## 3. Dados e titulares\n- Categorias: ${(c.dataCategories ?? []).join(', ')}\n- Titulares: ${(c.dataSubjects ?? []).join('; ')}\n\n## 4. Destinatários\n${(c.recipients ?? []).map((x: string) => `- ${x}`).join('\n')}\n\n## 5. Retenção\n${(c.retention ?? []).map((x: string) => `- ${x}`).join('\n') || '- n/d'}\n\n## 6. Transferências\nFora da região: ${c.transfers?.outsideRegion ? 'sim' : 'não'}. Rotas de residência: ${(c.transfers?.residencyRoutes ?? []).map((r: any) => `${r.user_region}/${r.data_type}→${r.storage_region}`).join(', ')}\n\n## 7. Necessidade e proporcionalidade\n${c.necessityProportionality}\n\n## 8. Riscos e mitigações\n${(c.risks ?? []).map((r: Risk) => `- **${r.id}** [${r.level}] ${r.risk} (prob. ${r.likelihood}, grav. ${r.severity})\n${r.mitigations.map((m) => `  - ${m}`).join('\n')}`).join('\n')}\n\n**Risco residual:** ${c.residualRisk}${c.blockers?.length ? `\n**Bloqueios:** ${c.blockers.join(', ')}` : ''}\n\n## 9. Jurisdições\n${(c.jurisdictions ?? []).map((j: any) => `- ${j.code}: ${j.law} — DSAR ${j.dsarDays} d — matriz: ${j.status}`).join('\n') || '- n/d'}\n\n## 10. Revisão\n${c.reviewCadence}\n`;
}
export const dpiaService = {
  async create(authorId: string | null, s: DpiaSubject) {
    const d = await buildDraft(s); const row = (await pool.query<Row<'dpia_records'>>(`INSERT INTO dpia_records (name, status, subject, content, generated_by) VALUES ($1,'in_review',$2,$3,$4) RETURNING *`, [d.content.title, JSON.stringify(s), JSON.stringify(d.content), d.generatedBy])).rows[0]!;
    await audit(pool, authorId ?? 'system', 'dpia.create', 'dpia', row.id, { subject: s.name }); return { ...row, markdown: renderDpiaMarkdown(row.name, d.content) };
  },
  async get(id: string) { const r = (await pool.query<Row<'dpia_records'>>('SELECT * FROM dpia_records WHERE id=$1', [id])).rows[0]; if (!r) throw notFound('DPIA não encontrado'); return { ...r, markdown: renderDpiaMarkdown(r.name, r.content as Record<string, any>) }; },
  async list() { return (await pool.query<Pick<Row<'dpia_records'>, 'id' | 'name' | 'status' | 'generated_by' | 'reviewed_at' | 'next_review_at' | 'created_at'>>('SELECT id, name, status, generated_by, reviewed_at, next_review_at, created_at FROM dpia_records ORDER BY created_at DESC')).rows; },
  /** Aprovação humana: bloqueia com risco alto sem mitigação; ao aprovar registra/atualiza ROPA, subprocessador e AI Act, e agenda a revisão anual. */
  async review(id: string, reviewerId: string, b: { decision: 'approve' | 'reject'; notes?: string }) {
    const r = (await pool.query<Row<'dpia_records'>>('SELECT * FROM dpia_records WHERE id=$1', [id])).rows[0]; if (!r) throw notFound('DPIA não encontrado'); if (r.status === 'approved') throw new AppError(409, 'already_approved', 'DPIA já aprovado');
    if (b.decision === 'reject') { await pool.query(`UPDATE dpia_records SET status='rejected', reviewed_by=$2, reviewed_at=now() WHERE id=$1`, [id, reviewerId]); await audit(pool, reviewerId, 'dpia.reject', 'dpia', id, { notes: b.notes }); return this.get(id); }
    const c = r.content as Record<string, any>; if (c.blockers?.length) throw new AppError(422, 'dpia_blocked', `Riscos altos sem mitigação: ${c.blockers.join(', ')}`);
    const s = r.subject as DpiaSubject; await pool.query(`UPDATE dpia_records SET status='approved', reviewed_by=$2, reviewed_at=now(), next_review_at=now() + interval '1 year' WHERE id=$1`, [id, reviewerId]);
    const jur = (s.countries ?? []).map((x) => jurisdictionFor(x)?.code ?? x);
    await pool.query(`INSERT INTO compliance_ropa (processing_activity, purpose_basis, data_categories, recipients, retention, jurisdiction, source, owner) VALUES ($1,$2,$3,$4,$5,$6,'dpia',$7)
      ON CONFLICT (processing_activity) DO UPDATE SET purpose_basis=EXCLUDED.purpose_basis, data_categories=EXCLUDED.data_categories, recipients=EXCLUDED.recipients, retention=EXCLUDED.retention, jurisdiction=EXCLUDED.jurisdiction, source='dpia', updated_at=now()`,
      [`${s.kind === 'ai_provider' ? 'Processamento por provedor de IA' : s.kind === 'jurisdiction' ? 'Operação na jurisdição' : 'Tratamento'}: ${s.name}`, c.legalBasis, s.dataCategories, [s.name], (c.retention ?? []).join(' | ') || 'conforme política', jur.length ? jur : ['BR'], 'dpo']);
    if (s.kind === 'ai_provider' || s.kind === 'subprocessor') await pool.query(`INSERT INTO subprocessors (name, purpose, location, status) VALUES ($1,$2,$3,'pending_dpa') ON CONFLICT (name) DO NOTHING`, [s.name, s.purpose, s.region ?? 'a definir']);
    if (s.kind === 'ai_provider') await pool.query(`INSERT INTO ai_act_registrations (model_provider, purpose, risk_classification, mitigations, dpia_id, data_region) VALUES ($1,$2,'limited',$3,$4,$5) ON CONFLICT (model_provider, purpose) DO UPDATE SET dpia_id=$4, updated_at=now()`, [s.name, s.purpose, ['Marca visível + metadados C2PA-style', 'Moderação de entrada', 'Sem treino com dados do usuário (contrato)'], id, s.region ?? null]);
    await audit(pool, reviewerId, 'dpia.approve', 'dpia', id, { notes: b.notes }); return this.get(id);
  },
  /** Gate: operar numa jurisdição exige matriz 'ready' e DPIA aprovado para ela. */
  async jurisdictionGate(country: string) {
    const j = jurisdictionFor(country); if (!j) return { allowed: false, country, reason: 'Jurisdição sem entrada na matriz de conformidade (docs/COMPLIANCE/MATRIX.md)' };
    const d = (await pool.query<{ id: string }>(`SELECT id FROM dpia_records WHERE status='approved' AND subject->>'kind'='jurisdiction' AND (subject->'countries') ? $1 AND (next_review_at IS NULL OR next_review_at > now()) LIMIT 1`, [country.toUpperCase()])).rows[0];
    const allowed = j.status === 'ready' && (!!d || ['BR'].includes(j.code)); return { allowed, country: country.toUpperCase(), jurisdiction: j.code, matrixStatus: j.status, dpiaApproved: !!d, reason: allowed ? 'ok' : j.status !== 'ready' ? `Matriz ${j.code} está "${j.status}": complete as obrigações` : `Falta DPIA aprovado para ${country.toUpperCase()}` };
  },
  matrix() { return JURISDICTIONS; },
};
