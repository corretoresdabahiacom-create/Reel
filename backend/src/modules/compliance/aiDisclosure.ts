import { createHash } from 'node:crypto';
import { pool } from '../../db/pool.js';
import { isEnabled } from '../flags.service.js';
/**
 * AI Act (art. 50, transparência): todo vídeo gerado carrega (1) metadados de arquivo ai_generated=true, (2) manifesto sidecar "<video>.c2pa.json" com asserções no formato C2PA
 * (c2pa.created + digitalSourceType trainedAlgorithmicMedia) e hash SHA-256 do arquivo, e (3) marca visível "Gerado por IA" onde a flag `ai_disclosure_visible` se aplica (padrão: usuários da UE).
 * LIMITAÇÃO: o manifesto NÃO está assinado/embutido (C2PA completo exige `c2patool` + certificado). Está pronto para ser assinado por um passo de pós-processamento.
 */
export async function disclosureFor(userId: string): Promise<{ visible: boolean; label: string }> {
  const u = (await pool.query<{ region: string; plan: string; locale: string }>(`SELECT region, plan::text plan, locale FROM users WHERE id=$1`, [userId])).rows[0]; const visible = await isEnabled('ai_disclosure_visible', { userId, region: u?.region, plan: u?.plan });
  const label = ({ en: 'AI generated', es: 'Generado por IA' } as Record<string, string>)[String(u?.locale ?? '').slice(0, 2)] ?? 'Gerado por IA'; return { visible, label };
}
export function c2paAssertion(file: Buffer, o: { visible: boolean }) {
  return { '@context': 'https://c2pa.org/specifications/', claim_generator: 'NexusReel', claim_generator_info: [{ name: 'NexusReel', version: process.env.APP_VERSION ?? 'dev' }], signed: false, created_at: new Date().toISOString(),
    assertions: [{ label: 'c2pa.actions', data: { actions: [{ action: 'c2pa.created', digitalSourceType: 'http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia' }] } }, { label: 'c2pa.hash.data', data: { alg: 'sha256', hash: createHash('sha256').update(file).digest('hex') } }, { label: 'nexusreel.ai_disclosure', data: { aiGenerated: true, visibleLabel: o.visible, regulation: 'EU AI Act art. 50' } }] };
}
