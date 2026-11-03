import { jurisdictionFor } from './matrix.js';
import { pool, tx, asSystem } from '../../db/pool.js';
import { storage } from '../../providers/storage.js';
import { audit } from '../../repositories/audit.js';
import { hashIp, sha256, decrypt } from '../../utils/crypto.js';
import { conflict, notFound, tooMany } from '../../utils/errors.js';
import { enqueue, Q } from '../../queues/index.js';
import { invalidateUserState } from '../../middlewares/auth.js';
import { logger } from '../../observability/logger.js';
import { usersRepo } from '../users/users.repository.js';
import { pseudo } from '../analytics/analytics.service.js';
import { cloudOAuth } from '../export/cloudOAuth.js';
import { invalidateConsent } from '../growth/consent.js';
import type { Row } from '../../db/rows.generated.js';

export const CONSENT_VERSION = '2026-10';
export const RETENTION_DAYS = { rawVideos: 90, logs: 30, deletionGraceDays: 30, exportLinkDays: 7 } as const;
const SECRET_KEYS = /(token|secret|password|hash|totp)/i;
const strip = (v: unknown): unknown => Array.isArray(v) ? v.map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !SECRET_KEYS.test(k)).map(([k, x]) => [k, strip(x)])) : v;

export const complianceService = {
  async recordConsents(userId: string, items: { type: string; accepted: boolean; version?: string }[], ip: string, userAgent = '') {
    return tx({ userId }, async (db) => {
      const u = (await db.query<{ country: string | null; res: string }>('SELECT country, data_residency_region AS res FROM users WHERE id=$1', [userId])).rows[0]; const jurisdiction = (u?.country && jurisdictionFor(u.country)?.code) || u?.res || 'BR';
      for (const i of items) {
        if (i.accepted) { const at = new Date(); const ipH = hashIp(ip); const ua = userAgent ? sha256(userAgent) : null; const ver = i.version ?? CONSENT_VERSION;
          // Prova de consentimento: jurisdição + versão + timestamp + hash de IP/UA, encadeados num hash de prova (verificável depois).
          await db.query('INSERT INTO consents (user_id,type,version,ip_hash,accepted_at,jurisdiction,user_agent_hash,proof_hash) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [userId, i.type, ver, ipH, at, jurisdiction, ua, sha256([userId, i.type, ver, at.toISOString(), jurisdiction, ipH, ua ?? ''].join('|'))]); }
        else await db.query('UPDATE consents SET revoked_at=now() WHERE user_id=$1 AND type=$2 AND revoked_at IS NULL', [userId, i.type]);
        await audit(db, userId, i.accepted ? 'consent.accept' : 'consent.revoke', 'consent', i.type, { version: i.version ?? CONSENT_VERSION });
      }
      return this.consents(userId, db);
    }).finally(() => invalidateConsent(userId)); // o estado de consentimento fica em cache curto (analytics/experimentos/marketing)
  },
  async consents(userId: string, db: { query: typeof pool.query } = pool) {
    const { rows } = await db.query<{ id: string; type: string; version: string; acceptedAt: Date; revokedAt: Date | null }>(`SELECT DISTINCT ON (type) id, type, version, accepted_at AS "acceptedAt", revoked_at AS "revokedAt" FROM consents WHERE user_id=$1 ORDER BY type, accepted_at DESC`, [userId]);
    return { version: CONSENT_VERSION, items: rows.map((r) => ({ ...r, active: !r.revokedAt })) };
  },
  async hasConsent(userId: string, type: string): Promise<boolean> { const r = await pool.query<{ "?column?": number | null }>('SELECT 1 FROM consents WHERE user_id=$1 AND type=$2 AND revoked_at IS NULL LIMIT 1', [userId, type]); return (r.rowCount ?? 0) > 0; },

  async requestExport(userId: string) {
    const recent = (await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM data_export_requests WHERE user_id=$1 AND requested_at > now() - interval '10 minutes'`, [userId])).rows[0].n; if (recent >= 3) throw tooMany('Limite de exportações atingido (3 por 10 min)', 600);
    const r = (await pool.query<{ id: string; status: string; requestedAt: Date }>(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id, status, requested_at AS "requestedAt"`, [userId])).rows[0];
    await audit(pool, userId, 'export.request', 'export', r.id); await enqueue(Q.export, 'export', { exportId: r.id, userId }, { jobId: `export-${r.id}` }); return r;
  },
  async getExport(userId: string, id: string) {
    const r = (await pool.query<{ id: string; status: string; storage_key: string | null; requestedAt: Date; expiresAt: Date | null }>(`SELECT id, status, storage_key, requested_at AS "requestedAt", expires_at AS "expiresAt" FROM data_export_requests WHERE id=$1 AND user_id=$2`, [id, userId])).rows[0]; if (!r) throw notFound();
    const downloadUrl = r.status === 'completed' && r.storage_key && new Date(r.expiresAt ?? 0) > new Date() ? await storage.signedGetUrl('exports', r.storage_key, RETENTION_DAYS.exportLinkDays * 86400) : undefined;
    return { id: r.id, status: r.status, requestedAt: r.requestedAt, expiresAt: r.expiresAt, downloadUrl };
  },
  /** Worker: reúne os dados do titular (sem tokens/segredos) em JSON e sobe no bucket de exports (URL assinada por 7 dias). */
  async buildExport(exportId: string, userId: string): Promise<void> {
    try {
      const data = await asSystem(async (db) => {
        const q = async (sql: string) => (await db.query(sql, [userId])).rows;
        return { exportedAt: new Date().toISOString(), consentVersion: CONSENT_VERSION,
          user: (await q('SELECT id,email,name,locale,region,plan,credits,affiliate_balance_cents,marketplace_balance_cents,created_at FROM users WHERE id=$1'))[0],
          projects: await q('SELECT * FROM projects WHERE user_id=$1'), scenes: await q('SELECT s.* FROM scenes s JOIN projects p ON p.id=s.project_id WHERE p.user_id=$1'),
          localizedVersions: await q('SELECT l.* FROM localized_versions l JOIN projects p ON p.id=l.project_id WHERE p.user_id=$1'),
          publications: await q('SELECT * FROM publications WHERE user_id=$1'), consents: await q('SELECT type,version,accepted_at,revoked_at,verified_at,(evidence_url IS NOT NULL) AS has_evidence FROM consents WHERE user_id=$1'),
          audio: { versions: await q('SELECT a.id,a.project_id,a.voice_source,a.music_track_id,a.settings,a.sfx_events,a.loudness_lufs,a.status,a.created_at FROM audio_versions a JOIN projects p ON p.id=a.project_id WHERE p.user_id=$1'),
            voiceModels: await q('SELECT id,consent_id,provider,status,created_at,deleted_at FROM voice_models WHERE user_id=$1'), generatedTracks: await q('SELECT id,title,mood,bpm,duration,created_at FROM music_tracks WHERE owner_user_id=$1') },
          projectMerges: await q('SELECT id,project_a_id,project_b_id,result_project_id,transition_type,status,duration_sec,created_at FROM project_merges WHERE user_id=$1'),
          // Módulo 5: conexões de nuvem SEM tokens (nem cifrados) e salvamentos
          cloudConnections: await q('SELECT provider,scopes,status,created_at,rotated_at FROM cloud_connections WHERE user_id=$1'),
          destinationExports: await q('SELECT id,project_id,destination,kind,status,file_name,external_url,bytes,expires_at,created_at FROM destination_exports WHERE user_id=$1'),
          derivedAssets: await q('SELECT id,source_project_id,type,device_profile,status,file_name,size_bytes,expires_at,created_at FROM derived_assets WHERE user_id=$1'), // Módulo 6
          emailShares: await q('SELECT id,project_id,asset_id,asset_kind,file_name,recipient_count,include_self,sent_at,expires_at,access_count,revoked_at,created_at FROM email_shares WHERE user_id=$1'), // Módulo 7: sem destinatários nem senha
          collaborations: await q("SELECT project_id,role,status,accepted_at,removed_at FROM project_collaborators WHERE user_id=$1"), // Módulo 8
          comments: await q('SELECT id,project_id,time_ms,body,resolved_at,created_at FROM comments WHERE author_id=$1'),
          // Módulo 9: portabilidade (LGPD art. 18 V) — a transcrição volta decifrada só para o próprio titular, no arquivo de exportação (URL assinada)
          transcripts: (await q('SELECT id,project_id,language,provider,status,word_count,duration_ms,segments_json,expires_at,created_at FROM transcripts WHERE user_id=$1')).map((t: any) => { const { segments_json: sj, ...rest } = t; let words: unknown[] = []; try { words = sj?.enc ? (JSON.parse(decrypt(sj.enc)) as { words: unknown[] }).words : []; } catch { /* chave rotacionada: só metadados */ } return { ...rest, words }; }),
          transcriptEdits: await q('SELECT id,project_id,transcript_id,ops_json,status,applied_at,created_at FROM transcript_edits WHERE user_id=$1'),
          agentRuns: await q('SELECT id,project_id,command,plan_json,status,applied,applied_at,created_at FROM agent_runs WHERE user_id=$1'),
          // Módulo 10
          predictions: await q('SELECT id,project_id,score_retention,score_ctr,score_conversion,suggestions_json,model_version,label,created_at FROM predictions WHERE user_id=$1'),
          series: await q('SELECT id,title,description,template,created_at FROM series WHERE user_id=$1'), seriesEpisodes: await q('SELECT id,series_id,project_id,"order",cta_url,cta_label,recap_text FROM series_episodes WHERE user_id=$1'),
          authenticity: await q('SELECT id,project_id,status,c2pa_manifest_embedded,manifest_label,signer_subject,seal_text,created_at FROM authenticity_records WHERE user_id=$1'),
          liveSessions: await q('SELECT id,catalog_id,title,status,ai_label_enabled,avatar_config,merchant_opt_in_at,label_impressions,started_at,ended_at,created_at FROM live_sessions WHERE owner_id=$1'),
          // Módulo 11 (portabilidade: o texto das legendas/descrições volta decifrado só para o titular)
          accessibility: (await q('SELECT id,project_id,type,locale,status,style_json,content_json,signature,reviewed_at,expires_at,created_at FROM accessibility_assets WHERE user_id=$1')).map((a: any) => { const { content_json: cj, ...rest } = a; let content: unknown = null; try { content = cj?.enc ? JSON.parse(decrypt(cj.enc)) : null; } catch { /* chave rotacionada */ } return { ...rest, content }; }),
          teleprompterSessions: await q('SELECT id,project_id,script,settings_json,(recorded_video_url IS NOT NULL) AS uploaded,upload_opt_in_at,created_at FROM teleprompter_sessions WHERE user_id=$1'),
          elementInsertions: await q('SELECT e.id,e.project_id,e.source_scene_id,e.derived_scene_id,e.action,e.type,e.mode,e.description,e.status,e.created_at FROM element_insertions e JOIN projects p ON p.id=e.project_id WHERE p.user_id=$1'),
          backgroundEdits: await q('SELECT b.id,b.project_id,b.scene_id,b.operation,b.target,b.params,b.derived_scene_id,b.status,b.created_at FROM background_edits b JOIN projects p ON p.id=b.project_id WHERE p.user_id=$1'),
          transactions: await q('SELECT type,amount_cents,credits_delta,source,created_at FROM transactions WHERE user_id=$1'), templates: await q('SELECT * FROM templates WHERE creator_id=$1'),
          growth: { notifications: await q('SELECT channel,title,body,sent_at FROM notifications WHERE user_id=$1'), notificationPreferences: await q('SELECT * FROM notification_preferences WHERE user_id=$1'), recommendationEvents: await q('SELECT surface,item_type,item_id,action,created_at FROM recommendation_events WHERE user_id=$1'), referrals: await q('SELECT code,status,created_at FROM referrals WHERE referrer_id=$1 OR referred_id=$1'), attribution: await q('SELECT source,medium,campaign,first_seen_at FROM attribution_touches WHERE user_id=$1'), experiments: await q('SELECT e.key, a.variant, a.assigned_at FROM experiment_assignments a JOIN experiments e ON e.id=a.experiment_id WHERE a.user_id=$1') },
          affiliateLinks: await q('SELECT * FROM affiliate_links WHERE user_id=$1'), payouts: await q('SELECT * FROM payout_requests WHERE user_id=$1'), connectedPlatforms: await q('SELECT platform,handle,status,created_at FROM connected_accounts WHERE user_id=$1') };
      });
      const key = `${userId}/${exportId}.json`; await storage.put('exports', key, JSON.stringify(strip(data), null, 2), 'application/json');
      await pool.query(`UPDATE data_export_requests SET status='completed', storage_key=$2, expires_at=now() + ($3 || ' days')::interval WHERE id=$1`, [exportId, key, String(RETENTION_DAYS.exportLinkDays)]);
      const u = await usersRepo.byId(pool, userId); if (u) await enqueue(Q.emails, 'export-ready', { to: u.email, template: 'export_ready', locale: u.locale, vars: { name: u.name } });
    } catch (e) { await pool.query(`UPDATE data_export_requests SET status='failed' WHERE id=$1`, [exportId]); throw e; }
  },

  async requestDeletion(userId: string) {
    const ex = (await pool.query<Pick<Row<'deletion_requests'>, 'id'>>(`SELECT id FROM deletion_requests WHERE user_id=$1 AND status='scheduled'`, [userId])).rows[0]; if (ex) throw conflict('Exclusão já agendada', 'deletion_already_scheduled');
    const when = new Date(Date.now() + RETENTION_DAYS.deletionGraceDays * 86400_000);
    const r = await tx({ userId }, async (db) => { const x = (await db.query<{ id: string; status: string; scheduledFor: Date }>(`INSERT INTO deletion_requests (user_id, scheduled_for) VALUES ($1,$2) RETURNING id, status, scheduled_for AS "scheduledFor"`, [userId, when])).rows[0];
      await db.query('UPDATE users SET deletion_scheduled_for=$2 WHERE id=$1', [userId, when]); await audit(db, userId, 'deletion.request', 'user', userId, { scheduledFor: when.toISOString() }); return x; });
    await invalidateUserState(userId); const u = await usersRepo.byId(pool, userId); if (u) await enqueue(Q.emails, 'deletion', { to: u.email, template: 'deletion_scheduled', locale: u.locale, vars: { date: when.toISOString().slice(0, 10) } });
    return r;
  },
  async cancelDeletion(userId: string) {
    const r = await pool.query(`UPDATE deletion_requests SET status='cancelled' WHERE user_id=$1 AND status='scheduled'`, [userId]); if (!r.rowCount) throw notFound('Nenhuma exclusão agendada');
    await pool.query('UPDATE users SET deletion_scheduled_for=NULL WHERE id=$1', [userId]); await audit(pool, userId, 'deletion.cancel', 'user', userId); await invalidateUserState(userId); return { cancelled: true };
  },
  /** Varredura diária: executa exclusões vencidas (hard delete + purge no storage + anonimização). */
  async runDueDeletions(now = new Date()): Promise<number> {
    const due = (await pool.query<Pick<Row<'deletion_requests'>, 'user_id'>>(`SELECT user_id FROM deletion_requests WHERE status='scheduled' AND scheduled_for <= $1`, [now])).rows as { user_id: string }[];
    for (const d of due) await enqueue(Q.deletion, 'delete-user', { userId: d.user_id }, { jobId: `delete-${d.user_id}` }).catch(() => undefined);
    return due.length;
  },
  async hardDelete(userId: string): Promise<{ filesDeleted: number }> {
    const dryEmail = `deleted-${userId}@deleted.invalid`; let files = 0;
    const projects = (await pool.query<Pick<Row<'projects'>, 'id'>>('SELECT id FROM projects WHERE user_id=$1', [userId])).rows as { id: string }[];
    for (const p of projects) files += await storage.deletePrefix('videos', `projects/${p.id}/`);
    files += await storage.deletePrefix('uploads', `${userId}/`); files += await storage.deletePrefix('exports', `${userId}/`);
    // Módulo 5: Nuvem NexusReel + revogação das nuvens conectadas (avisa o provedor e apaga os tokens)
    files += await storage.deletePrefix('videos', `derived/${userId}/`); // Módulo 6: assets derivados
    // Módulo 8: comentários em projetos de OUTRAS pessoas ficam, mas anonimizados (o autor some); participações saem
    await asSystem((db) => db.query('UPDATE comments SET author_id=NULL, anonymized=true WHERE author_id=$1', [userId]));
    files += await storage.deletePrefix('archive', `${userId}/`); await cloudOAuth.revokeAll(userId).catch(() => undefined);
    await asSystem(async (db) => {
      // dados pessoais e de conteúdo: remoção física (cascata). Transações financeiras ficam (obrigação legal, 5 anos) ligadas ao registro anonimizado.
      await db.query('DELETE FROM template_reviews WHERE user_id=$1', [userId]); await db.query('DELETE FROM projects WHERE user_id=$1', [userId]);
      await db.query('DELETE FROM templates WHERE creator_id=$1 AND NOT EXISTS (SELECT 1 FROM template_purchases tp WHERE tp.template_id=templates.id)', [userId]);
      await db.query(`UPDATE templates SET deleted_at=now(), name='[removido]', description='' WHERE creator_id=$1`, [userId]);
      for (const t of ['connected_accounts', 'cloud_connections', 'destination_exports', 'derived_assets', 'email_shares', 'agent_runs', 'transcript_edits', 'transcripts', 'predictions', 'series_episodes', 'series', 'authenticity_records', 'live_sessions', 'accessibility_assets', 'teleprompter_sessions', 'project_collaborators', 'affiliate_accounts', 'affiliate_links', 'refresh_tokens', 'api_keys', 'auth_identities', 'consents', 'data_export_requests', 'catalogs', 'analytics_events']) await db.query(`DELETE FROM ${t} WHERE ${t === 'catalogs' || t === 'live_sessions' ? 'owner_id' : 'user_id'}=$1`, [userId]);
      await db.query('UPDATE ai_usage SET user_id=NULL WHERE user_id=$1', [userId]);
      // Fase 7: dados de growth/ML ligados ao usuário (a linha de users é só anonimizada, então a cascata não dispara) + tombstone para o warehouse
      for (const t of ['notifications', 'notification_preferences', 'experiment_assignments', 'experiment_events', 'recommendation_events', 'device_fingerprints', 'lifecycle_sends', 'churn_scores', 'ltv_predictions', 'propensity_scores', 'attribution_touches']) await db.query(`DELETE FROM ${t} WHERE user_id=$1`, [userId]);
      await db.query('DELETE FROM referrals WHERE referrer_id=$1 OR referred_id=$1', [userId]);
      await db.query('UPDATE users SET churn_risk=NULL, rfm_segment=NULL, attribution_source=NULL, country=NULL, timezone=NULL, referral_code=NULL, last_seen_at=NULL WHERE id=$1', [userId]);
      await db.query('INSERT INTO erasure_queue (pseudo_id) VALUES ($1) ON CONFLICT DO NOTHING', [pseudo(userId)]);
      await db.query(`UPDATE audit_logs SET actor_id=NULL, metadata='{}'::jsonb WHERE actor_id=$1 AND action NOT LIKE 'payout.%'`, [userId]);
      await db.query(`UPDATE users SET email=$2, name='', password_hash=NULL, totp_secret_enc=NULL, birth_date=NULL, stripe_customer_id=NULL, deleted_at=now(), deletion_scheduled_for=NULL, credits=0 WHERE id=$1`, [userId, dryEmail]);
      await db.query(`UPDATE deletion_requests SET status='completed', completed_at=now() WHERE user_id=$1 AND status='scheduled'`, [userId]);
      await audit(db, null, 'deletion.completed', 'user', userId);
    });
    await invalidateUserState(userId); logger.info({ userId, files }, 'exclusão de conta concluída'); return { filesDeleted: files };
  },
};
