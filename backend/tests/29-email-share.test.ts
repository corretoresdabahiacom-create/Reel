import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { join } from 'node:path';
import { writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { boot, shutdown, http, signup, auth, waitFor, pool, type Session } from './helpers.js';
import { asSystem } from '../src/db/pool.js';
import { redis } from '../src/db/redis.js';
import { env } from '../src/config/env.js';
import { invalidateFlags } from '../src/modules/flags.service.js';
import { storage } from '../src/providers/storage.js';
import { withTmp } from '../src/utils/ffmpeg.js';
import { logger } from '../src/observability/logger.js';
import { getQueue, Q } from '../src/queues/index.js';
import { emailHash } from '../src/modules/emails/email.service.js';
import { createSignedLink, verifyToken } from '../src/modules/emailShare/emailShareService.js';
import { isDisposable } from '../src/modules/emailShare/disposable.js';
import { renderTemplate } from '../src/modules/emailShare/template.js';
import { complianceService } from '../src/modules/compliance/compliance.service.js';

/**
 * Módulo 7 — Envio por e-mail (link HMAC). Postgres/Redis reais; driver de e-mail `log`.
 * Checkpoint 7: o limite dispara 429 (10/min por usuário e 30/min por IP) e o e-mail do destinatário não aparece em logs.
 */
let a: Session; let b: Session;
const V: Record<string, { id: string; buf: Buffer }> = {};
const DOM = 'destino-teste.com.br';
const R = (n: string) => `${n}@${DOM}`;
const logs: string[] = [];
const setFlag = async (on: boolean) => { await asSystem((db) => db.query(`UPDATE feature_flags SET enabled=$1, rollout_percent=$2 WHERE key='ff_email'`, [on, on ? 100 : 0])); await invalidateFlags(); };
const idem = () => ({ 'idempotency-key': `em-${randomUUID()}` });
const sha = (x: Buffer) => createHash('sha256').update(x).digest('hex');
const pathOf = (url: string) => url.replace(env.PUBLIC_API_URL, '');
const bin = (url: string) => http.get(pathOf(url)).buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
async function project(s: Session, name: string, bytes: string) {
  const buf = Buffer.from(bytes.repeat(200));
  const id = (await asSystem((db) => db.query(`INSERT INTO projects (user_id, title, script, status, duration_sec) VALUES ($1,$2,'Roteiro.','ready',10) RETURNING id`, [s.id, name]))).rows[0].id as string;
  await storage.put('videos', `projects/${id}/final.mp4`, buf, 'video/mp4'); await asSystem((db) => db.query('UPDATE projects SET final_video_url=$2 WHERE id=$1', [id, `projects/${id}/final.mp4`]));
  V[name] = { id, buf }; return id;
}
const send = (s: Session, pid: string, body: object, extra: Record<string, string> = {}) => http.post(`/api/v1/projects/${pid}/email`).set(auth(s)).set(idem()).set(extra).send(body);
const tokenOf = (link: string) => link.split('/api/v1/s/')[1]!;
const emailJobs = async () => (await getQueue(Q.emails).getJobs(['completed', 'waiting', 'active', 'delayed', 'failed'])).map((j) => j.data.data as Record<string, unknown>);
/** Espera o início de um minuto "fresco": a janela do limite é fixa por minuto. */
/** Zera o contador por minuto de um usuário (os testes funcionais de A não devem depender do relógio; o limite tem teste próprio). */
const resetRate = async (s: Session) => { const k = await redis.keys(`rl:email_share_u:u:${s.id}:*`); if (k.length) await redis.del(...k); };
const freshMinute = async () => { const s = new Date().getSeconds(); if (s > 35) await new Promise((ok) => setTimeout(ok, (61 - s) * 1000)); };

beforeAll(async () => {
  await boot(); a = await signup({ plan: 'pro', credits: 100 }); b = await signup({ plan: 'pro', credits: 100 });
  await project(a, 'Bike Aro 29', 'video-A-'); await project(b, 'Do B', 'video-B-');
  for (const lvl of ['info', 'warn', 'error', 'debug'] as const) { const orig = logger[lvl].bind(logger); vi.spyOn(logger, lvl).mockImplementation(((...args: unknown[]) => { logs.push(JSON.stringify(args)); return (orig as (...x: unknown[]) => void)(...args); }) as never); }
}, 120_000);
afterAll(async () => {
  if (process.env.EMAIL_LOG_EVIDENCE) await writeFile(process.env.EMAIL_LOG_EVIDENCE, logs.join('\n') + '\n'); // evidência do checkpoint: todas as linhas de log da suíte
  await setFlag(false); await shutdown();
});

describe('Módulo 7 — unidade', () => {
  it('link HMAC: válido abre; mexer no id, na validade ou na assinatura invalida; vencido não abre', () => {
    const id = randomUUID(); const l = createSignedLink(id, new Date(Date.now() + 7 * 86400_000)); const [i, e, s] = l.token.split('.');
    expect(verifyToken(l.token)).toEqual({ shareId: id, exp: Number(e) });
    expect(verifyToken(`${randomUUID()}.${e}.${s}`)).toBeNull(); expect(verifyToken(`${i}.${Number(e) + 86400}.${s}`)).toBeNull(); expect(verifyToken(`${i}.${e}.${s!.slice(0, -2)}AA`)).toBeNull();
    expect(verifyToken(createSignedLink(id, new Date(Date.now() - 1000)).token)).toBeNull(); expect(verifyToken('lixo')).toBeNull();
  });
  it('descartáveis bloqueados (com subdomínio); e-mails normais passam', () => {
    for (const x of ['a@mailinator.com', 'b@x.mailinator.com', 'c@YOPMAIL.com', 'd@guerrillamail.com']) expect(isDisposable(x)).toBe(true);
    for (const x of ['ana@gmail.com', 'loja@empresa.com.br']) expect(isDisposable(x)).toBe(false);
  });
  it('template escapa tudo (nada do usuário vira HTML) e o hash do e-mail não revela o endereço', () => {
    const h = renderTemplate('share.html', { heading: '<b>x</b>', message: '<img src=x onerror=alert(1)>', link: 'https://x/"><script>', fileName: 'a.mp4' });
    expect(h).not.toContain('<img src=x'); expect(h).toContain('&#60;img src&#61;x'); expect(h).not.toContain('"><script>');
    expect(emailHash(' Ana@Gmail.com ')).toBe(emailHash('ana@gmail.com')); expect(emailHash('ana@gmail.com')).toMatch(/^[0-9a-f]{64}$/); expect(emailHash('ana@gmail.com')).not.toBe(createHash('sha256').update('ana@gmail.com').digest('hex'));
  });
});

describe('Módulo 7 — flag desligada', () => {
  it('rotas 404, nada gravado, projeto igual', async () => {
    await setFlag(false);
    for (const c of [() => http.get('/api/v1/email-shares'), () => http.get('/api/v1/email-shares/config'), () => http.post(`/api/v1/projects/${V['Bike Aro 29']!.id}/email`).set(idem()).send({ recipients: [R('x')] })]) {
      const r = await c().set(auth(a)); expect(r.status).toBe(404); expect(r.body.code).toBe('not_found');
    }
    expect((await http.get(`/api/v1/s/${createSignedLink(randomUUID(), new Date(Date.now() + 3600_000)).token}?format=json`)).status).toBe(404);
    expect((await pool.query('SELECT count(*)::int n FROM email_shares')).rows[0].n).toBe(0);
    expect((await http.get('/api/v1/projects/email').set(auth(a))).status).toBe(400);
  });
});

describe('Módulo 7 — com ff_email LIGADA', () => {
  beforeAll(async () => { await setFlag(true); });
  let link = '';

  it('envia: 1 e-mail por destinatário + cópia para si; validade de 7 dias; destinatários só como hash (banco, auditoria e fila)', async () => {
    const r = await send(a, V['Bike Aro 29']!.id, { recipients: [R('ana'), R('BRUNO'), R('ana')], includeSelf: true, message: 'Olha o vídeo da bike!', senderName: 'Loja do Zé' });
    expect(r.status).toBe(202); expect(r.body).toMatchObject({ status: 'sent', recipients: 3, hasPassword: false, fileName: 'Bike Aro 29.mp4' }); link = r.body.link;
    const days = (new Date(r.body.expiresAt).getTime() - Date.now()) / 86400_000; expect(days).toBeGreaterThan(6.99); expect(days).toBeLessThanOrEqual(7);
    const row = (await pool.query('SELECT * FROM email_shares WHERE id=$1', [r.body.shareId])).rows[0];
    expect(row.recipients_hash.sort()).toEqual([emailHash(R('ana')), emailHash(R('bruno'))].sort()); expect(JSON.stringify(row)).not.toContain('@');
    const au = (await pool.query(`SELECT metadata FROM audit_logs WHERE action='email_share.send' AND actor_id=$1`, [a.id])).rows;
    expect(au).toHaveLength(1); expect(au[0].metadata).toMatchObject({ shareId: r.body.shareId, file: 'Bike Aro 29.mp4' }); expect(JSON.stringify(au)).not.toContain('@');
    const jobs = await waitFor(async () => { const j = (await emailJobs()).filter((x) => String((x.vars as { text?: string })?.text ?? '').includes(tokenOf(link))); return j.length === 3 ? j : undefined; }, 10_000);
    expect(jobs.every((j) => !j.to && typeof j.toEnc === 'string' && j.logAs === 'hash')); expect(JSON.stringify(jobs)).not.toContain(DOM); expect(JSON.stringify(jobs)).not.toContain(a.email);
    const html = String(jobs.find((j) => !(String((j.vars as { subject: string }).subject)).startsWith('Cópia'))!.html);
    expect(html).toContain('Loja do Zé enviou um vídeo para você'); expect(html).toContain('Olha o vídeo da bike!'); expect(html).toContain(link);
  });

  it('link: página (HTML sem script, CSP própria) e download que entrega o arquivo e conta o acesso', async () => {
    const tk = tokenOf(link);
    const j = await http.get(`/api/v1/s/${tk}?format=json`); expect(j.status).toBe(200); expect(j.body).toMatchObject({ fileName: 'Bike Aro 29.mp4', senderName: 'Loja do Zé', needsPassword: false });
    const p = await http.get(`/api/v1/s/${tk}`).set('accept', 'text/html'); expect(p.status).toBe(200); expect(p.text).toContain('Baixar o vídeo'); expect(p.text).not.toMatch(/<script/i);
    expect(p.headers['content-security-policy']).toContain("default-src 'none'"); expect(p.headers['content-security-policy']).not.toContain('script-src'); expect(p.headers['cache-control']).toBe('no-store');
    const d = await http.get(`/api/v1/s/${tk}/download`); expect(d.status).toBe(303);
    const f = await bin(d.headers.location!); expect(sha(f.body as Buffer)).toBe(sha(V['Bike Aro 29']!.buf));
    expect((await pool.query('SELECT access_count FROM email_shares WHERE id=$1', [tk.split('.')[0]])).rows[0].access_count).toBe(1);
    expect((await pool.query(`SELECT count(*)::int n FROM audit_logs WHERE action='email_share.access' AND target_id=$1`, [tk.split('.')[0]])).rows[0].n).toBe(1);
  });

  it('senha opcional: sem senha 401, errada 401, certa libera (JSON e formulário); 5 erradas travam (429)', async () => {
    const r = await send(a, V['Bike Aro 29']!.id, { recipients: [R('carla')], password: 'segredo-123' }); expect(r.body.hasPassword).toBe(true);
    const tk = tokenOf(r.body.link); const row = (await pool.query('SELECT password_hash FROM email_shares WHERE id=$1', [r.body.shareId])).rows[0];
    expect(row.password_hash).toMatch(/^\$argon2id\$/); expect(row.password_hash).not.toContain('segredo');
    expect((await http.get(`/api/v1/s/${tk}?format=json`)).body.needsPassword).toBe(true);
    expect((await http.get(`/api/v1/s/${tk}/download?format=json`)).status).toBe(401);
    expect((await http.post(`/api/v1/s/${tk}/download?format=json`).send({ password: 'errada' })).status).toBe(401);
    const ok = await http.post(`/api/v1/s/${tk}/download?format=json`).send({ password: 'segredo-123' }); expect(ok.status).toBe(200); expect(ok.body.url).toContain('/storage/videos/');
    const form = await http.post(`/api/v1/s/${tk}/download`).type('form').send('password=segredo-123'); expect(form.status).toBe(303);
    const bad = await http.post(`/api/v1/s/${tk}/download`).type('form').send('password=nope'); expect(bad.status).toBe(401); expect(bad.text).toContain('Senha incorreta');
    for (let i = 0; i < 4; i++) await http.post(`/api/v1/s/${tk}/download?format=json`).send({ password: 'x' + i });
    expect((await http.post(`/api/v1/s/${tk}/download?format=json`).send({ password: 'segredo-123' })).status).toBe(429);
    await redis.del(`share:pw:${r.body.shareId}`);
  });

  it('expira em 7 dias (vencido = 404), revogado = 404, link adulterado = 404', async () => {
    const r = await send(a, V['Bike Aro 29']!.id, { recipients: [R('dani')] }); const tk = tokenOf(r.body.link);
    await pool.query(`UPDATE email_shares SET expires_at = now() - interval '1 minute' WHERE id=$1`, [r.body.shareId]);
    expect((await http.get(`/api/v1/s/${tk}/download?format=json`)).status).toBe(404);
    const v = (await http.get(`/api/v1/s/${tk}`).set('accept', 'text/html')); expect(v.status).toBe(404); expect(v.text).toContain('não existe ou expirou');
    const r2 = await send(a, V['Bike Aro 29']!.id, { recipients: [R('edu')] }); const tk2 = tokenOf(r2.body.link);
    expect((await http.delete(`/api/v1/email-shares/${r2.body.shareId}`).set(auth(a))).status).toBe(204); expect((await http.get(`/api/v1/s/${tk2}?format=json`)).status).toBe(404);
    const [i, e, s] = tokenOf(link).split('.'); expect((await http.get(`/api/v1/s/${i}.${Number(e) + 999}.${s}?format=json`)).status).toBe(404);
    const list = (await http.get('/api/v1/email-shares').set(auth(a))).body.items; expect(list.map((x: { status: string }) => x.status)).toEqual(expect.arrayContaining(['revoked', 'expired', 'sent']));
    expect(JSON.stringify(list)).not.toContain('@');
  });

  it('anti-spam: máx. 20 destinatários, domínio descartável, mensagem com link e teto diário', async () => {
    await resetRate(a);
    const pid = V['Bike Aro 29']!.id;
    let x = await send(a, pid, { recipients: Array.from({ length: 21 }, (_, i) => R('p' + i)) }); expect(x.status).toBe(422); expect(x.body.code).toBe('too_many_recipients');
    x = await send(a, pid, { recipients: Array.from({ length: 20 }, (_, i) => R('q' + i)), includeSelf: true }); expect(x.status).toBe(422); // 20 + cópia = 21
    x = await send(a, pid, { recipients: [R('ok'), 'golpe@mailinator.com'] }); expect(x.status).toBe(422); expect(x.body.code).toBe('disposable_domain'); expect(x.body.details.positions).toEqual([1]);
    x = await send(a, pid, { recipients: [R('ok')], message: 'clique em bit.ly/premio' }); expect(x.status).toBe(422); expect(x.body.code).toBe('message_has_link');
    x = await send(a, pid, { recipients: [] }); expect(x.status).toBe(422); expect(x.body.code).toBe('no_recipients');
    const d = env.EMAIL_SHARE_DAILY_RECIPIENTS; (env as { EMAIL_SHARE_DAILY_RECIPIENTS: number }).EMAIL_SHARE_DAILY_RECIPIENTS = 6;
    const u2 = await signup({ plan: 'pro', credits: 10 }); const p2 = await project(u2, 'diario', 'video-d-'); // usuário novo: separa o teto diário do limite por minuto
    try { expect((await send(u2, p2, { recipients: [R('f1'), R('f2'), R('f3'), R('f4')] })).status).toBe(202); x = await send(u2, p2, { recipients: [R('f5'), R('f6'), R('f7')] }); expect(x.status).toBe(429); expect(x.body.code).toBe('daily_limit'); } finally { (env as { EMAIL_SHARE_DAILY_RECIPIENTS: number }).EMAIL_SHARE_DAILY_RECIPIENTS = d; }
    expect((await http.post(`/api/v1/projects/${p2}/email`).set(auth(u2)).send({ recipients: [R('x')] })).status).toBe(400); // Idempotency-Key obrigatória
  });

  it('RATE LIMIT: 11º envio do mesmo usuário em 1 min → 429; 31º do mesmo IP (vários usuários) → 429', async () => {
    await freshMinute();
    const u = await signup({ plan: 'pro', credits: 10 }); const pid = await project(u, 'rl', 'video-rl-');
    const codes: number[] = []; for (let i = 0; i < 11; i++) codes.push((await send(u, pid, { recipients: [R('rl' + i)] })).status);
    expect(codes.slice(0, 10).every((c) => c === 202)).toBe(true); expect(codes[10]).toBe(429);
    const blocked = await send(u, pid, { recipients: [R('rl-x')] }); expect(blocked.status).toBe(429); expect(blocked.body.code).toBe('rate_limited'); expect(Number(blocked.headers['retry-after'] ?? blocked.body.details?.retryAfterSec)).toBeGreaterThan(0);
    await freshMinute();
    const ip = { 'x-forwarded-for': '203.0.113.77' }; const users = await Promise.all([0, 1, 2, 3].map(() => signup({ plan: 'pro', credits: 10 })));
    const pids = await Promise.all(users.map((s, i) => project(s, 'ip' + i, 'video-ip-')));
    const ipCodes: number[] = []; for (let i = 0; i < 31; i++) ipCodes.push((await send(users[i % 4]!, pids[i % 4]!, { recipients: [R('ip' + i)] }, ip)).status);
    expect(ipCodes.slice(0, 30).every((c) => c === 202)).toBe(true); expect(ipCodes[30]).toBe(429);
    expect((await pool.query(`SELECT count(*)::int n FROM email_shares WHERE user_id = ANY($1)`, [users.map((s) => s.id)])).rows[0].n).toBe(30); // o bloqueado não gravou nada
  });

  it('asset do Módulo 6 pode ser enviado; projeto/asset de outro usuário → 404', async () => {
    await resetRate(a);
    const aid = (await pool.query(`INSERT INTO derived_assets (user_id, source_project_id, type, status, file_url, file_name, mime, expires_at) VALUES ($1,$2,'gif','done',$3,'nexusreel-gif-abc12345.gif','image/gif', now() + interval '30 days') RETURNING id`,
      [a.id, V['Bike Aro 29']!.id, `derived/${a.id}/x.gif`])).rows[0].id; await storage.put('videos', `derived/${a.id}/x.gif`, Buffer.from('GIF89a-teste'), 'image/gif');
    const r = await send(a, V['Bike Aro 29']!.id, { recipients: [R('gif')], assetId: aid }); expect(r.status).toBe(202); expect(r.body.fileName).toBe('nexusreel-gif-abc12345.gif');
    const d = await http.get(`/api/v1/s/${tokenOf(r.body.link)}/download`); expect((await bin(d.headers.location!)).body.toString()).toBe('GIF89a-teste');
    expect((await send(b, V['Bike Aro 29']!.id, { recipients: [R('z')] })).status).toBe(404); expect((await send(b, V['Do B']!.id, { recipients: [R('z')], assetId: aid })).status).toBe(404);
    expect((await http.delete(`/api/v1/email-shares/${r.body.shareId}`).set(auth(b))).status).toBe(404); expect((await http.get('/api/v1/email-shares').set(auth(b))).body.items).toEqual([]);
  });

  it('lote B2B: 1 e-mail por item (per_item) ou 1 ZIP (zip); API key funciona; lote grande demais → 422', async () => {
    await resetRate(a);
    const cat = (await pool.query(`INSERT INTO catalogs (owner_id, name) VALUES ($1,'Loja Verão') RETURNING id`, [a.id])).rows[0].id;
    const p2 = await project(a, 'Fone', 'video-fone-');
    for (const [sku, pid] of [['BK-29', V['Bike Aro 29']!.id], ['FN-01', p2], ['SEM', null]] as const) await pool.query(`INSERT INTO catalog_items (catalog_id, name, sku, project_id, price) VALUES ($1,$2,$3,$4,99.9)`, [cat, 'Produto ' + sku, sku, pid]);
    const before = (await emailJobs()).length;
    const per = await http.post(`/api/v1/catalogs/${cat}/email`).set(auth(a)).set(idem()).send({ mode: 'per_item', recipients: [R('lote1'), R('lote2')] });
    expect(per.status).toBe(202); expect(per.body.shares).toHaveLength(2); expect(per.body.skipped).toEqual([expect.objectContaining({ sku: 'SEM' })]);
    await waitFor(async () => ((await emailJobs()).length - before >= 4 ? true : undefined), 10_000); // 2 itens × 2 destinatários
    const k = await http.post('/api/v1/api-keys').set(auth(a)).send({ name: 'ERP', scopes: ['catalogs:read'] });
    const z = await http.post(`/api/v1/catalogs/${cat}/email`).set({ authorization: `Bearer ${k.body.key}` }).set(idem()).send({ mode: 'zip', recipients: [R('zip')] });
    expect(z.status).toBe(202); expect(z.body).toMatchObject({ mode: 'zip', status: 'preparing' }); expect(z.body.shares).toHaveLength(1);
    const sid = z.body.shares[0].shareId; await waitFor(async () => ((await pool.query('SELECT status FROM email_shares WHERE id=$1', [sid])).rows[0].status === 'sent' || undefined), 20_000);
    const zjob = await waitFor(async () => (await emailJobs()).find((j) => String((j.vars as { text?: string })?.text ?? '').includes(`/s/${sid}.`)), 10_000);
    const zl = String((zjob.vars as { text: string }).text).match(/https?:\/\/\S+\/api\/v1\/s\/\S+/)![0];
    const dl = await http.get(`/api/v1/s/${tokenOf(zl)}/download`); expect(dl.status).toBe(303);
    await withTmp(async (d) => { const f = join(d, 'l.zip'); await writeFile(f, (await bin(dl.headers.location!)).body as Buffer);
      expect(execFileSync('unzip', ['-Z1', f]).toString().trim().split('\n').sort()).toEqual(['BK-29/BK-29.mp4', 'BK-29/ficha.json', 'FN-01/FN-01.mp4', 'FN-01/ficha.json']);
      execFileSync('unzip', ['-q', f, '-d', join(d, 'o')]); expect(sha(await readFile(join(d, 'o', 'BK-29', 'BK-29.mp4')))).toBe(sha(V['Bike Aro 29']!.buf)); });
    for (let i = 0; i < 4; i++) await pool.query(`INSERT INTO catalog_items (catalog_id, name, sku, project_id) VALUES ($1,'x',$2,$3)`, [cat, 'EX' + i, p2]);
    const big = await http.post(`/api/v1/catalogs/${cat}/email`).set(auth(a)).set(idem()).send({ mode: 'per_item', recipients: Array.from({ length: 17 }, (_, i) => R('big' + i)) });
    expect(big.status).toBe(422); expect(big.body.code).toBe('batch_too_large'); // 6 itens × 17 > 100
  });

  it('flag desligada depois do envio: o link para de funcionar (e volta ao religar)', async () => {
    const tk = tokenOf(link); await setFlag(false);
    try { expect((await http.get(`/api/v1/s/${tk}?format=json`)).status).toBe(404); } finally { await setFlag(true); }
    expect((await http.get(`/api/v1/s/${tk}?format=json`)).status).toBe(200);
  });

  it('LGPD: exportação lista os envios sem destinatários nem senha; exclusão apaga', async () => {
    const eid = (await asSystem((db) => db.query(`INSERT INTO data_export_requests (user_id) VALUES ($1) RETURNING id`, [a.id]))).rows[0].id as string;
    await complianceService.buildExport(eid, a.id); const data = JSON.parse((await storage.get('exports', `${a.id}/${eid}.json`)).toString());
    expect(data.emailShares.length).toBeGreaterThan(3); expect(JSON.stringify(data.emailShares)).not.toMatch(/recipients_hash|password_hash|@/);
    await complianceService.hardDelete(b.id); expect((await pool.query('SELECT count(*)::int n FROM email_shares WHERE user_id=$1', [b.id])).rows[0].n).toBe(0);
  });

  it('LOGS: nenhum e-mail de destinatário (nem do remetente) em nenhuma linha de log', () => {
    const all = logs.join('\n'); expect(logs.length).toBeGreaterThan(20);
    expect(all).not.toContain(DOM); expect(all).not.toContain(a.email); expect(all).not.toMatch(/[A-Za-z0-9._%+-]+@destino/);
    expect(all).toContain('toHash'); // o driver de e-mail registrou só o hash
  });
});
