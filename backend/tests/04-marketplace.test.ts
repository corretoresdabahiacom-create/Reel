import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { boot, shutdown, http, signup, auth, pool, uniq, type Session } from './helpers.js';

let creator: Session; let buyer: Session; let admin: Session; let tid: string;
beforeAll(async () => { await boot(false); creator = await signup(); buyer = await signup({ credits: 50 }); admin = await signup({ admin: true }); });
afterAll(() => shutdown());
const idem = () => uniq('idem-key');
const tpl = { name: 'Oferta Relâmpago', description: 'Template de 4 cenas', category: 'varejo', tags: ['oferta'], priceCredits: 10, sceneStructure: [{ durationSec: 5 }, { durationSec: 5 }, { durationSec: 5 }, { durationSec: 5 }], promptHints: ['preço em destaque'] };

describe('4. Marketplace: criar → aprovar → comprar com créditos → receita/comissão', () => {
  it('criador cria template (pending) — não aparece na listagem pública', async () => {
    const r = await http.post('/api/v1/templates').set(auth(creator)).send(tpl); expect(r.status).toBe(201); expect(r.body.status).toBe('pending'); tid = r.body.id;
    const pub = await http.get('/api/v1/templates'); expect(pub.body.items.find((t: { id: string }) => t.id === tid)).toBeUndefined(); expect((await http.get(`/api/v1/templates/${tid}`)).status).toBe(404);
    expect((await http.get(`/api/v1/templates/${tid}`).set(auth(creator))).status).toBe(200);
    expect((await http.post('/api/v1/templates').set(auth(creator)).send({ ...tpl, priceCredits: 9999 })).status).toBe(400); expect((await http.post('/api/v1/templates').set(auth(creator)).send({ ...tpl, name: 'ab' })).status).toBe(400);
  });
  it('apenas admin modera; aprovado fica público; scene_structure oculto até comprar', async () => {
    expect((await http.post(`/api/v1/admin/templates/${tid}/moderate`).set(auth(creator)).send({ approve: true })).status).toBe(403);
    const q = await http.get('/api/v1/admin/templates/pending').set(auth(admin)); expect(q.body.items.some((t: { id: string }) => t.id === tid)).toBe(true);
    expect((await http.post(`/api/v1/admin/templates/${tid}/moderate`).set(auth(admin)).send({ approve: true })).body.status).toBe('approved');
    const list = await http.get('/api/v1/templates').query({ search: 'Relâmpago' }); expect(list.body.items[0].id).toBe(tid);
    const det = await http.get(`/api/v1/templates/${tid}`).set(auth(buyer)); expect(det.body.owned).toBe(false); expect(det.body.sceneStructure).toBeUndefined();
    expect((await pool.query(`SELECT 1 FROM audit_logs WHERE action='template.approve' AND target_id=$1`, [tid])).rowCount).toBe(1);
  });
  it('compra com créditos: 80% criador / 20% taxa, idempotente, sem saldo = 402, próprio template = 409', async () => {
    const key = idem(); const p = await http.post(`/api/v1/templates/${tid}/purchase`).set(auth(buyer)).set('idempotency-key', key).send({}); expect(p.status).toBe(201); expect(p.body).toMatchObject({ purchased: true, priceCredits: 10, feeCredits: 2, creatorShareCredits: 8, creatorEarningsCents: 304 });
    const replay = await http.post(`/api/v1/templates/${tid}/purchase`).set(auth(buyer)).set('idempotency-key', key).send({}); expect(replay.status).toBe(201); expect(replay.headers['idempotent-replay']).toBe('true');
    const again = await http.post(`/api/v1/templates/${tid}/purchase`).set(auth(buyer)).set('idempotency-key', idem()).send({}); expect(again.body.alreadyOwned).toBe(true);
    expect((await pool.query('SELECT credits FROM users WHERE id=$1', [buyer.id])).rows[0].credits).toBe(40); // debitou uma única vez
    expect((await pool.query('SELECT marketplace_balance_cents b FROM users WHERE id=$1', [creator.id])).rows[0].b).toBe(304);
    expect((await http.post(`/api/v1/templates/${tid}/purchase`).set(auth(buyer))).status).toBe(400); // sem Idempotency-Key
    const poor = await signup({ credits: 3 }); expect((await http.post(`/api/v1/templates/${tid}/purchase`).set(auth(poor)).set('idempotency-key', idem()).send({})).status).toBe(402);
    expect((await http.post(`/api/v1/templates/${tid}/purchase`).set(auth(creator)).set('idempotency-key', idem()).send({})).status).toBe(409);
    const det = await http.get(`/api/v1/templates/${tid}`).set(auth(buyer)); expect(det.body.owned).toBe(true); expect(det.body.sceneStructure).toHaveLength(4);
  });
  it('compras concorrentes do mesmo template cobram uma vez só', async () => {
    const b2 = await signup({ credits: 30 }); const rs = await Promise.all(Array.from({ length: 5 }, () => http.post(`/api/v1/templates/${tid}/purchase`).set(auth(b2)).set('idempotency-key', idem()).send({})));
    expect(rs.filter((r) => r.status === 201 && !r.body.alreadyOwned).length).toBe(1); expect((await pool.query('SELECT credits FROM users WHERE id=$1', [b2.id])).rows[0].credits).toBe(20);
  });
  it('avaliação exige compra; média e contagem atualizam; receita do criador consolidada', async () => {
    const nob = await signup(); expect((await http.post(`/api/v1/templates/${tid}/reviews`).set(auth(nob)).send({ stars: 5 })).status).toBe(403);
    expect((await http.post(`/api/v1/templates/${tid}/reviews`).set(auth(buyer)).send({ stars: 4, comment: 'bom' })).status).toBe(200);
    const t = (await http.get(`/api/v1/templates/${tid}`)).body; expect(t.ratingCount).toBe(1); expect(t.ratingAvg).toBe(4); expect(t.usageCount).toBe(2);
    const rev = await http.get('/api/v1/templates/revenue').set(auth(creator)); expect(rev.body).toMatchObject({ sales: 2, earnedCredits: 16, earnedCents: 608, balanceCents: 608, platformFeePct: 20 });
  });
  it('projeto com template pago exige compra (402) e aceita após comprar', async () => {
    const u = await signup({ credits: 5 }); const r = await http.post('/api/v1/projects').set(auth(u)).send({ title: 'x', script: 'y', templateId: tid, photos: [] }); expect(r.status).toBe(402); expect(r.body.code).toBe('template_not_purchased');
    const ok = await http.post('/api/v1/projects').set(auth(buyer)).send({ title: 'x', script: 'y', templateId: tid, photos: [] }); expect(ok.status).toBe(201);
  });
  it('rejeição guarda motivo e edição volta para moderação; remoção é soft delete', async () => {
    const c = await http.post('/api/v1/templates').set(auth(creator)).send({ ...tpl, name: 'Para rejeitar', priceCredits: 0 });
    const rj = await http.post(`/api/v1/admin/templates/${c.body.id}/moderate`).set(auth(admin)).send({ approve: false, reason: 'Sem estrutura' }); expect(rj.body).toMatchObject({ status: 'rejected', rejectionReason: 'Sem estrutura' });
    const up = await http.patch(`/api/v1/templates/${c.body.id}`).set(auth(creator)).send({ name: 'Corrigido' }); expect(up.body.status).toBe('pending');
    expect((await http.delete(`/api/v1/templates/${c.body.id}`).set(auth(creator))).status).toBe(200); expect((await pool.query('SELECT deleted_at FROM templates WHERE id=$1', [c.body.id])).rows[0].deleted_at).not.toBeNull();
  });
});
