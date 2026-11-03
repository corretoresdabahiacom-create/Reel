import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { boot, shutdown, http, signup, auth, uploadPhoto, type Session } from './helpers.js';
import { createRlsPool, type RlsPool } from '../src/db/pool.js';
import { runWithDbCtx, type DbCtx } from '../src/db/context.js';
import { isEnabled, flagsFor } from '../src/modules/flags.service.js';
import { env } from '../src/config/env.js';
import { projectsRepo } from '../src/modules/projects/projects.repository.js';
import { splitSteps } from '../src/db/migrate.js';
import { readFileSync } from 'node:fs';

/**
 * Módulo 0 (migration 0008): só acréscimos.
 * - cenas existentes continuam version=1, sem derivação, e a API de projetos devolve o mesmo que antes;
 * - versão derivada entra como linha nova (o original não muda) e a unicidade vale por (projeto, índice, versão);
 * - consentimentos aceitam os 4 tipos novos no banco; a API pública ainda não (entra com o módulo que usar);
 * - as 17 flags ff_* existem e estão desligadas para qualquer usuário, região ou plano;
 * - o RLS continua fechado para as colunas novas.
 */
const FLAGS = ['ff_audio', 'ff_background', 'ff_elements', 'ff_merge', 'ff_save', 'ff_assets', 'ff_email', 'ff_collaboration', 'ff_timeline',
  'ff_transcript', 'ff_agent', 'ff_insights', 'ff_series', 'ff_seal', 'ff_live', 'ff_accessibility', 'ff_teleprompter',
  'ff_voice_studio', 'ff_sections']; // + estúdio de voz (migration 0023) e seções de 15 s (0024): também nascem desligadas
let a: Session; let b: Session; let rls: RlsPool; let projectId: string;
const as = <T>(ctx: DbCtx, fn: () => Promise<T>) => runWithDbCtx(ctx, fn);
const sys = <T>(fn: () => Promise<T>) => as({ system: true }, fn);

beforeAll(async () => {
  await boot(false); rls = createRlsPool(env.DATABASE_URL);
  a = await signup({ plan: 'pro', credits: 100 }); b = await signup({ plan: 'pro', credits: 100 });
  const photo = await uploadPhoto(a);
  const r = await http.post('/api/v1/projects').set(auth(a)).send({ title: 'M0', script: 'Cena um. Cena dois. Cena três.', photos: [photo] });
  expect(r.status).toBe(201); projectId = r.body.id ?? r.body.project?.id;
  await sys(() => rls.query(`INSERT INTO scenes (project_id, index, text) VALUES ($1, 900, 'original')`, [projectId]));
});
afterAll(async () => { await rls.end(); await shutdown(); });

describe('Módulo 0 — preparação', () => {
  it('cenas existentes: version=1 e sem derivação', async () => {
    const { rows } = await sys(() => rls.query(`SELECT version, derived_from_scene_id FROM scenes WHERE project_id=$1`, [projectId]));
    expect(rows.length).toBeGreaterThan(0);
    for (const s of rows) { expect(s.version).toBe(1); expect(s.derived_from_scene_id).toBeNull(); }
  });

  it('derivado entra como linha nova com version+1 e não altera o original; duplicata da mesma versão é recusada', async () => {
    await sys(async () => {
      const orig = (await rls.query(`SELECT id, text, version FROM scenes WHERE project_id=$1 AND index=900`, [projectId])).rows[0];
      await rls.query(`INSERT INTO scenes (project_id, index, text, version, derived_from_scene_id) VALUES ($1, 900, 'derivado', $2, $3)`, [projectId, orig.version + 1, orig.id]);
      const after = (await rls.query(`SELECT text, version FROM scenes WHERE id=$1`, [orig.id])).rows[0];
      expect(after).toEqual({ text: 'original', version: 1 });
      await expect(rls.query(`INSERT INTO scenes (project_id, index, text, version) VALUES ($1, 900, 'dup', 2)`, [projectId])).rejects.toThrow(/scenes_project_index_version_key/);
      await expect(rls.query(`INSERT INTO scenes (project_id, index, text, version) VALUES ($1, 901, 'x', 0)`, [projectId])).rejects.toThrow(/check/i);
      // ON DELETE SET NULL: apagar o original não apaga o derivado
      await rls.query(`DELETE FROM scenes WHERE id=$1`, [orig.id]);
      expect((await rls.query(`SELECT derived_from_scene_id FROM scenes WHERE project_id=$1 AND index=900`, [projectId])).rows).toEqual([{ derived_from_scene_id: null }]);
      await rls.query(`DELETE FROM scenes WHERE project_id=$1 AND index=900`, [projectId]);
    });
  });

  it('consentimentos: banco aceita os tipos novos e recusa tipo desconhecido; colunas novas nascem nulas', async () => {
    await sys(async () => {
      for (const t of ['voice_clone', 'person_image', 'avatar_live', 'external_provider']) {
        const r = await rls.query(`INSERT INTO consents (user_id, type, version, ip_hash) VALUES ($1,$2,'v1','h') RETURNING audio_sample_url, verified_at`, [a.id, t]);
        expect(r.rows[0]).toEqual({ audio_sample_url: null, verified_at: null });
      }
      await expect(rls.query(`INSERT INTO consents (user_id, type, version) VALUES ($1,'qualquer','v1')`, [a.id])).rejects.toThrow(/consents_type_check/);
    });
  });

  it('RLS: outro usuário e anônimo não veem cenas nem consentimentos (inclusive colunas novas)', async () => {
    await sys(() => rls.query(`INSERT INTO scenes (project_id, index, text) VALUES ($1, 902, 'rls')`, [projectId]));
    const q = (sql: string, p: unknown[]) => async (ctx: DbCtx) => (await as(ctx, () => rls.query(sql, p))).rows.length;
    const scenes = q(`SELECT version, derived_from_scene_id FROM scenes WHERE project_id=$1`, [projectId]);
    const consents = q(`SELECT audio_sample_url, verified_at FROM consents WHERE user_id=$1`, [a.id]);
    expect(await scenes({ userId: a.id })).toBeGreaterThan(0); expect(await consents({ userId: a.id })).toBeGreaterThan(0);
    for (const ctx of [{ userId: b.id }, {}] as DbCtx[]) { expect(await scenes(ctx)).toBe(0); expect(await consents(ctx)).toBe(0); }
    await expect(as({ userId: b.id }, () => rls.query(`INSERT INTO consents (user_id, type, version) VALUES ($1,'voice_clone','v1')`, [a.id]))).rejects.toThrow(/row-level security/);
  });

  it('API pública de consentimento ainda não aceita os tipos novos (sem mudança de código no M0)', async () => {
    const r = await http.post('/api/v1/users/me/consents').set(auth(a)).send({ items: [{ type: 'voice_clone', accepted: true, version: 'v1' }] });
    expect([400, 422]).toContain(r.status);
    const ok = await http.post('/api/v1/users/me/consents').set(auth(a)).send({ items: [{ type: 'ai', accepted: true, version: 'v1' }] });
    expect(ok.status).toBe(201);
  });

  it('as 17 flags ff_* existem e estão desligadas para qualquer contexto', async () => {
    const { rows } = await sys(() => rls.query(`SELECT key, enabled, rollout_percent FROM feature_flags WHERE key LIKE 'ff\\_%' ORDER BY key`));
    expect(rows.map((r) => r.key).sort()).toEqual([...FLAGS].sort());
    for (const r of rows) { expect(r.enabled).toBe(false); expect(r.rollout_percent).toBe(0); }
    for (const ctx of [{}, { userId: a.id, plan: 'business', region: 'BR' }]) {
      const all = await flagsFor(ctx as never);
      for (const k of FLAGS) { expect(all[k]).toBe(false); expect(await isEnabled(k, ctx as never)).toBe(false); }
    }
  });

  it('API de projetos responde como antes (cenas ordenadas, sem duplicatas)', async () => {
    const r = await http.get(`/api/v1/projects/${projectId}`).set(auth(a));
    expect(r.status).toBe(200);
    const scenes = (r.body.scenes ?? r.body.project?.scenes ?? []) as Array<{ index: number }>;
    const idx = scenes.map((s) => s.index); expect(new Set(idx).size).toBe(idx.length); expect([...idx].sort((x, y) => x - y)).toEqual(idx);
  });

  it('risco "cenas repetidas" eliminado: com uma versão derivada, a API e o repositório mostram só a mais recente por posição', async () => {
    await sys(async () => {
      const base = (await rls.query(`INSERT INTO scenes (project_id, index, text) VALUES ($1, 950, 'v1') RETURNING id`, [projectId])).rows[0];
      await rls.query(`INSERT INTO scenes (project_id, index, text, version, derived_from_scene_id) VALUES ($1, 950, 'v2', 2, $2)`, [projectId, base.id]);
      const cur = await projectsRepo.scenes(rls as never, projectId);
      expect(cur.filter((x) => x.index === 950).map((x) => x.text)).toEqual(['v2']);
      expect((await projectsRepo.sceneVersions(rls as never, projectId, 950)).map((x) => x.text)).toEqual(['v2', 'v1']); // original recuperável
    });
    const r = await http.get(`/api/v1/projects/${projectId}`).set(auth(a)); expect(r.status).toBe(200);
    const sc = (r.body.scenes ?? []) as Array<{ index: number; text: string; version?: unknown }>;
    expect(sc.filter((x) => x.index === 950).map((x) => x.text)).toEqual(['v2']);
    const idx = sc.map((x) => x.index); expect(new Set(idx).size).toBe(idx.length);
    expect(sc[0]).not.toHaveProperty('version'); // contrato da API inalterado
    await sys(() => rls.query(`DELETE FROM scenes WHERE project_id=$1 AND index=950`, [projectId]));
  });

  it('risco "volume alto": índices válidos, constraints validadas e 0009 sem transação, idempotente e com lock_timeout', async () => {
    const idx = (await sys(() => rls.query(`SELECT indexrelid::regclass::text n, indisvalid v FROM pg_index WHERE indrelid='scenes'::regclass`))).rows;
    const names = idx.map((x) => x.n);
    for (const n of ['scenes_project_index_version_key', 'idx_scenes_derived_from', 'idx_scenes_chained_from']) expect(names).toContain(n);
    expect(names).not.toContain('scenes_project_id_index_key'); expect(names.some((n: string) => n.endsWith('_build'))).toBe(false);
    expect(idx.every((x) => x.v)).toBe(true);
    const cons = (await sys(() => rls.query(`SELECT conname, convalidated FROM pg_constraint WHERE conname IN ('scenes_version_check','scenes_derived_from_scene_id_fkey','consents_type_check')`))).rows;
    expect(cons).toHaveLength(3); expect(cons.every((c) => c.convalidated)).toBe(true);
    const up = readFileSync('migrations/0009_scene_version_unique.up.sql', 'utf8');
    expect(up.startsWith('-- migrate:no-transaction')).toBe(true); expect(up).toContain("SET lock_timeout = '5s'");
    const steps = splitSteps(up);
    expect(steps.filter((x) => /^CREATE (UNIQUE )?INDEX/m.test(x)).every((x) => x.includes('CONCURRENTLY'))).toBe(true);
    expect(steps.every((x) => !/^\s*(BEGIN|COMMIT)\b/m.test(x))).toBe(true);
    // a 0008 só tem operações instantâneas: constraints NOT VALID e nenhum CREATE INDEX (que travaria escritas)
    const m8 = readFileSync('migrations/0008_module0_preparation.up.sql', 'utf8');
    expect(m8).not.toMatch(/^CREATE (UNIQUE )?INDEX/m); expect((m8.match(/NOT VALID;/g) ?? []).length).toBe(3);
  });
});
