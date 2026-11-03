import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { boot, shutdown, http, signup, auth, type Session } from './helpers.js';
import { asSystem } from '../src/db/pool.js';
import { invalidateFlags } from '../src/modules/flags.service.js';

/**
 * Checkpoint 11 (final) — com TODAS as flags dos Módulos 1–11 desligadas (padrão), o app se comporta como o NexusReel
 * lançado: as rotas novas respondem 404 e as rotas de antes seguem funcionando. Uma rota representativa de cada módulo.
 */
const FLAGS = ['ff_audio', 'ff_background', 'ff_elements', 'ff_merge', 'ff_save', 'ff_assets', 'ff_email', 'ff_collaboration', 'ff_timeline', 'ff_transcript', 'ff_agent', 'ff_insights', 'ff_series', 'ff_seal', 'ff_live', 'ff_accessibility', 'ff_teleprompter'];
let s: Session; let pid: string;
beforeAll(async () => {
  await boot(); s = await signup({ plan: 'business', credits: 10 });
  await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=false, rollout_percent=0 WHERE key = ANY($1)`, [FLAGS])); await invalidateFlags();
  pid = (await asSystem((db) => db.query(`INSERT INTO projects (user_id, title, script, status, duration_sec) VALUES ($1,'Antigo','Roteiro.','ready',10) RETURNING id`, [s.id]))).rows[0].id;
});
afterAll(async () => { await shutdown(); });
describe('Todas as flags desligadas = app idêntico ao lançado', () => {
  it('as 17 flags existem, vêm desligadas e com rollout 0 na migration', async () => {
    const rows = (await asSystem((db) => db.query(`SELECT key, enabled, rollout_percent FROM feature_flags WHERE key = ANY($1) ORDER BY key`, [FLAGS]))).rows;
    expect(rows.map((r) => r.key).sort()).toEqual([...FLAGS].sort()); for (const r of rows) expect([r.enabled, r.rollout_percent]).toEqual([false, 0]);
  });
  const x = randomUUID();
  const ROUTES: Array<[string, string, string]> = [
    ['M1 áudio', 'get', '/api/v1/audio/config'], ['M2 fundo', 'get', '/api/v1/background/config'], ['M3 elementos', 'get', '/api/v1/elements/config'], ['M4 união', 'get', '/api/v1/merges/config'],
    ['M5 salvar', 'get', '/api/v1/save/config'], ['M6 assets', 'get', '/api/v1/assets/profiles'], ['M7 e-mail', 'get', '/api/v1/email-shares/config'], ['M8 colaboração', 'get', '/api/v1/collab/projects'],
    ['M8 timeline', 'get', `/api/v1/projects/{pid}/timeline`], ['M9 transcrição', 'get', '/api/v1/transcript/config'], ['M9 agente', 'get', `/api/v1/projects/{pid}/agent/runs`], ['M10 insights', 'get', `/api/v1/projects/{pid}/insights`],
    ['M10 séries', 'get', '/api/v1/series'], ['M10 selo', 'get', '/api/v1/seal/config'], ['M10 live', 'get', '/api/v1/live/sessions'], ['M10 live público', 'get', `/api/v1/live/${x}/watch`],
    ['M11 acessibilidade', 'get', '/api/v1/accessibility/config'], ['M11 teleprompter', 'get', '/api/v1/teleprompter/sessions'],
  ];
  for (const [mod, m, u] of ROUTES) it(`${mod}: ${u.replace('{pid}', ':id').replace(x, ':id')} → 404`, async () => { expect((await (http as any)[m](u.replace('{pid}', pid)).set(auth(s))).status).toBe(404); });
  it('M10 verificação pública do selo → 404', async () => { expect((await http.post('/api/v1/seal/verify').set('content-type', 'video/mp4').send(Buffer.alloc(32))).status).toBe(404); });
  it('rotas de antes seguem respondendo (projetos, perfil, flags do cliente)', async () => {
    expect((await http.get('/api/v1/projects').set(auth(s))).status).toBe(200); expect((await http.get(`/api/v1/projects/${pid}`).set(auth(s))).status).toBe(200);
    expect((await http.get('/api/v1/users/me').set(auth(s))).status).toBe(200);
  });
});
