import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { app, boot, shutdown, http, signup, auth, waitFor, pool, type Session } from './helpers.js';
import { asSystem } from '../src/db/pool.js';
import { redis } from '../src/db/redis.js';
import { env } from '../src/config/env.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { storage, refLocation } from '../src/providers/storage.js';
import { ffmpeg, withTmp } from '../src/utils/ffmpeg.js';
import { logger } from '../src/observability/logger.js';
import { getQueue, dlqName, Q } from '../src/queues/index.js';
import { sealSecret, openSecret } from '../src/providers/kms.js';
import { zipStore } from '../src/modules/export/zip.js';
import { mockCloud } from '../src/modules/export/cloudProviders.js';
import { cloudOAuth } from '../src/modules/export/cloudOAuth.js';
import { storageExportService } from '../src/modules/export/storageExportService.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';

/**
 * Módulo 5 — Salvamento (Postgres/Redis reais, nuvens em CLOUD_MODE=mock).
 * Checkpoint 5: revogar apaga os tokens (SELECT depois do revoke) e a tabela é `destination_exports` (não `export_jobs`).
 */
let a: Session; let b: Session; let free: Session;
const V: Record<string, { id: string; key: string; hash: string; buf: Buffer }> = {};
const setFlag = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key='ff_save'`, [on, on ? 100 : 0])); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `sv-${randomUUID()}` });
const sha = (x: Buffer | string) => createHash('sha256').update(x).digest('hex');
const AAD = (u: string, p: string, f: string) => `cloud_connections:${u}:${p}:${f}`;
const CTX = (p: string) => ({ purpose: 'cloud_token', provider: p });
const pathOf = (url: string) => url.replace(env.PUBLIC_API_URL, '');
const download = async (url: string) => { const r = await http.get(pathOf(url)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); }); return { status: r.status, body: r.body as Buffer, headers: r.headers }; };
const video = (color: string, dur: number) => withTmp(async (d) => {
  await ffmpeg(['-f', 'lavfi', '-i', `color=c=${color}:s=180x320:r=12:d=${dur}`, '-f', 'lavfi', '-i', `sine=frequency=440:d=${dur}`, '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', join(d, 'v.mp4')], 120_000);
  return readFile(join(d, 'v.mp4'));
});
async function project(s: Session, name: string, buf: Buffer, status = 'ready') {
  const id = (await asSystem((db) => db.query(`INSERT INTO projects (user_id, title, script, status, duration_sec) VALUES ($1,$2,$3,$4,3) RETURNING id`, [s.id, name, `Roteiro ${name}.`, status]))).rows[0].id as string;
  const key = `projects/${id}/final.mp4`; await storage.put('videos', key, buf, 'video/mp4'); await asSystem((db) => db.query('UPDATE projects SET final_video_url=$2 WHERE id=$1', [id, key]));
  V[name] = { id, key, hash: sha(buf), buf }; return id;
}
const save = (s: Session, pid: string, destination: string, key = idem()) => http.post(`/api/v1/projects/${pid}/save`).set(auth(s)).set(key).send({ destination });
const waitExport = (s: Session, id: string) => waitFor(async () => { const r = await http.get(`/api/v1/save/exports/${id}`).set(auth(s)); return ['done', 'failed'].includes(r.body.status) ? r.body : undefined; }, 60_000, 100);
async function connect(s: Session, p: string) {
  const c = await http.post(`/api/v1/cloud/${p}/connect`).set(auth(s)); expect(c.status).toBe(200);
  const r = await http.get(pathOf(c.body.url) + '&format=json'); expect(r.status).toBe(200); expect(r.body).toEqual({ connected: true, provider: p });
  return c.body;
}
const conn = async (u: string, p: string) => (await pool.query('SELECT * FROM cloud_connections WHERE user_id=$1 AND provider=$2', [u, p])).rows[0];
const tokensOf = async (u: string, p: string) => { const r = await conn(u, p); return { at: await openSecret(r.access_token_enc, AAD(u, p, 'access'), CTX(p)), rt: await openSecret(r.refresh_token_enc, AAD(u, p, 'refresh'), CTX(p)), row: r }; };
const unzipList = (buf: Buffer, dir: string) => { const f = join(dir, 'x.zip'); return writeFile(f, buf).then(() => execFileSync('unzip', ['-Z1', f]).toString().trim().split('\n')); };

beforeAll(async () => {
  await boot();
  a = await signup({ plan: 'pro', credits: 100 }); b = await signup({ plan: 'pro', credits: 100 }); free = await signup({ plan: 'free', credits: 10 });
  await project(a, 'Bike Aro 29', await video('0x3060a0', 3));
  await project(a, 'Fone Bluetooth', await video('0xa04030', 3));
  await project(a, 'rascunho', await video('0x808080', 1), 'draft');
  await project(b, 'alheio', await video('0x204020', 2));
  await project(free, 'Garrafa', await video('0x30a060', 2));
}, 120_000);
afterAll(async () => { delete process.env.MOCK_CLOUD_FAIL; delete process.env.MOCK_CLOUD_GRANT; await setFlag(false); await shutdown(); });

describe('Módulo 5 — unidade', () => {
  it('ZIP sem biblioteca: lido pelo unzip, nomes UTF-8, sem zip-slip, sem nome repetido', async () => {
    const z = zipStore([{ name: '../../etc/Ação.mp4', data: Buffer.from('abc') }, { name: 'ficha.json', data: Buffer.from('{}') }]);
    await withTmp(async (d) => {
      expect(await unzipList(z, d)).toEqual(['etc/Ação.mp4', 'ficha.json']);
      expect(execFileSync('unzip', ['-t', join(d, 'x.zip')]).toString()).toMatch(/No errors detected/);
    });
    expect(() => zipStore([{ name: 'a', data: Buffer.from('1') }, { name: './a', data: Buffer.from('2') }])).toThrow(/repetido/);
  });
  it('envelope AES-256-GCM: chave de dados nova a cada gravação, AAD amarra à linha, adulteração falha', async () => {
    const x = await sealSecret('segredo-123', 'aad-1', CTX('google_drive')); const y = await sealSecret('segredo-123', 'aad-1', CTX('google_drive'));
    expect(x.blob).toMatch(/^k1:/); expect(x.blob).not.toContain('segredo'); expect(x.blob).not.toBe(y.blob); expect(x.blob.split(':')[2]).not.toBe(y.blob.split(':')[2]);
    expect(await openSecret(x.blob, 'aad-1', CTX('google_drive'))).toBe('segredo-123');
    await expect(openSecret(x.blob, 'aad-2', CTX('google_drive'))).rejects.toThrow(); // token copiado para outra linha não abre
    await expect(openSecret(x.blob, 'aad-1', CTX('dropbox'))).rejects.toThrow(); // contexto do KMS diferente
    const parts = x.blob.split(':'); parts[5] = Buffer.from('xxxxxxxxxxx').toString('base64'); await expect(openSecret(parts.join(':'), 'aad-1', CTX('google_drive'))).rejects.toThrow();
  });
});

describe('Módulo 5 — tabela nova e flag desligada', () => {
  it('a tabela criada é destination_exports (não export_jobs) e data_export_requests segue igual', async () => {
    const t = (await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('destination_exports','export_jobs','cloud_connections','data_export_requests') ORDER BY 1`)).rows.map((r) => r.table_name);
    expect(t).toEqual(['cloud_connections', 'data_export_requests', 'destination_exports']);
    const cols = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='destination_exports'`)).rows.map((r) => r.column_name);
    for (const c of ['id', 'user_id', 'project_id', 'destination', 'status', 'external_url', 'error', 'created_at']) expect(cols).toContain(c);
    const cc = (await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='cloud_connections'`)).rows.map((r) => r.column_name);
    for (const c of ['id', 'user_id', 'provider', 'access_token_enc', 'refresh_token_enc', 'expires_at', 'scopes']) expect(cc).toContain(c);
    const rls = (await pool.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('destination_exports','cloud_connections') ORDER BY 1`)).rows;
    expect(rls.every((r) => r.relrowsecurity)).toBe(true);
  });
  it('com ff_save DESLIGADA: rotas 404, projeto sem campo novo, nada gravado', async () => {
    await setFlag(false);
    const before = (await http.get(`/api/v1/projects/${V['Bike Aro 29']!.id}`).set(auth(a))).body;
    const calls = [() => http.get('/api/v1/save/config'), () => http.get('/api/v1/save/exports'), () => http.get(`/api/v1/save/exports/${randomUUID()}`), () => http.get('/api/v1/cloud/connections'),
      () => http.post('/api/v1/cloud/google_drive/connect'), () => http.post(`/api/v1/projects/${V['Bike Aro 29']!.id}/save`).set(idem()).send({ destination: 'device' }),
      () => http.post(`/api/v1/catalogs/${randomUUID()}/export`).set(idem()).send({ destination: 'device' }), () => http.delete(`/api/v1/cloud/connections/google_drive`)];
    for (const c of calls) { const r = await c().set(auth(a)); expect(r.status).toBe(404); expect(r.body.code).toBe('not_found'); }
    const after = (await http.get(`/api/v1/projects/${V['Bike Aro 29']!.id}`).set(auth(a))).body;
    const noSig = (o: { finalVideoUrl?: string }) => ({ ...o, finalVideoUrl: o.finalVideoUrl?.split('?')[0] }); // a assinatura muda a cada segundo
    expect(noSig(after)).toEqual(noSig(before)); expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort()); expect(JSON.stringify(noSig(after))).not.toMatch(/save|export|cloud/i);
    expect((await pool.query('SELECT (SELECT count(*) FROM destination_exports)::int + (SELECT count(*) FROM cloud_connections)::int AS n')).rows[0].n).toBe(0);
    // /projects/:id continua; "save" como id é só um id inválido
    expect((await http.get('/api/v1/projects/save').set(auth(a))).status).toBe(400);
  });
});

describe('Módulo 5 — com ff_save LIGADA', () => {
  const logs: string[] = [];
  beforeAll(async () => {
    await setFlag(true);
    for (const lvl of ['info', 'warn', 'error', 'debug'] as const) { const orig = logger[lvl].bind(logger); vi.spyOn(logger, lvl).mockImplementation(((...args: unknown[]) => { logs.push(JSON.stringify(args)); return (orig as (...x: unknown[]) => void)(...args); }) as never); }
  });

  it('aparelho: link assinado de 24 h, nome do arquivo, mesmos bytes do original; pasta local e iCloud pelo mesmo caminho', async () => {
    const r = await save(a, V['Bike Aro 29']!.id, 'device'); expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ destination: 'device', status: 'done', flow: 'gallery', fileName: 'Bike Aro 29.mp4', mime: 'video/mp4', urlExpiresInSec: 86400 });
    const f = await download(r.body.url); expect(f.status).toBe(200); expect(sha(f.body)).toBe(V['Bike Aro 29']!.hash); expect(f.headers['content-disposition']).toBe('attachment; filename="Bike Aro 29.mp4"');
    expect((await save(a, V['Bike Aro 29']!.id, 'local_folder')).body.flow).toBe('folder');
    expect((await save(a, V['Bike Aro 29']!.id, 'icloud')).body.flow).toBe('ios_files');
    const rows = (await pool.query(`SELECT destination, status FROM destination_exports WHERE user_id=$1 ORDER BY created_at`, [a.id])).rows;
    expect(rows).toEqual([{ destination: 'device', status: 'done' }, { destination: 'local_folder', status: 'done' }, { destination: 'icloud', status: 'done' }]);
    expect((await save(a, V.rascunho!.id, 'device')).status).toBe(409); // vídeo não pronto
  });

  it('Idempotency-Key obrigatória; mesma chave = replay sem linha nova', async () => {
    expect((await http.post(`/api/v1/projects/${V['Bike Aro 29']!.id}/save`).set(auth(a)).send({ destination: 'device' })).status).toBe(400);
    const k = idem(); const n0 = (await pool.query('SELECT count(*)::int n FROM destination_exports')).rows[0].n;
    const r1 = await save(a, V['Fone Bluetooth']!.id, 'device', k); const r2 = await save(a, V['Fone Bluetooth']!.id, 'device', k);
    expect(r2.headers['idempotent-replay']).toBe('true'); expect(r2.body.exportId).toBe(r1.body.exportId);
    expect((await pool.query('SELECT count(*)::int n FROM destination_exports')).rows[0].n).toBe(n0 + 1);
  });

  it('Google Drive: OAuth com escopo mínimo (drive.file), tokens só cifrados no banco e nunca na resposta', async () => {
    const c = await connect(a, 'google_drive');
    expect(c.scopes).toEqual(['https://www.googleapis.com/auth/drive.file']); expect(c.url).toContain('state=');
    const row = await conn(a.id, 'google_drive');
    expect(row.access_token_enc).toMatch(/^k1:/); expect(row.refresh_token_enc).toMatch(/^k1:/); expect(row.kms_key_id).toBe('local-kek-v1');
    expect(row.scopes).toEqual(['https://www.googleapis.com/auth/drive.file']);
    const raw = JSON.stringify(row); expect(raw).not.toMatch(/mock-at-|mock-rt-/); // nada em texto claro
    const { at, rt } = await tokensOf(a.id, 'google_drive'); expect(await mockCloud.accessValid(at)).toBe(true); expect(await mockCloud.refreshValid(rt)).toBe(true);
    for (const res of [await http.get('/api/v1/cloud/connections').set(auth(a)), await http.get('/api/v1/save/config').set(auth(a))]) {
      expect(res.status).toBe(200); const s = JSON.stringify(res.body);
      expect(s).not.toContain(at); expect(s).not.toContain(rt); expect(s).not.toMatch(/_enc|k1:|mock-at|mock-rt|client_secret/i);
    }
    expect((await http.get('/api/v1/cloud/connections').set(auth(a))).body.items.find((x: { provider: string }) => x.provider === 'google_drive')).toMatchObject({ status: 'connected' });
  });

  it('OAuth: state de uso único, de outro provedor ou cancelado → recusado; escopo maior que o mínimo → recusado sem gravar', async () => {
    const c = await http.post('/api/v1/cloud/dropbox/connect').set(auth(b)); const cb = pathOf(c.body.url) + '&format=json';
    expect((await http.get(cb.replace('/cloud/dropbox/', '/cloud/onedrive/'))).status).toBe(401); // state de outro provedor (e já consumido)
    expect((await http.get(cb)).status).toBe(401); // state já usado
    expect((await http.get('/api/v1/cloud/dropbox/callback?error=access_denied&format=json')).status).toBe(400);
    process.env.MOCK_CLOUD_GRANT = 'https://www.googleapis.com/auth/drive';
    try {
      const c2 = await http.post('/api/v1/cloud/google_drive/connect').set(auth(b)); const r = await http.get(pathOf(c2.body.url) + '&format=json');
      expect(r.status).toBe(403); expect(r.body.code).toBe('scope_too_broad');
    } finally { delete process.env.MOCK_CLOUD_GRANT; }
    expect(await conn(b.id, 'google_drive')).toBeUndefined(); expect(await conn(b.id, 'dropbox')).toBeUndefined();
  });

  it('produção com nuvem simulada ou KMS local: conexão recusada (503) sem travar o boot', async () => {
    const e = env as { NODE_ENV: string; ALLOW_STUBS_IN_PRODUCTION: boolean }; const prev = [e.NODE_ENV, e.ALLOW_STUBS_IN_PRODUCTION] as const;
    e.NODE_ENV = 'production'; e.ALLOW_STUBS_IN_PRODUCTION = false;
    try { const r = await http.post('/api/v1/cloud/onedrive/connect').set(auth(b)); expect(r.status).toBe(503); expect(r.body.code).toBe('cloud_not_configured'); }
    finally { e.NODE_ENV = prev[0]; e.ALLOW_STUBS_IN_PRODUCTION = prev[1]; }
  });

  it('salvar no Google Drive: fila → arquivo idêntico na pasta NexusReel, link externo, ai_usage gravado, original intacto', async () => {
    const r = await save(a, V['Bike Aro 29']!.id, 'google_drive'); expect(r.status).toBe(202); expect(r.body.status).toBe('queued');
    const st = await waitExport(a, r.body.exportId); expect(st.status).toBe('done');
    expect(st.externalUrl).toMatch(/^https:\/\/mock\.google_drive\.example\/NexusReel\//);
    const f = (await mockCloud.files('google_drive')).at(-1)!; expect(f).toMatchObject({ path: '/NexusReel/Bike Aro 29.mp4', mime: 'video/mp4', sha256: V['Bike Aro 29']!.hash });
    const u = (await pool.query(`SELECT provider, operation, status FROM ai_usage WHERE user_id=$1 AND provider='google_drive' ORDER BY created_at`, [a.id])).rows;
    expect(u.map((x) => x.operation)).toEqual(['cloud_oauth_exchange', 'cloud_upload']); expect(u.every((x) => x.status === 'ok')).toBe(true);
    const l = refLocation(V['Bike Aro 29']!.key); expect(sha(await storage.get(l.bucket, l.key))).toBe(V['Bike Aro 29']!.hash);
    expect((await pool.query('SELECT final_video_url, status FROM projects WHERE id=$1', [V['Bike Aro 29']!.id])).rows[0]).toEqual({ final_video_url: V['Bike Aro 29']!.key, status: 'ready' });
  });

  it('refresh rotativo: token vencido renova, refresh antigo morre no provedor, dois pedidos juntos = um refresh só', async () => {
    const old = await tokensOf(a.id, 'google_drive');
    await pool.query(`UPDATE cloud_connections SET expires_at = now() - interval '1 minute' WHERE id=$1`, [old.row.id]);
    const [t1, t2] = await Promise.all([cloudOAuth.accessToken(a.id, 'google_drive'), cloudOAuth.accessToken(a.id, 'google_drive')]);
    expect(t1).toBe(t2); expect(t1).not.toBe(old.at);
    const now = await tokensOf(a.id, 'google_drive');
    expect(now.row.refresh_count).toBe(1); expect(now.row.rotated_at).not.toBeNull(); expect(now.rt).not.toBe(old.rt);
    expect(now.row.access_token_enc).not.toBe(old.row.access_token_enc); expect(now.row.refresh_token_enc).not.toBe(old.row.refresh_token_enc);
    expect(await mockCloud.refreshValid(old.rt)).toBe(false); expect(await mockCloud.refreshValid(now.rt)).toBe(true);
    // token de acesso recusado pelo provedor (401) → renova uma vez e o upload passa
    await redis.del(`mockcloud:at:${sha(now.at)}`);
    const r = await save(a, V['Fone Bluetooth']!.id, 'google_drive'); expect((await waitExport(a, r.body.exportId)).status).toBe('done');
    expect((await conn(a.id, 'google_drive')).refresh_count).toBe(2);
  });

  it('Nuvem NexusReel: bucket próprio (archive), retenção Pro 365 dias / Free 90 dias, subir de plano estende, vencido é apagado', async () => {
    const r = await save(a, V['Fone Bluetooth']!.id, 'nexus_cloud'); expect(r.status).toBe(202); expect(r.body.retentionDays).toBe(365);
    const st = await waitExport(a, r.body.exportId); expect(st.status).toBe('done');
    const row = (await pool.query('SELECT * FROM destination_exports WHERE id=$1', [st.exportId])).rows[0];
    expect(row.storage_key).toBe(`${a.id}/${st.exportId}/Fone Bluetooth.mp4`); expect(await storage.exists('archive', row.storage_key)).toBe(true); expect(await storage.exists('videos', row.storage_key)).toBe(false);
    const days = (new Date(st.expiresAt).getTime() - new Date(st.createdAt).getTime()) / 86400_000; expect(Math.round(days)).toBe(365);
    expect(sha((await download(st.url)).body)).toBe(V['Fone Bluetooth']!.hash); expect(st.url).toContain('/storage/archive/');
    const fr = await save(free, V.Garrafa!.id, 'nexus_cloud'); expect(fr.body.retentionDays).toBe(90); const fst = await waitExport(free, fr.body.exportId);
    expect(Math.round((new Date(fst.expiresAt).getTime() - new Date(fst.createdAt).getTime()) / 86400_000)).toBe(90);
    await pool.query(`UPDATE users SET plan='pro' WHERE id=$1`, [free.id]); // virou Pro: prazo estende
    expect(Math.round((new Date((await http.get(`/api/v1/save/exports/${fst.exportId}`).set(auth(free))).body.expiresAt).getTime() - new Date(fst.createdAt).getTime()) / 86400_000)).toBe(365);
    await pool.query(`UPDATE users SET plan='free' WHERE id=$1`, [free.id]);
    const list = await http.get('/api/v1/save/exports?destination=nexus_cloud').set(auth(a)); expect(list.body.nexusCloud).toMatchObject({ retentionDays: 365, quotaBytes: 51200 * 1024 * 1024 }); expect(list.body.nexusCloud.usedBytes).toBe(Number(row.bytes));
    // vencido → purge apaga o arquivo e marca expired
    await pool.query(`UPDATE destination_exports SET created_at = now() - interval '400 days', expires_at = now() - interval '35 days' WHERE id=$1`, [fst.exportId]);
    const fk = (await pool.query('SELECT storage_key FROM destination_exports WHERE id=$1', [fst.exportId])).rows[0].storage_key;
    expect((await storageExportService.purgeExpired()).purged).toBe(1);
    expect(await storage.exists('archive', fk)).toBe(false); expect((await pool.query('SELECT status, storage_key FROM destination_exports WHERE id=$1', [fst.exportId])).rows[0]).toEqual({ status: 'expired', storage_key: null });
    expect(await storage.exists('archive', row.storage_key)).toBe(true); // o do Pro (dentro do prazo) fica
    // cota cheia → 409 com mensagem clara
    const q = env.NEXUS_CLOUD_QUOTA_PRO_MB; (env as { NEXUS_CLOUD_QUOTA_PRO_MB: number }).NEXUS_CLOUD_QUOTA_PRO_MB = 0;
    try { const x = await save(a, V['Bike Aro 29']!.id, 'nexus_cloud'); expect(x.status).toBe(409); expect(x.body.code).toBe('nexus_quota_exceeded'); } finally { (env as { NEXUS_CLOUD_QUOTA_PRO_MB: number }).NEXUS_CLOUD_QUOTA_PRO_MB = q; }
    // apagar antes do prazo
    expect((await http.delete(`/api/v1/save/exports/${st.exportId}`).set(auth(a))).status).toBe(204); expect(await storage.exists('archive', row.storage_key)).toBe(false);
  });

  it('ZIP por produto (B2B): vídeo + ficha + legenda; item sem vídeo pronto fica de fora; API key catalogs:read funciona', async () => {
    const cat = (await pool.query(`INSERT INTO catalogs (owner_id, name) VALUES ($1,'Loja Verão') RETURNING id`, [a.id])).rows[0].id;
    const item = (sku: string, name: string, pid: string | null) => pool.query(`INSERT INTO catalog_items (catalog_id, name, description, price, sku, project_id, status) VALUES ($1,$2,'Descrição de teste',199.9,$3,$4,'ready') RETURNING id`, [cat, name, sku, pid]);
    await item('BK-29', 'Bike Aro 29', V['Bike Aro 29']!.id); await item('FN-01', 'Fone Bluetooth', V['Fone Bluetooth']!.id); await item('SEM-VID', 'Sem vídeo', V.rascunho!.id);
    const k = await http.post('/api/v1/api-keys').set(auth(a)).send({ name: 'ERP', scopes: ['catalogs:read'] }); expect(k.status).toBe(201);
    const r = await http.post(`/api/v1/catalogs/${cat}/export`).set({ authorization: `Bearer ${k.body.key}` }).set(idem()).send({ destination: 'device' });
    expect(r.status).toBe(202); expect(r.body.items.map((x: { sku: string }) => x.sku)).toEqual(['BK-29', 'FN-01']); expect(r.body.skipped).toEqual([expect.objectContaining({ sku: 'SEM-VID', reason: 'video_not_ready' })]);
    const st = await waitFor(async () => { const x = await http.get(`/api/v1/save/batches/${r.body.batchId}`).set(auth(a)); return x.body.done === 2 ? x.body : undefined; }, 60_000, 100);
    expect(st.items.map((x: { fileName: string }) => x.fileName)).toEqual(['Loja Verao-BK-29.zip', 'Loja Verao-FN-01.zip']);
    await withTmp(async (d) => {
      const zip = (await download(st.items[0].url)).body; expect(await unzipList(zip, d)).toEqual(['BK-29.mp4', 'ficha.json', 'legenda.txt']);
      execFileSync('unzip', ['-o', '-q', join(d, 'x.zip'), '-d', join(d, 'out')]);
      expect(sha(await readFile(join(d, 'out', 'BK-29.mp4')))).toBe(V['Bike Aro 29']!.hash);
      expect(JSON.parse(await readFile(join(d, 'out', 'ficha.json'), 'utf8'))).toMatchObject({ sku: 'BK-29', nome: 'Bike Aro 29', preco: 199.9, catalogo: 'Loja Verão', video: 'BK-29.mp4' });
      expect(await readFile(join(d, 'out', 'legenda.txt'), 'utf8')).toContain('R$ 199,90');
    });
    // ZIP na nuvem do usuário
    const g = await http.post(`/api/v1/catalogs/${cat}/export`).set(auth(a)).set(idem()).send({ destination: 'google_drive', itemIds: [(await pool.query(`SELECT id FROM catalog_items WHERE sku='FN-01'`)).rows[0].id] });
    expect(g.status).toBe(202); await waitFor(async () => (await http.get(`/api/v1/save/batches/${g.body.batchId}`).set(auth(a))).body.done === 1 || undefined, 60_000, 100);
    expect((await mockCloud.files('google_drive')).at(-1)).toMatchObject({ path: '/NexusReel/Loja Verao-FN-01.zip', mime: 'application/zip' });
    // catálogo de outro usuário → 404 e nada criado
    const n0 = (await pool.query('SELECT count(*)::int n FROM destination_exports')).rows[0].n;
    expect((await http.post(`/api/v1/catalogs/${cat}/export`).set(auth(b)).set(idem()).send({ destination: 'device' })).status).toBe(404);
    expect((await pool.query('SELECT count(*)::int n FROM destination_exports')).rows[0].n).toBe(n0);
  });

  it('isolamento: B não vê, não salva e não revoga nada de A', async () => {
    const mine = (await pool.query(`SELECT id FROM destination_exports WHERE user_id=$1 LIMIT 1`, [a.id])).rows[0].id;
    expect((await http.get(`/api/v1/save/exports/${mine}`).set(auth(b))).status).toBe(404);
    expect((await http.delete(`/api/v1/save/exports/${mine}`).set(auth(b))).status).toBe(404);
    expect((await save(b, V['Bike Aro 29']!.id, 'device')).status).toBe(404);
    expect((await http.get('/api/v1/save/exports').set(auth(b))).body.items).toEqual([]);
    expect((await http.delete('/api/v1/cloud/connections/google_drive').set(auth(b))).status).toBe(404);
    expect(await conn(a.id, 'google_drive')).toBeDefined();
  });

  it('nuvem fora do ar: 3 tentativas → failed com mensagem clara, DLQ, circuit breaker aberto e reconexão pedida sem rede', async () => {
    await connect(a, 'dropbox'); process.env.MOCK_CLOUD_FAIL = 'dropbox';
    try {
      const r = await save(a, V['Fone Bluetooth']!.id, 'dropbox'); const st = await waitExport(a, r.body.exportId);
      expect(st).toMatchObject({ status: 'failed', errorCode: 'cloud_unavailable' });
      await waitFor(async () => (await getQueue(dlqName(Q.saveExport)).getJobs(['waiting', 'completed', 'active', 'delayed'])).some((j) => j.data.original?.data?.exportId === r.body.exportId) || undefined, 10_000);
      expect(await redis.exists('cb:open:cloud:dropbox')).toBe(1);
    } finally { delete process.env.MOCK_CLOUD_FAIL; await redis.del('cb:open:cloud:dropbox', 'cb:fail:cloud:dropbox'); }
    const errs = (await pool.query(`SELECT count(*)::int n FROM ai_usage WHERE user_id=$1 AND provider='dropbox' AND operation='cloud_upload' AND status='error'`, [a.id])).rows[0].n; expect(errs).toBe(3);
    // refresh token rejeitado (invalid_grant) → conexão expira e o usuário é avisado para reconectar
    const t = await tokensOf(a.id, 'dropbox'); await redis.del(`mockcloud:rt:${sha(t.rt)}`, `mockcloud:at:${sha(t.at)}`);
    await pool.query(`UPDATE cloud_connections SET expires_at = now() - interval '1 minute' WHERE id=$1`, [t.row.id]);
    const r2 = await save(a, V['Fone Bluetooth']!.id, 'dropbox'); expect((await waitExport(a, r2.body.exportId))).toMatchObject({ status: 'failed', errorCode: 'cloud_reauth_required' });
    expect((await conn(a.id, 'dropbox')).status).toBe('expired');
  });

  it('REVOGAR APAGA OS TOKENS: SELECT depois do revoke não acha linha nem texto cifrado; o provedor também invalida', async () => {
    const before = await tokensOf(a.id, 'google_drive');
    const r = await http.delete('/api/v1/cloud/connections/google_drive').set(auth(a)); expect(r.status).toBe(200); expect(r.body).toEqual({ provider: 'google_drive', revoked: true, tokensDeleted: true });
    const rows = (await pool.query(`SELECT id, access_token_enc, refresh_token_enc FROM cloud_connections WHERE user_id=$1 AND provider='google_drive'`, [a.id])).rows;
    expect(rows).toEqual([]);
    const leftovers = (await pool.query(`SELECT count(*)::int n FROM cloud_connections WHERE access_token_enc=$1 OR refresh_token_enc=$2`, [before.row.access_token_enc, before.row.refresh_token_enc])).rows[0].n;
    expect(leftovers).toBe(0);
    expect(await mockCloud.accessValid(before.at)).toBe(false); expect(await mockCloud.refreshValid(before.rt)).toBe(false);
    expect((await pool.query(`SELECT count(*)::int n FROM audit_logs WHERE action='cloud.revoke' AND actor_id=$1`, [a.id])).rows[0].n).toBe(1);
    const x = await save(a, V['Fone Bluetooth']!.id, 'google_drive'); expect(x.status).toBe(409); expect(x.body.code).toBe('cloud_not_connected');
    expect((await http.delete('/api/v1/cloud/connections/google_drive').set(auth(a))).status).toBe(404);
  });

  it('LGPD: revogar funciona mesmo com ff_save desligada; export da conta lista conexões sem token; exclusão apaga Nuvem NexusReel e conexões', async () => {
    const c = await signup({ plan: 'pro', credits: 10 }); await project(c, 'lgpd', await video('0x111111', 1));
    await connect(c, 'onedrive'); await connect(c, 'dropbox');
    const r = await save(c, V.lgpd!.id, 'nexus_cloud'); const st = await waitExport(c, r.body.exportId);
    const key = (await pool.query('SELECT storage_key FROM destination_exports WHERE id=$1', [st.exportId])).rows[0].storage_key;
    const eid = (await asSystem((db) => db.query(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id`, [c.id]))).rows[0].id as string;
    await complianceService.buildExport(eid, c.id); const data = JSON.parse((await storage.get('exports', `${c.id}/${eid}.json`)).toString());
    expect(data.cloudConnections.map((x: { provider: string }) => x.provider).sort()).toEqual(['dropbox', 'onedrive']); expect(data.destinationExports).toHaveLength(1);
    expect(JSON.stringify(data)).not.toMatch(/_enc|k1:|mock-at|mock-rt/);
    await setFlag(false);
    try {
      const d = await http.delete('/api/v1/cloud/connections/onedrive').set(auth(c)); expect(d.status).toBe(200);
      expect((await pool.query(`SELECT count(*)::int n FROM cloud_connections WHERE user_id=$1 AND provider='onedrive'`, [c.id])).rows[0].n).toBe(0);
    } finally { await setFlag(true); }
    await complianceService.hardDelete(c.id);
    expect((await pool.query(`SELECT count(*)::int n FROM cloud_connections WHERE user_id=$1`, [c.id])).rows[0].n).toBe(0);
    expect((await pool.query(`SELECT count(*)::int n FROM destination_exports WHERE user_id=$1`, [c.id])).rows[0].n).toBe(0);
    expect(await storage.exists('archive', key)).toBe(false);
  });

  it('logs sem token, sem segredo e sem e-mail (R7)', () => {
    const all = logs.join('\n'); expect(logs.length).toBeGreaterThan(0);
    expect(all).not.toMatch(/mock-at-|mock-rt-|mock-code-|k1:[A-Za-z0-9_-]+:|client_secret|code_verifier/);
    for (const s of [a, b, free]) expect(all).not.toContain(s.email); // e-mail só aparece mascarado (driver de e-mail já existente)
  });
});

describe('Módulo 5 — rotas convivem com /projects/:id e /catalogs/:id', () => {
  it('as rotas novas estão no roteador sem tirar as antigas', async () => {
    const routes = app.printRoutes({ commonPrefix: false });
    expect(routes).toMatch(/save/); expect(routes).toMatch(/export/);
    expect((await http.get(`/api/v1/projects/${V['Bike Aro 29']!.id}`).set(auth(a))).status).toBe(200);
    expect((await http.get('/api/v1/catalogs').set(auth(a))).status).toBe(200);
  });
});
