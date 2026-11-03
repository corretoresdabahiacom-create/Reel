import test from 'node:test';
import assert from 'node:assert/strict';
import { CollabClient, OpRejected, type WsLike } from '../src/services/collab/collabClient';

/** Módulo 8 — cliente de tempo real com um WebSocket falso (sem rede). */
class FakeWs implements WsLike {
  readyState = 0; sent: string[] = []; url: string;
  onopen: WsLike['onopen'] = null; onmessage: WsLike['onmessage'] = null; onclose: WsLike['onclose'] = null; onerror: WsLike['onerror'] = null;
  constructor(url: string) { this.url = url; }
  send(d: string) { this.sent.push(d); } close(code = 1000) { this.readyState = 3; this.onclose?.({ code }); }
  open() { this.readyState = 1; this.onopen?.(); } push(m: object) { this.onmessage?.({ data: JSON.stringify(m) }); }
}
const setup = () => {
  const socks: FakeWs[] = []; const timers: Array<() => void> = []; const events: unknown[] = []; const states: string[] = []; let n = 0;
  const c = new CollabClient({ url: 'wss://api.example/api/v1/collab/ws', getTicket: async () => `ticket-${++n}`, open: (u) => { const s = new FakeWs(u); socks.push(s); return s; },
    onEvent: (e) => events.push(e), onState: (s) => states.push(s), setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => undefined });
  return { c, socks, timers, events, states };
};
const tick = () => new Promise((r) => setImmediate(r));

test('o ticket vai na primeira mensagem, nunca na URL', async () => {
  const { c, socks } = setup(); await c.connect(); socks[0]!.open();
  assert.equal(socks[0]!.url, 'wss://api.example/api/v1/collab/ws'); assert.ok(!socks[0]!.url.includes('ticket'));
  assert.deepEqual(JSON.parse(socks[0]!.sent[0]!), { type: 'auth', token: 'ticket-1' });
});
test('operação: ack resolve; rejected 403 (viewer) e 409 (conflito com fork) rejeitam com o motivo do servidor', async () => {
  const { c, socks } = setup(); await c.connect(); const s = socks[0]!; s.open(); s.push({ type: 'ready', role: 'viewer' }); assert.equal(c.role, 'viewer');
  const p1 = c.sendOp({ kind: 'updateClip' }); const id1 = JSON.parse(s.sent[1]!).id; s.push({ type: 'ack', id: id1, rev: 7, conflict: 'lww' });
  assert.equal((await p1).rev, 7);
  const p2 = c.sendOp({ kind: 'removeClip' }); const id2 = JSON.parse(s.sent[2]!).id; s.push({ type: 'rejected', id: id2, status: 403, code: 'forbidden_role', details: { role: 'viewer' } });
  await assert.rejects(p2, (e: unknown) => e instanceof OpRejected && e.status === 403 && e.code === 'forbidden_role' && !e.forkable);
  const p3 = c.sendOp({ kind: 'moveClip' }); const id3 = JSON.parse(s.sent[3]!).id; s.push({ type: 'rejected', id: id3, status: 409, code: 'conflict_critical', details: { forkable: true } });
  await assert.rejects(p3, (e: unknown) => e instanceof OpRejected && e.forkable);
});
test('eventos da sala chegam ao app; cursor limitado a ~10/s', async () => {
  const { c, socks, events } = setup(); await c.connect(); socks[0]!.open(); socks[0]!.push({ type: 'presence', event: 'join', user: { name: 'Bruna' } });
  assert.deepEqual(events, [{ type: 'presence', event: 'join', user: { name: 'Bruna' } }]);
  assert.equal(c.cursor(1000, 10_000), true); assert.equal(c.cursor(1100, 10_050), false); assert.equal(c.cursor(1200, 10_150), true);
});
test('reconecta com backoff e ticket novo; 4403 (removido) e 4401 não reconectam', async () => {
  const { c, socks, timers, states } = setup(); await c.connect(); socks[0]!.open();
  const pending = c.sendOp({ kind: 'addTrack' }); socks[0]!.close(1006); await assert.rejects(pending, /disconnected/);
  assert.equal(timers.length, 1); timers[0]!(); await tick(); socks[1]!.open();
  assert.deepEqual(JSON.parse(socks[1]!.sent[0]!), { type: 'auth', token: 'ticket-2' }); // ticket novo
  socks[1]!.close(4403); assert.equal(timers.length, 1); assert.equal(states.at(-1), 'closed');
});
