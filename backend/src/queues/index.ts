import { sloRecord } from '../modules/sre/record.js';
import { Queue, Worker, type Job, type JobsOptions, type Processor } from 'bullmq';
import { makeRedis } from '../db/redis.js';
import { env } from '../config/env.js';
import { logger } from '../observability/logger.js';
import { m } from '../observability/metrics.js';
import { injectTrace, runWithTrace, span } from '../observability/tracing.js';
import { captureError } from '../observability/sentry.js';
import { PLATFORMS } from '../utils/validate.js';

/** BullMQ não aceita ':' no nome → `generation:scene` do spec vira `generation-scene`. */
export const Q = {
  storyboard: 'generation-storyboard', scene: 'generation-scene', assemble: 'generation-assemble', dubbing: 'dubbing-video',
  batchGenerate: 'batch-generate', batchPublish: 'batch-publish', tracking: 'affiliates-tracking',
  export: 'compliance-export', deletion: 'compliance-deletion', emails: 'emails', whStripe: 'webhooks-stripe', whAffiliates: 'webhooks-affiliates', maintenance: 'maintenance', growth: 'growth-jobs', ops: 'ops-jobs',
  audioMix: 'audio-mix', // Módulo 1 (ff_audio)
  backgroundEdit: 'background-edit', // Módulo 2 (ff_background)
  elementsInsert: 'elements-insert', // Módulo 3 (ff_elements)
  mergeProjects: 'merge-projects', // Módulo 4 (ff_merge) — `merge:projects` no spec (BullMQ não aceita ':')
  saveExport: 'save-export', // Módulo 5 (ff_save)
  assetsDerive: 'assets-derive', // Módulo 6 (ff_assets) — `assets:derive` no spec
  emailShare: 'email-share', // Módulo 7 (ff_email): prepara o ZIP do lote e dispara os e-mails
  transcriptGenerate: 'transcript-generate', // Módulo 9 (ff_transcript) — `transcript:generate` no spec (transcrição e prévias de edição por texto)
  agentExecute: 'agent-execute', // Módulo 9 (ff_agent) — `agent:execute` no spec
  sealApply: 'seal-apply', // Módulo 10 (ff_seal): assinatura C2PA embutida no MP4
  accessibilityGenerate: 'accessibility-generate', // Módulo 11 (ff_accessibility) — `accessibility:generate` no spec
  publication: (p: string) => `publication-${p}`,
} as const;
export const ALL_QUEUES: string[] = [Q.storyboard, Q.scene, Q.assemble, Q.dubbing, Q.batchGenerate, Q.batchPublish, Q.tracking, Q.export, Q.deletion, Q.emails, Q.whStripe, Q.whAffiliates, Q.maintenance, Q.growth, Q.ops, Q.audioMix, Q.backgroundEdit, Q.elementsInsert, Q.mergeProjects, Q.saveExport, Q.assetsDerive, Q.emailShare, Q.transcriptGenerate, Q.agentExecute, Q.sealApply, Q.accessibilityGenerate, ...PLATFORMS.map(Q.publication)];
/** Concorrência padrão (spec); multiplicada por WORKER_CONCURRENCY_SCALE. */
export const CONCURRENCY: Record<string, number> = {
  [Q.storyboard]: 20, [Q.scene]: 10, [Q.assemble]: 10, [Q.dubbing]: 5, [Q.batchGenerate]: 5, [Q.batchPublish]: 5, [Q.tracking]: 50,
  [Q.export]: 2, [Q.deletion]: 2, [Q.emails]: 20, [Q.whStripe]: 10, [Q.whAffiliates]: 10, [Q.maintenance]: 2, [Q.growth]: 2, [Q.ops]: 2, [Q.audioMix]: 4, [Q.backgroundEdit]: 4, [Q.elementsInsert]: 4, [Q.mergeProjects]: 2, [Q.saveExport]: 4, [Q.assetsDerive]: 2, [Q.emailShare]: 2, [Q.transcriptGenerate]: 2, [Q.agentExecute]: 2, [Q.sealApply]: 2, [Q.accessibilityGenerate]: 2, ...Object.fromEntries(PLATFORMS.map((p) => [Q.publication(p), 10])),
};
export const dlqName = (q: string) => `${q}-dlq`;
/** Prioridade (BullMQ: menor = antes): business > pro > free. */
export const PRIORITY: Record<string, number> = { business: 1, pro: 2, free: 10 };
const DEFAULT_JOB: JobsOptions = { attempts: 3, backoff: { type: 'exponential', delay: Number(process.env.QUEUE_BACKOFF_MS ?? 2000) }, removeOnComplete: { age: 3600, count: 1000 }, removeOnFail: { age: 7 * 86400 } };

const queues = new Map<string, Queue>(); let sharedConn: ReturnType<typeof makeRedis> | undefined;
export function getQueue(name: string): Queue {
  let q = queues.get(name);
  if (!q) { sharedConn ??= makeRedis(); q = new Queue(name, { connection: sharedConn, prefix: env.QUEUE_PREFIX, defaultJobOptions: DEFAULT_JOB }); queues.set(name, q); }
  return q;
}
export interface Envelope<T> { data: T; trace: Record<string, string>; userId?: string }
export async function enqueue<T extends object>(queue: string, name: string, data: T, opts: JobsOptions & { plan?: string; userId?: string } = {}): Promise<Job> {
  const { plan, userId, ...o } = opts;
  const job = await getQueue(queue).add(name, { data, trace: injectTrace(), userId } satisfies Envelope<T>, { ...o, priority: o.priority ?? (plan ? PRIORITY[plan] : undefined) });
  m.queueDepth.inc({ queue }, 0); return job;
}
/** SLIs de jobs: sucesso/latência de geração, dublagem e publicação (limiares dos .slo.yaml). Retries contam como falha de tentativa (conservador). */
function recordJobSlo(queue: string, ok: boolean, ms: number): void {
  if (queue.startsWith('generation-')) sloRecord('generation-success-rate', ok);
  if (queue === Q.scene && ok) sloRecord('generation-scene-latency', ms <= 90_000);
  if (queue === Q.dubbing) { sloRecord('dubbing-success-rate', ok); if (ok) sloRecord('dubbing-latency', ms <= 600_000); }
  if (queue.startsWith('publication-') && ok) sloRecord('publication-latency', ms <= 300_000);
}
const workers: Worker[] = [];
/** Worker com retry/backoff (3x), DLQ após esgotar tentativas, métricas e propagação de trace. */
export function startWorker<T extends object>(queue: string, processor: (data: T, job: Job) => Promise<unknown>, concurrency?: number): Worker {
  const proc: Processor = async (job) => {
    const env_ = job.data as Envelope<T>; const t0 = Date.now();
    return runWithTrace(env_.trace, () => span(`job ${queue}`, { queue, jobId: String(job.id), attempt: job.attemptsMade + 1 }, async () => {
      try { const r = await processor(env_.data, job); const ms = Date.now() - t0; m.jobDuration.observe({ queue }, ms); recordJobSlo(queue, true, ms); return r; }
      catch (e) { m.jobFailures.inc({ queue }); recordJobSlo(queue, false, Date.now() - t0); throw e; }
    }));
  };
  sharedConn ??= makeRedis();
  const w = new Worker(queue, proc, { connection: makeRedis(), prefix: env.QUEUE_PREFIX, concurrency: Math.max(1, Math.round((concurrency ?? CONCURRENCY[queue] ?? 5) * env.WORKER_CONCURRENCY_SCALE)) });
  w.on('failed', async (job, err) => {
    if (!job) return; logger.warn({ queue, jobId: job.id, attempt: job.attemptsMade, err: err.message }, 'job falhou');
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await getQueue(dlqName(queue)).add('dead', { original: job.data, name: job.name, error: err.message, failedAt: new Date().toISOString(), attempts: job.attemptsMade }, { removeOnComplete: false, attempts: 1 }).catch(() => undefined);
      captureError(err, { route: `queue:${queue}` });
    }
  });
  w.on('error', (e) => logger.error({ queue, err: e.message }, 'erro de worker'));
  workers.push(w); return w;
}
/** Graceful shutdown: para de pegar jobs novos e aguarda os em andamento. */
export async function closeQueues(): Promise<void> {
  await Promise.all(workers.splice(0).map((w) => w.close())); await Promise.all([...queues.values()].map((q) => q.close())); queues.clear();
  if (sharedConn) { await sharedConn.quit().catch(() => undefined); sharedConn = undefined; }
}
let metricsTimer: NodeJS.Timeout | undefined;
export function startQueueMetrics(everyMs = 10_000): void {
  if (metricsTimer) return;
  const tick = async () => { for (const q of ALL_QUEUES) { try {
    const c = await getQueue(q).getJobCounts('waiting', 'active', 'delayed'); m.queueDepth.set({ queue: q }, c.waiting + c.active + c.delayed);
    const d = await getQueue(dlqName(q)).getJobCounts('waiting', 'completed'); m.dlqSize.set({ queue: q }, (d.waiting ?? 0) + (d.completed ?? 0)); } catch { /* redis indisponível */ } } };
  metricsTimer = setInterval(() => void tick(), everyMs); metricsTimer.unref(); void tick();
}
export const stopQueueMetrics = () => { if (metricsTimer) clearInterval(metricsTimer); metricsTimer = undefined; };
export async function queueSnapshot(): Promise<Record<string, { waiting: number; active: number; delayed: number; failed: number; dlq: number }>> {
  const out: Record<string, { waiting: number; active: number; delayed: number; failed: number; dlq: number }> = {};
  for (const q of ALL_QUEUES) { const c = await getQueue(q).getJobCounts('waiting', 'active', 'delayed', 'failed'); const d = await getQueue(dlqName(q)).getJobCounts('waiting', 'completed'); out[q] = { waiting: c.waiting ?? 0, active: c.active ?? 0, delayed: c.delayed ?? 0, failed: c.failed ?? 0, dlq: (d.waiting ?? 0) + (d.completed ?? 0) }; }
  return out;
}
