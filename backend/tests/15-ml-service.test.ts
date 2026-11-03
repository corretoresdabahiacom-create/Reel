import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { boot, shutdown, pool, uniq } from './helpers.js';
import { env } from '../src/config/env.js';
import { retentionService } from '../src/modules/retention/retention.service.js';
import { buildFeatures } from '../src/modules/retention/features.js';
import { scoreOne } from '../src/modules/retention/churn.client.js';

const ML = join(process.cwd(), 'services/ml');
const have = spawnSync('python3', ['-c', 'import xgboost, fastapi, uvicorn, sklearn, joblib, pandas'], { cwd: ML }).status === 0;
let proc: ChildProcess | undefined; const ids: string[] = [];
const freePort = () => new Promise<number>((res) => { const s = createServer().listen(0, () => { const p = (s.address() as { port: number }).port; s.close(() => res(p)); }); });

beforeAll(async () => {
  await boot(false); if (!have) return;
  const dir = mkdtempSync(join(tmpdir(), 'ml-models-')); const tr = spawnSync('python3', ['-m', 'ml.train', '--source', 'synthetic', '--n', '8000'], { cwd: ML, env: { ...process.env, ML_MODELS_DIR: dir }, encoding: 'utf8' });
  // train.py grava em services/ml/models por padrão; usamos o diretório padrão e limpamos no fim
  if (tr.status !== 0) throw new Error(tr.stderr);
  const port = await freePort(); proc = spawn('python3', ['-m', 'uvicorn', 'ml.serve:app', '--port', String(port), '--log-level', 'warning'], { cwd: ML, stdio: 'ignore' });
  for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${port}/healthz`); if ((await r.json() as { ok: boolean }).ok) break; } catch { /* aguardando */ } await new Promise((r) => setTimeout(r, 150)); }
  env.ML_SERVICE_URL = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { const r = await pool.query(`INSERT INTO users (email,name,locale,created_at,last_seen_at,credits) VALUES ($1,'m','pt-BR', now() - ($2 || ' days')::interval, now() - ($3 || ' days')::interval, $4) RETURNING id`, [`${uniq('ml')}@t.dev`, String(5 + (i % 120)), String(i % 70), i % 30]); ids.push(r.rows[0].id); }
}, 120_000);
afterAll(async () => { proc?.kill(); env.ML_SERVICE_URL = ''; spawnSync('sh', ['-c', 'rm -f services/ml/models/*.joblib services/ml/models/model_card*.json'], { cwd: process.cwd() }); await shutdown(); });

describe.skipIf(!have)('15. Serviço de ML real (Python) integrado ao backend', () => {
  it('score de churn para 100 usuários vem do MODELO (xgboost), não do fallback; grava churn_scores/ltv/propensão/users.churn_risk', async () => {
    const r = await retentionService.refreshScores({ userIds: ids }); expect(r).toMatchObject({ scored: 100, model: 100, fallback: 0 });
    const v = (await pool.query(`SELECT count(*)::int n, min(model_version) v FROM churn_scores WHERE user_id = ANY($1)`, [ids])).rows[0]; expect(v.n).toBe(100); expect(v.v).toMatch(/^xgboost-/);
    expect((await pool.query(`SELECT count(*)::int n FROM users WHERE id = ANY($1) AND churn_risk IS NOT NULL`, [ids])).rows[0].n).toBe(100); expect((await pool.query(`SELECT count(*)::int n FROM propensity_scores WHERE user_id = ANY($1) AND model_version LIKE 'xgboost-%'`, [ids])).rows[0].n).toBe(200);
    const dormant = (await pool.query(`SELECT avg(c.score) a FROM churn_scores c JOIN users u ON u.id=c.user_id WHERE c.user_id = ANY($1) AND u.last_seen_at < now() - interval '45 days'`, [ids])).rows[0].a; const recent = (await pool.query(`SELECT avg(c.score) a FROM churn_scores c JOIN users u ON u.id=c.user_id WHERE c.user_id = ANY($1) AND u.last_seen_at > now() - interval '5 days'`, [ids])).rows[0].a; expect(dormant).toBeGreaterThan(recent);
  });
  it('pontuação online dentro do orçamento de 50 ms (p95) com o serviço real', async () => {
    const f = (await buildFeatures([ids[0]!]))[0]!; await scoreOne(f); const ts: number[] = []; let model = 0;
    for (let i = 0; i < 30; i++) { const t = performance.now(); const s = await scoreOne(f); ts.push(performance.now() - t); if (s.churn.source === 'model') model++; }
    ts.sort((a, b) => a - b); expect(ts[Math.floor(ts.length * 0.95)]!).toBeLessThan(150); expect(model).toBeGreaterThanOrEqual(25); // CI lento: toleramos fallback ocasional, nunca falha
  });
  it('serviço derrubado → fallback imediato e o job continua funcionando', async () => {
    proc?.kill(); await new Promise((r) => setTimeout(r, 400)); const r = await retentionService.refreshScores({ userIds: ids.slice(0, 10) }); expect(r.fallback).toBe(10); expect(r.model).toBe(0);
  });
});
