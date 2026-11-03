import pg from 'pg'; import { migrate } from '../src/db/migrate.js';
const u = 'postgres://postgres@127.0.0.1:55432/nexus_test'; const c = new pg.Client({ connectionString: u }); await c.connect();
await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;'); await c.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nexus_app') THEN DROP OWNED BY nexus_app; DROP ROLE nexus_app; END IF; END $$;`).catch(() => undefined); await c.end();
for (const m of ['up','down','down','up','up'] as const) console.log(m, (await migrate(u, m)).join(','));
