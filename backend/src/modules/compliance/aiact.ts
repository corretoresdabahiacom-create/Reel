import { pool } from '../../db/pool.js';
import { PROVIDER_MATRIX } from '../cost-optimization/matrix.js';
/**
 * Registro de modelos/provedores de IA (AI Act). Classificação do NexusReel: RISCO LIMITADO (geração de conteúdo sintético sem uso em áreas de alto risco do Anexo III) =>
 * obrigações de transparência (art. 50): rotular conteúdo gerado, informar o usuário que interage com IA, metadados legíveis por máquina. Não é prática proibida (art. 5).
 * Reclassificar se o produto passar a: identificação biométrica, avaliação de pessoas (emprego/crédito), manipulação de comportamento — ver docs/COMPLIANCE/AI_ACT.md.
 */
export const COMMON_MITIGATIONS = ['Marca visível "Gerado por IA" (UE) + metadados ai_generated + manifesto C2PA-style por vídeo', 'Moderação de roteiro/imagens antes da geração', 'Consentimento específico para IA (type=ai) e canal de remoção', 'Sem uso de dados de usuário para treinar modelos de terceiros (cláusula contratual)', 'Registro de uso (ai_usage) e teto de custo por plano'];
export const aiActService = {
  /** Registra provedores integrados em produção (exclui mock) com finalidade e mitigação. Idempotente. */
  async sync() {
    let n = 0; const purposeOf = (k: string) => (k === 'video' ? 'Geração de cenas de vídeo a partir de texto e fotos' : k === 'tts' ? 'Síntese de voz (dublagem e narração)' : 'Moderação de conteúdo');
    const items = [...PROVIDER_MATRIX.filter((p) => p.integrated && p.name !== 'mock').map((p) => ({ provider: p.name, purpose: purposeOf(p.kind) })), { provider: 'openai-moderation', purpose: purposeOf('moderation') }];
    for (const i of items) { await pool.query(`INSERT INTO ai_act_registrations (model_provider, purpose, risk_classification, mitigations) VALUES ($1,$2,'limited',$3) ON CONFLICT (model_provider, purpose) DO UPDATE SET mitigations=EXCLUDED.mitigations, updated_at=now()`, [i.provider, i.purpose, COMMON_MITIGATIONS]); n++; }
    return { registered: n };
  },
  async list() { return (await pool.query<{ id: string; model_provider: string; purpose: string; risk_classification: string; mitigations: string[]; dpia_id: string | null; data_region: string | null; updated_at: Date; dpia_status: string | null }>(`SELECT r.*, d.status AS dpia_status FROM ai_act_registrations r LEFT JOIN dpia_records d ON d.id=r.dpia_id ORDER BY model_provider`)).rows; },
  /** Provedores registrados sem DPIA aprovado — pendência de conformidade. */
  async gaps() { return (await pool.query<{ model_provider: string; purpose: string }>(`SELECT r.model_provider, r.purpose FROM ai_act_registrations r LEFT JOIN dpia_records d ON d.id=r.dpia_id AND d.status='approved' WHERE d.id IS NULL ORDER BY 1`)).rows; },
};
