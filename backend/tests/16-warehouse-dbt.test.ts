import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { boot, shutdown, http, signup, auth, type Session } from './helpers.js';
import { env } from '../src/config/env.js';
import { redis } from '../src/db/redis.js';
import { warehouseService } from '../src/modules/datascience/warehouse.service.js';
import { loadLocal } from '../scripts/warehouse-load-local.js';

const DWH = 'nexus_dwh_test'; const base = (process.env.TEST_DATABASE_URL ?? 'postgres://postgres@127.0.0.1:55432/nexus_test').replace(/\/[^/]*$/, '');
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/; let s: Session;
beforeAll(async () => { await boot(); s = await signup(); const a = new pg.Client({ connectionString: `${base}/postgres` }); await a.connect(); await a.query(`DROP DATABASE IF EXISTS ${DWH}`); await a.query(`CREATE DATABASE ${DWH}`); await a.end(); }, 60_000);
afterAll(() => shutdown());

describe('16. Warehouse: export -> raw -> dbt', () => {
  it('snapshots/eventos não contêm user_id (uuid) nem e-mail; carga local popula raw; dbt run/test passa (se dbt instalado)', async () => {
    const dir = env.WAREHOUSE_EXPORT_DIR; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true }); await redis.del('warehouse:cursor:events'); await redis.del('warehouse:snapshot:lock');
    await http.post('/api/v1/analytics/events').set(auth(s)).send({ events: [{ name: 'project_created', props: { category: 'moda' }, anonId: 'anon-wh-test' }] });
    const r = await warehouseService.run({ force: true }); expect(r.snapshots?.users).toBeGreaterThan(0);
    const files = [...readdirSync(dir).map((f) => join(dir, f)), ...readdirSync(join(dir, 'snapshots')).map((f) => join(dir, 'snapshots', f))].filter((f) => f.endsWith('.jsonl'));
    for (const f of files) { const t = readFileSync(f, 'utf8'); expect(t, f).not.toContain(s.email); expect(UUID.test(t) && /"(user_id|email)"/.test(t), f).toBe(false); }
    expect(readFileSync(join(dir, 'snapshots', 'users.jsonl'), 'utf8')).not.toMatch(/"id":"[0-9a-f]{8}-/);
    const out = await loadLocal(`${base}/${DWH}`, dir); expect(out.users).toBeGreaterThan(0);
    const c = new pg.Client({ connectionString: `${base}/${DWH}` }); await c.connect();
    const q = await c.query('SELECT count(*)::int n FROM raw.users'); expect(q.rows[0].n).toBe(out.users);
    const cols = (await c.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='raw'`)).rows.map((x) => x.column_name as string); await c.end();
    expect(cols).not.toContain('user_id'); expect(cols).not.toContain('email');
    if (spawnSync('dbt', ['--version']).status !== 0) return; // dbt opcional no CI do backend
    const eu = new URL(`${base}/${DWH}`); const dbtEnv = { ...process.env, DBT_TARGET: 'local', DWH_HOST: eu.hostname, DWH_PORT: eu.port, DWH_USER: eu.username || 'postgres', DWH_DB: DWH, LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
    execSync('dbt seed --profiles-dir . && dbt run --profiles-dir . && dbt test --profiles-dir .', { cwd: 'dbt', env: dbtEnv, stdio: 'pipe', timeout: 120_000 });
  }, 150_000);
});
