import { randomInt } from 'node:crypto';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { asUser, tx } from '../../db/pool.js';
import { storage } from '../../providers/storage.js';
import { withTmp } from '../../utils/ffmpeg.js';
import { decryptBuffer, encryptBuffer, hashIp, sha256 } from '../../utils/crypto.js';
import { audit } from '../../repositories/audit.js';
import { env } from '../../config/env.js';
import { detectVoice, duration, hasAudioStream } from './analysis.js';
import { audioError, msg } from './messages.js';
import { audioProviders, voiceProviderName } from './providers.js';
import type { Row } from '../../db/rows.generated.js';

export const VOICE_CONSENT_VERSION = 'voice-v1';
export type VoiceConsentStatus = 'awaiting_sample' | 'pending_review' | 'verified' | 'revoked';
interface ConsentRow { id: string; user_id: string; type: string; accepted_at: string; revoked_at: string | null; audio_sample_url: string | null; verified_at: string | null; challenge_hash: string | null }
const statusOf = (c: ConsentRow): VoiceConsentStatus => (c.revoked_at ? 'revoked' : c.verified_at ? 'verified' : c.audio_sample_url ? 'pending_review' : 'awaiting_sample');
const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const sampleKey = (userId: string, consentId: string) => `${userId}/voice/${consentId}.enc`; // bucket uploads: some com a conta (LGPD)
// Limites da amostra: curta demais não dá para verificar; ruidosa demais gera voz ruim (e facilita fraude).
export const SAMPLE_RULES = { minSec: 5, maxSec: 60, minSnrDb: 15, minActiveRatio: 0.3 };

async function load(userId: string, consentId: string): Promise<ConsentRow> {
  const c = await asUser(userId, async (db) => (await db.query<ConsentRow>(`SELECT id,user_id,type,accepted_at,revoked_at,audio_sample_url,verified_at,challenge_hash FROM consents WHERE id=$1`, [consentId])).rows[0]);
  if (!c || c.type !== 'voice_clone') throw audioError(404, 'consent_not_found', undefined, 'not_found'); // RLS: consentimento de outro usuário nem aparece
  return c;
}

/**
 * Clonagem de voz com consentimento verificado (R6), em fluxo linear e sem duplicar amostra:
 * requestConsent → uploadConsentSample → verifyConsent → cloneVoice. Sem `verified_at`, clonar dá 403.
 */
export const voiceClone = {
  /** 1) Registra o consentimento pendente e devolve uma frase única para o usuário ler na gravação. */
  async requestConsent(userId: string, meta: { ip: string; userAgent?: string; locale?: string }): Promise<{ consentId: string; phrase: string; status: VoiceConsentStatus }> {
    const code = String(randomInt(100000, 1000000));
    const phrase = msg('consent_phrase', meta.locale).replace('{code}', code);
    const id = await tx({ userId }, async (db) => {
      const at = new Date(); const ipH = hashIp(meta.ip); const ua = meta.userAgent ? sha256(meta.userAgent) : null;
      const r = await db.query<{ id: string }>(`INSERT INTO consents (user_id,type,version,ip_hash,accepted_at,user_agent_hash,proof_hash,challenge_hash) VALUES ($1,'voice_clone',$2,$3,$4,$5,$6,$7) RETURNING id`,
        [userId, VOICE_CONSENT_VERSION, ipH, at, ua, sha256([userId, 'voice_clone', VOICE_CONSENT_VERSION, at.toISOString(), ipH, ua ?? ''].join('|')), sha256(normalize(phrase))]);
      await audit(db, userId, 'consent.voice.request', 'consent', r.rows[0].id, { version: VOICE_CONSENT_VERSION }); return r.rows[0].id as string;
    });
    return { consentId: id, phrase, status: 'awaiting_sample' };
  },

  /** 2) Guarda a amostra CRIPTOGRAFADA (AES-256-GCM) no storage privado. Uma amostra por consentimento. */
  async uploadConsentSample(userId: string, consentId: string, sample: Buffer): Promise<{ consentId: string; status: VoiceConsentStatus }> {
    const c = await load(userId, consentId);
    if (c.revoked_at) throw audioError(409, 'consent_revoked');
    if (c.verified_at || c.audio_sample_url) throw audioError(409, 'sample_already_uploaded');
    if (!sample.length || sample.length > env.VOICE_SAMPLE_MAX_BYTES) throw audioError(422, 'sample_too_large', { maxBytes: env.VOICE_SAMPLE_MAX_BYTES });
    const ok = await withTmp(async (dir) => { const f = join(dir, 's'); await writeFile(f, sample); return (await hasAudioStream(f)) ? duration(f) : 0; });
    if (!ok) throw audioError(422, 'sample_invalid');
    await storage.put('uploads', sampleKey(userId, consentId), encryptBuffer(sample), 'application/octet-stream');
    const ref = `uploads/${sampleKey(userId, consentId)}`;
    const updated = await tx({ userId }, async (db) => {
      const r = await db.query<{ id: string }>(`UPDATE consents SET audio_sample_url=$2 WHERE id=$1 AND audio_sample_url IS NULL AND revoked_at IS NULL RETURNING id`, [consentId, ref]);
      if (r.rowCount) await audit(db, userId, 'consent.voice.sample', 'consent', consentId, {}); return r.rowCount === 1;
    });
    if (!updated) throw audioError(409, 'sample_already_uploaded'); // corrida entre dois envios
    return { consentId, status: 'pending_review' };
  },

  /**
   * 3) Verifica a amostra: duração, presença de fala (VAD) e ruído (SNR). Se passar, marca `verified_at`.
   * Se não passar, apaga a amostra para o usuário gravar de novo, no mesmo consentimento.
   * Conferir se a frase lida é a frase do desafio exige transcrição (Módulo 9): o hash da frase já fica guardado para isso.
   */
  async verifyConsent(userId: string, consentId: string): Promise<{ verifiedAt: string; checks: Record<string, number | boolean> }> {
    const c = await load(userId, consentId);
    if (c.revoked_at) throw audioError(409, 'consent_revoked');
    if (c.verified_at) return { verifiedAt: new Date(c.verified_at).toISOString(), checks: {} };
    if (!c.audio_sample_url) throw audioError(409, 'sample_missing');
    const sample = decryptBuffer(await storage.get('uploads', sampleKey(userId, consentId)));
    const va = await withTmp(async (dir) => { const f = join(dir, 's'); await writeFile(f, sample); return detectVoice(f); });
    const reasons: string[] = [];
    if (va.durationSec < SAMPLE_RULES.minSec) reasons.push('too_short'); if (va.durationSec > SAMPLE_RULES.maxSec) reasons.push('too_long');
    if (!va.hasVoice || va.activeRatio < SAMPLE_RULES.minActiveRatio) reasons.push('no_speech');
    else if (va.snrDb < SAMPLE_RULES.minSnrDb) reasons.push('too_noisy');
    if (reasons.length) {
      await storage.delete('uploads', sampleKey(userId, consentId));
      await tx({ userId }, async (db) => { await db.query(`UPDATE consents SET audio_sample_url=NULL WHERE id=$1`, [consentId]); await audit(db, userId, 'consent.voice.rejected', 'consent', consentId, { reasons }); });
      throw audioError(422, 'voice_sample_rejected', { reasons, rules: SAMPLE_RULES });
    }
    const at = await tx({ userId }, async (db) => {
      const r = await db.query<{ verified_at: Date | null }>(`UPDATE consents SET verified_at=now() WHERE id=$1 AND verified_at IS NULL RETURNING verified_at`, [consentId]);
      await audit(db, userId, 'consent.voice.verified', 'consent', consentId, {}); return r.rows.at(0)?.verified_at as Date | undefined;
    });
    return { verifiedAt: (at ?? new Date()).toISOString(), checks: { durationSec: va.durationSec, activeRatio: va.activeRatio, snrDb: va.snrDb, speech: va.hasVoice } };
  },

  /** 4) Cria o modelo de voz. 403 sem consentimento verificado. Um modelo por consentimento (repetir devolve o mesmo). */
  async cloneVoice(userId: string, consentId: string): Promise<{ voiceModelId: string; provider: string }> {
    const c = await load(userId, consentId);
    if (c.revoked_at || !c.verified_at || !c.audio_sample_url) throw audioError(403, 'voice_consent_required');
    const existing = await asUser(userId, async (db) => (await db.query<Pick<Row<'voice_models'>, 'id' | 'provider'>>(`SELECT id, provider FROM voice_models WHERE consent_id=$1 AND status='ready'`, [consentId])).rows[0]);
    if (existing) return { voiceModelId: existing.id, provider: existing.provider };
    const sample = decryptBuffer(await storage.get('uploads', sampleKey(userId, consentId)));
    const { providerVoiceId } = await audioProviders.createVoice(sample, { userId, consentId });
    const id = await tx({ userId }, async (db) => {
      const r = await db.query<{ id: string }>(`INSERT INTO voice_models (user_id, consent_id, provider, provider_voice_id) VALUES ($1,$2,$3,$4) RETURNING id`, [userId, consentId, voiceProviderName(), providerVoiceId]);
      await audit(db, userId, 'voice.clone', 'voice_model', r.rows[0].id, { provider: voiceProviderName() }); return r.rows[0].id as string;
    });
    return { voiceModelId: id, provider: voiceProviderName() };
  },

  /** Revoga: apaga a amostra, desativa os modelos (e pede a exclusão no provedor). A voz deixa de poder ser usada na hora. */
  async revoke(userId: string, consentId: string): Promise<{ status: VoiceConsentStatus }> {
    const c = await load(userId, consentId); if (c.revoked_at) return { status: 'revoked' };
    const models = await tx({ userId }, async (db) => {
      await db.query(`UPDATE consents SET revoked_at=now(), audio_sample_url=NULL WHERE id=$1`, [consentId]);
      const m = (await db.query<{ provider_voice_id: string }>(`UPDATE voice_models SET status='deleted', deleted_at=now() WHERE consent_id=$1 AND status='ready' RETURNING provider_voice_id`, [consentId])).rows;
      await audit(db, userId, 'consent.voice.revoke', 'consent', consentId, { models: m.length }); return m as { provider_voice_id: string }[];
    });
    await storage.delete('uploads', sampleKey(userId, consentId)).catch(() => undefined);
    for (const m of models) await audioProviders.deleteVoice(m.provider_voice_id, { userId }).catch(() => undefined);
    return { status: 'revoked' };
  },

  async list(userId: string) {
    return asUser(userId, async (db) => {
      const cs = (await db.query<ConsentRow>(`SELECT id,user_id,type,accepted_at,revoked_at,audio_sample_url,verified_at,challenge_hash FROM consents WHERE user_id=$1 AND type='voice_clone' ORDER BY accepted_at DESC LIMIT 20`, [userId])).rows;
      const ms = (await db.query<Pick<Row<'voice_models'>, 'id' | 'consent_id' | 'provider' | 'created_at'>>(`SELECT id, consent_id, provider, created_at FROM voice_models WHERE user_id=$1 AND status='ready'`, [userId])).rows;
      return cs.map((c) => ({ consentId: c.id, status: statusOf(c), requestedAt: c.accepted_at, verifiedAt: c.verified_at, revokedAt: c.revoked_at,
        voiceModels: ms.filter((m) => m.consent_id === c.id).map((m) => ({ id: m.id, provider: m.provider, createdAt: m.created_at })) }));
    });
  },

  /** Para a mixagem: o modelo precisa estar ativo E o consentimento continuar verificado e não revogado. */
  async usableVoice(userId: string, voiceModelId: string): Promise<string> {
    const r = await asUser(userId, async (db) => (await db.query<{ provider_voice_id: string; verified_at: Date | null; revoked_at: Date | null }>(`SELECT v.provider_voice_id, c.verified_at, c.revoked_at FROM voice_models v JOIN consents c ON c.id = v.consent_id
      WHERE v.id=$1 AND v.user_id=$2 AND v.status='ready'`, [voiceModelId, userId])).rows[0]);
    if (!r || !r.verified_at || r.revoked_at) throw audioError(403, 'voice_consent_required');
    return r.provider_voice_id as string;
  },
};
