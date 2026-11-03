import test from 'node:test';
import assert from 'node:assert/strict';
import { TranscriptClient, RateLimited, ConfirmationRequired, normalizeWordOps, previewWords, removedMs, type Fetch, type Word } from '../src/services/transcript/transcriptClient';

/** Módulo 9 — cliente de transcrição/agente com fetch falso (sem rede). */
const res = (status: number, body: unknown = {}, h: Record<string, string> = {}) => ({ status, headers: { get: (n: string) => h[n.toLowerCase()] ?? null }, json: async () => body });
const mk = (impl: Fetch) => { const calls: Array<{ url: string; init: any }> = []; let k = 0;
  const c = new TranscriptClient({ baseUrl: 'https://api.example/api/v1', token: () => 'jwt', fetch: async (u, i) => { calls.push({ url: u, init: i }); return impl(u, i); }, newKey: () => `k${++k}`, sleep: async () => undefined });
  return { c, calls }; };
const W: Word[] = 'eu gosto muito de café com leite'.split(' ').map((w, i) => ({ i, w, start: i * 500, end: i * 500 + 400, scene: 0 }));

test('POST leva Idempotency-Key; falha de rede reenvia a MESMA chave', async () => {
  let n = 0; const { c, calls } = mk(async () => { if (n++ === 0) throw new Error('network'); return res(202, { transcriptId: 't1', status: 'queued' }); });
  const r = await c.transcribe('p1'); assert.equal(r.transcriptId, 't1'); assert.equal(calls.length, 2);
  assert.equal(calls[0]!.init.headers['idempotency-key'], 'tr-k1'); assert.equal(calls[1]!.init.headers['idempotency-key'], 'tr-k1');
  assert.equal(calls[0]!.url, 'https://api.example/api/v1/projects/p1/transcript');
});
test('GET não leva Idempotency-Key; erro HTTP não é repetido', async () => {
  const { c, calls } = mk(async () => res(404, { code: 'transcript_not_found' }));
  await assert.rejects(c.get('p1'), (e: any) => e.status === 404 && e.code === 'transcript_not_found'); assert.equal(calls.length, 1); assert.equal(calls[0]!.init.headers['idempotency-key'], undefined);
});
test('429 vira RateLimited com retry-after', async () => {
  const { c } = mk(async () => res(429, { code: 'rate_limited' }, { 'retry-after': '1800' }));
  await assert.rejects(c.execute('p1', 'r1'), (e: any) => e instanceof RateLimited && e.retryAfterSec === 1800);
});
test('aplicar o agente sem confirmação não chama o servidor; com confirmação envia {confirm:true}', async () => {
  const { c, calls } = mk(async () => res(200, { applied: true }));
  await assert.rejects(c.applyRun('p1', 'r1', false), ConfirmationRequired); await assert.rejects(c.applyRun('p1', 'r1', 'yes' as any), ConfirmationRequired); assert.equal(calls.length, 0);
  await c.applyRun('p1', 'r1', true); assert.equal(calls.length, 1); assert.deepEqual(JSON.parse(calls[0]!.init.body), { confirm: true });
});
test('poll até a prévia ficar pronta', async () => {
  const st = ['queued', 'processing', 'previewed']; const { c, calls } = mk(async () => res(200, { status: st.shift() ?? 'previewed' }));
  const b = await c.waitEdit('p1', 'e1'); assert.equal(b.status, 'previewed'); assert.equal(calls.length, 3);
});
test('operações: junta apagamentos encostados, recusa sobreposição, prévia e tempo removido', () => {
  assert.deepEqual(normalizeWordOps([{ type: 'delete', fromWord: 3, toWord: 3 }, { type: 'delete', fromWord: 1, toWord: 2 }]), [{ type: 'delete', fromWord: 1, toWord: 3 }]);
  assert.throws(() => normalizeWordOps([{ type: 'delete', fromWord: 1, toWord: 3 }, { type: 'replace', fromWord: 2, toWord: 2, text: 'x' }]), /overlapping/);
  assert.throws(() => normalizeWordOps([{ type: 'delete', fromWord: 3, toWord: 1 }]), /invalid_range/);
  const p = previewWords(W, [{ type: 'delete', fromWord: 2, toWord: 2 }, { type: 'replace', fromWord: 4, toWord: 4, text: 'chá' }]);
  assert.deepEqual(p.map((x) => x.state), ['keep', 'keep', 'cut', 'keep', 'replaced', 'keep', 'keep']); assert.equal(p[4]!.replacement, 'chá');
  assert.equal(removedMs(W, [{ type: 'delete', fromWord: 2, toWord: 2 }]), 500);
});
test('o comando do agente é aparado a 500 caracteres', async () => {
  const { c, calls } = mk(async () => res(201, { runId: 'r1' })); await c.plan('p1', '  ' + 'a'.repeat(900));
  assert.equal(JSON.parse(calls[0]!.init.body).command.length, 500);
});
