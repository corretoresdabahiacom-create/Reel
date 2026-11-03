import { pool } from '../../db/pool.js';
/** Ganchos do pipeline automático (batch). Implementado em b2b.service via registerBatchHooks para evitar import circular. */
type Hooks = { onProjectDone(projectId: string, ok: boolean, error?: string): Promise<void>; onPublicationDone(publicationId: string, ok: boolean, error?: string): Promise<void> };
let impl: Hooks | undefined;
export const registerBatchHooks = (h: Hooks) => { impl = h; };
export const batchHooks: Hooks = {
  async onProjectDone(p, ok, e) { if (impl) await impl.onProjectDone(p, ok, e); else void pool; },
  async onPublicationDone(p, ok, e) { if (impl) await impl.onPublicationDone(p, ok, e); },
};
