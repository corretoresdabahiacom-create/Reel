import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, pool, uploadPhoto, waitFor, type Session } from './helpers.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';
import { storage } from '../src/providers/storage.js';

let s: Session;
beforeAll(async () => { await boot(); s = await signup({ plan: 'pro', credits: 20 }); });
afterAll(() => shutdown());

describe('7. LGPD: exportação assíncrona, exclusão agendada/cancelada e hard delete', () => {
  it('exportação gera arquivo em worker; link assinado de 7 dias; limite de 3 pedidos / 10 min', async () => {
    await http.post('/api/v1/users/me/consents').set(auth(s)).send({ items: [{ type: 'terms', accepted: true }] });
    const r = await http.post('/api/v1/users/me/export').set(auth(s)).send({}); expect(r.status).toBe(202);
    const done = await waitFor(async () => { const x = (await http.get(`/api/v1/users/me/export/${r.body.id}`).set(auth(s))).body; return x.status === 'completed' ? x : undefined; }, 30_000);
    expect(done.downloadUrl).toBeTruthy(); const u = new URL(done.downloadUrl); const file = await http.get(u.pathname + u.search); expect(file.status).toBe(200);
    const text = (file.body as Buffer).toString ? file.text ?? file.body.toString() : ''; expect(text.includes('"passwordHash"') || text.includes('password_hash')).toBe(false); // nunca exporta segredos
    const exp = (await pool.query('SELECT expires_at, requested_at FROM data_export_requests WHERE id=$1', [r.body.id])).rows[0]; expect(Math.round((+exp.expires_at - +exp.requested_at) / 86400000)).toBe(7);
    await http.post('/api/v1/users/me/export').set(auth(s)).send({}); await http.post('/api/v1/users/me/export').set(auth(s)).send({}); expect((await http.post('/api/v1/users/me/export').set(auth(s)).send({})).status).toBe(429);
    const other = await signup(); expect((await http.get(`/api/v1/users/me/export/${r.body.id}`).set(auth(other))).status).toBe(404); // de outro usuário
  });
  it('agendar exclusão (+30 dias) bloqueia geração; cancelar restaura', async () => {
    const d = await http.post('/api/v1/users/me/deletion').set(auth(s)).send({}); expect(d.status).toBe(202); expect(Math.round((+new Date(d.body.scheduledFor) - Date.now()) / 86400000)).toBe(30);
    expect((await http.post('/api/v1/projects').set(auth(s)).send({ title: 'x', script: 'y', photos: [] })).status).toBe(423);
    expect((await http.delete('/api/v1/users/me/deletion').set(auth(s))).status).toBe(200); expect((await http.post('/api/v1/projects').set(auth(s)).send({ title: 'x', script: 'y', photos: [] })).status).toBe(201);
  });
  it('exclusão vencida: hard delete em worker remove dados e arquivos, anonimiza e preserva transações financeiras', async () => {
    const u = await signup({ plan: 'pro', credits: 20 }); const ref = await uploadPhoto(u); await http.post('/api/v1/projects').set(auth(u)).send({ title: 'Meu vídeo', script: 'x', photos: [ref] });
    await pool.query(`INSERT INTO transactions (user_id,type,amount_cents,source,external_ref) VALUES ($1,'credit_purchase',1900,'stripe','keep-1')`, [u.id]);
    const dr = await http.post('/api/v1/users/me/deletion').set(auth(u)).send({}); expect(dr.status, JSON.stringify(dr.body)).toBe(202); await pool.query(`UPDATE deletion_requests SET scheduled_for = now() - interval '1 day' WHERE user_id=$1`, [u.id]);
    await complianceService.runDueDeletions(); // o agendador de manutenção pode ter processado antes — ambos os caminhos são válidos
    await waitFor(async () => { const r = (await pool.query('SELECT email, name, deleted_at FROM users WHERE id=$1', [u.id])).rows[0]; return r?.deleted_at ? r : undefined; }, 30_000);
    const row = (await pool.query('SELECT email, name, password_hash FROM users WHERE id=$1', [u.id])).rows[0]; expect(row.email).not.toBe(u.email); expect(row.name).not.toBe('Tester'); expect(row.password_hash).toBeNull();
    expect((await pool.query('SELECT count(*)::int n FROM projects WHERE user_id=$1', [u.id])).rows[0].n).toBe(0); expect((await pool.query('SELECT count(*)::int n FROM transactions WHERE user_id=$1', [u.id])).rows[0].n).toBe(1);
    const loc = ref.replace(/^uploads\//, ''); expect(await storage.exists('uploads', loc)).toBe(false);
    expect((await http.post('/api/v1/auth/login').send({ email: u.email, password: 'Sup3rSecret!pass' })).status).toBe(401); expect((await http.get('/api/v1/users/me').set(auth(u))).status).toBe(401);
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE action='deletion.completed' AND target_id=$1`, [u.id])).rowCount).toBeGreaterThanOrEqual(1);
  });
});
