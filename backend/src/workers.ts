import { startWorker, getQueue, Q, startQueueMetrics } from './queues/index.js';
import { PLATFORMS } from './utils/validate.js';
import { generationService } from './modules/generation/generation.service.js';
import { dubbingService } from './modules/dubbing/dubbing.service.js';
import { publicationService } from './modules/publication/publication.service.js';
import { b2bService } from './modules/b2b/b2b.service.js';
import { affiliatesService } from './modules/affiliates/affiliates.service.js';
import { paymentsService } from './modules/payments/payments.service.js';
import { complianceService } from './modules/compliance/compliance.service.js';
import { integrationsService } from './modules/integrations/integrations.service.js';
import { sendEmail, type EmailJob } from './modules/emails/email.service.js';
import { pool } from './db/pool.js';
import { runRetention } from './jobs/retention.js';
import { logger } from './observability/logger.js';
import { lifecycleService } from './modules/retention/lifecycle.service.js';
import { retentionService } from './modules/retention/retention.service.js';
import { experimentsService } from './modules/experiments/experiments.service.js';
import { datascienceService } from './modules/datascience/datascience.service.js';
import { warehouseService } from './modules/datascience/warehouse.service.js';
import { env } from './config/env.js';
import { transcriptService } from './modules/transcript/transcriptService.js';
import { agentService } from './modules/agent/agentService.js';
import { authenticityService } from './modules/authenticity/authenticityService.js';
import { accessibilityService } from './modules/accessibility/accessibilityService.js';
import { sreService } from './modules/sre/sre.service.js';
import { incidentsService } from './modules/incidents/incidents.service.js';
import { finopsService } from './modules/finops/finops.service.js';
import { ropaService } from './modules/compliance/ropa.js';
import { aiActService } from './modules/compliance/aiact.js';
import { oncallService } from './modules/oncall/oncall.service.js';
import { runPolicyRetention } from './workers/retention.js';
import './modules/b2b/b2b.service.js';
import { audioService } from './modules/audio/audio.service.js';
import { backgroundService } from './modules/background/backgroundService.js';
import { elementInserter } from './modules/elements/elementInserter.js';
import { mergeService } from './modules/merge/mergeService.js';
import { storageExportService } from './modules/export/storageExportService.js';
import { derivedAssetsService } from './modules/assets/derivedAssetsService.js';
import { emailShareService } from './modules/emailShare/emailShareService.js';
import { purgeProjectFiles, purgeDueProjects } from './modules/projects/projects.purge.js';

const final = (job: { attemptsMade: number; opts: { attempts?: number } }) => job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
/** Inicia todos os workers (ou só os de `only`). Cada fila tem concorrência própria (spec) e DLQ no esgotamento de retries. */
export function startAllWorkers(only?: string[]): void {
  const on = (q: string) => !only || only.includes(q);
  if (on(Q.storyboard)) startWorker<any>(Q.storyboard, (d) => generationService.processStoryboard(d));
  if (on(Q.scene)) startWorker<any>(Q.scene, (d, j) => generationService.processScene(d, final(j)));
  if (on(Q.assemble)) startWorker<any>(Q.assemble, (d) => generationService.processAssemble(d));
  if (on(Q.dubbing)) startWorker<any>(Q.dubbing, (d, j) => dubbingService.process(d, final(j)));
  if (on(Q.audioMix)) startWorker<any>(Q.audioMix, (d, j) => audioService.processMix(d, final(j)));
  if (on(Q.backgroundEdit)) startWorker<any>(Q.backgroundEdit, (d, j) => backgroundService.process(d, final(j)));
  if (on(Q.elementsInsert)) startWorker<any>(Q.elementsInsert, (d, j) => elementInserter.process(d, final(j)));
  if (on(Q.mergeProjects)) startWorker<any>(Q.mergeProjects, (d, j) => mergeService.mergeProjects(d, final(j)));
  if (on(Q.saveExport)) startWorker<any>(Q.saveExport, (d, j) => storageExportService.process(d, final(j)));
  if (on(Q.assetsDerive)) startWorker<any>(Q.assetsDerive, (d, j) => derivedAssetsService.process(d, final(j)));
  if (on(Q.transcriptGenerate)) startWorker<any>(Q.transcriptGenerate, (d, j) => j.name === 'edit' ? transcriptService.processEdit(d, final(j)) : transcriptService.processTranscribe(d, final(j)));
  if (on(Q.agentExecute)) startWorker<any>(Q.agentExecute, (d, j) => agentService.process(d, final(j)));
  if (on(Q.accessibilityGenerate)) startWorker<any>(Q.accessibilityGenerate, (d, j) => accessibilityService.process(j.name, d, final(j)));
  if (on(Q.sealApply)) startWorker<any>(Q.sealApply, (d, j) => authenticityService.process(d, final(j)));
  if (on(Q.emailShare)) startWorker<any>(Q.emailShare, (d) => emailShareService.processZip(d));
  for (const p of PLATFORMS) if (on(Q.publication(p))) startWorker<any>(Q.publication(p), (d, j) => publicationService.process(d, j));
  if (on(Q.batchGenerate)) startWorker<any>(Q.batchGenerate, (d) => b2bService.processBatchGenerate(d));
  if (on(Q.batchPublish)) startWorker<any>(Q.batchPublish, (d) => b2bService.processBatchPublish(d));
  if (on(Q.tracking)) startWorker<any>(Q.tracking, async () => { const n = await affiliatesService.flushClicks(); return { flushed: n }; });
  if (on(Q.whAffiliates)) startWorker<any>(Q.whAffiliates, async (d: any) => { if (d.linkId && d.orderId) return affiliatesService.recordConversion(d); await pool.query(`UPDATE webhook_events SET processed_at=now() WHERE id=$1`, [d.webhookId]); });
  if (on(Q.whStripe)) startWorker<any>(Q.whStripe, async (d: any) => { await paymentsService.applyEvent(d.provider, { id: d.id, type: d.type, data: d.data }); await pool.query(`UPDATE webhook_events SET processed_at=now() WHERE id=$1`, [d.webhookId]); });
  if (on(Q.export)) startWorker<any>(Q.export, (d) => complianceService.buildExport(d.exportId, d.userId));
  if (on(Q.deletion)) startWorker<any>(Q.deletion, async (d) => complianceService.hardDelete(d.userId));
  if (on(Q.emails)) startWorker<EmailJob>(Q.emails, (d) => sendEmail(d));
  if (on(Q.maintenance)) startWorker<any>(Q.maintenance, async (d: any, j) => {
    switch (j.name) {
      case 'refresh-tokens': return { refreshed: await integrationsService.refreshExpiring() };
      case 'due-deletions': return { deleted: await complianceService.runDueDeletions() };
      case 'retention': case 'purge-clicks': return runRetention();
      case 'audio-retention': return audioService.purgeExpired();
      case 'save-retention': return storageExportService.purgeExpired();
      case 'assets-retention': return derivedAssetsService.purgeExpired();
      case 'transcript-retention': return transcriptService.purgeExpired();
      case 'project-purge': return purgeProjectFiles(String(d.projectId));
      case 'project-purge-recheck': return purgeProjectFiles(String(d.projectId), 'system', { force: true });
      case 'deleted-projects-retention': return purgeDueProjects();
      case 'accessibility-retention': return accessibilityService.purgeExpired();
      default: logger.warn({ job: j.name, d }, 'job de manutenção desconhecido');
    }
  });
  if (on(Q.growth)) startWorker<any>(Q.growth, async (_d: any, j) => {
    switch (j.name) {
      case 'churn-refresh': return retentionService.refreshScores();
      case 'rfm-refresh': return retentionService.refreshRfm();
      case 'lifecycle-run': { const runs = await lifecycleService.run(); return { campaigns: runs.length, sent: runs.reduce((a, r) => a + r.sent, 0) }; }
      case 'lifecycle-conversions': return lifecycleService.markConversions();
      case 'guardrails-check': return { results: (await experimentsService.checkGuardrails()).length };
      case 'ai-cost-forecast': return datascienceService.forecastAiCost();
      case 'warehouse-export': return warehouseService.run();
      default: logger.warn({ job: j.name }, 'job de growth desconhecido');
    }
  });
  if (on(Q.ops)) startWorker<any>(Q.ops, async (_d: any, j) => {
    switch (j.name) {
      case 'slo-collect': return sreService.collect();
      case 'slo-evaluate': return { fired: (await sreService.evaluate(Date.now(), { openIncidents: true })).fired.length };
      case 'cost-snapshot': return finopsService.snapshot();
      case 'cost-guard': return finopsService.guard();
      case 'ropa-refresh': { const r = await ropaService.autoPopulate(); await aiActService.sync(); return r; }
      case 'policy-retention': return runPolicyRetention({ dryRun: false });
      case 'incident-sla': { const o = await incidentsService.overdueUpdates(); const p = (await incidentsService.postmortemSla()).filter((x) => x.overdue); if (o.length || p.length) logger.warn({ overdueUpdates: o.length, postmortemsOverdue: p.length }, 'SLA de comunicação/postmortem em atraso'); return { overdueUpdates: o.length }; }
      case 'burnout-report': { const l = await oncallService.load(30); logger.info({ l }, 'carga de on-call'); return { people: Array.isArray((l as any).people) ? (l as any).people.length : 0 }; }
      default: logger.warn({ job: j.name }, 'job de ops desconhecido');
    }
  });
  startQueueMetrics();
}
/** Agendamentos recorrentes (idempotentes: upsertJobScheduler). */
export async function scheduleRecurring(): Promise<void> {
  const mq = getQueue(Q.maintenance); const tr = getQueue(Q.tracking); const env_ = (name: string) => ({ data: { data: {}, trace: {} } as object, name });
  await mq.upsertJobScheduler('refresh-tokens', { every: 10 * 60_000 }, { name: 'refresh-tokens', data: env_('x').data });
  await mq.upsertJobScheduler('due-deletions', { every: 60 * 60_000 }, { name: 'due-deletions', data: env_('x').data });
  await mq.upsertJobScheduler('retention', { every: 24 * 3600_000 }, { name: 'retention', data: env_('x').data });
  await mq.upsertJobScheduler('purge-clicks', { every: 24 * 3600_000 }, { name: 'purge-clicks', data: env_('x').data });
  await mq.upsertJobScheduler('audio-retention', { every: 24 * 3600_000 }, { name: 'audio-retention', data: env_('x').data });
  await mq.upsertJobScheduler('save-retention', { every: 24 * 3600_000 }, { name: 'save-retention', data: env_('x').data });
  await mq.upsertJobScheduler('assets-retention', { every: 24 * 3600_000 }, { name: 'assets-retention', data: env_('x').data });
  await mq.upsertJobScheduler('accessibility-retention', { every: 24 * 3600_000 }, { name: 'accessibility-retention', data: env_('x').data });
  await mq.upsertJobScheduler('transcript-retention', { every: 24 * 3600_000 }, { name: 'transcript-retention', data: env_('x').data });
  await mq.upsertJobScheduler('deleted-projects-retention', { every: 24 * 3600_000 }, { name: 'deleted-projects-retention', data: env_('x').data });
  if (env.GROWTH_JOBS_ENABLED) {
    const gq = getQueue(Q.growth); const g = (name: string, every: number) => gq.upsertJobScheduler(name, { every }, { name, data: env_('x').data });
    await g('churn-refresh', 24 * 3600_000); await g('rfm-refresh', 24 * 3600_000); await g('lifecycle-run', 60 * 60_000); await g('lifecycle-conversions', 60 * 60_000);
    await g('guardrails-check', 15 * 60_000); await g('ai-cost-forecast', 6 * 3600_000); await g('warehouse-export', 15 * 60_000);
  }
  if (env.OPS_JOBS_ENABLED) {
    const oq = getQueue(Q.ops); const o = (name: string, every: number) => oq.upsertJobScheduler(name, { every }, { name, data: env_('x').data });
    await o('slo-collect', 5 * 60_000); await o('slo-evaluate', 5 * 60_000); await o('cost-snapshot', 24 * 3600_000); await o('cost-guard', 15 * 60_000); await o('ropa-refresh', 7 * 24 * 3600_000);
    await o('policy-retention', 24 * 3600_000); await o('incident-sla', 5 * 60_000); await o('burnout-report', 7 * 24 * 3600_000);
  }
  await tr.upsertJobScheduler('flush-clicks', { every: Number(process.env.CLICK_FLUSH_MS ?? 5000) }, { name: 'flush', data: env_('x').data });
}
