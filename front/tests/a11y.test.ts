import test from 'node:test';
import assert from 'node:assert/strict';
import { A11yClient, LocalRecordings, requestMedia, assertSigned, PrivacyRuleError, type Fetch } from '../src/services/a11y/a11yClient';

/** Módulo 11 — cliente com fetch falso (sem rede) e mídia falsa. */
const mk = (status = 201, body: unknown = {}) => { const calls: Array<{ url: string; init: any }> = []; let k = 0;
  const c = new A11yClient({ baseUrl: 'https://api.example/api/v1', token: () => 'jwt', newKey: () => `k${++k}`, fetch: async (u, i) => { calls.push({ url: u, init: i }); return { status, json: async () => body }; } }); return { c, calls }; };

test('câmera e microfone só com ação explícita da pessoa', async () => {
  let asked = 0; const md = { getUserMedia: async () => { asked++; return {}; } };
  await assert.rejects(requestMedia(md, { userAction: false }), PrivacyRuleError); assert.equal(asked, 0);
  await requestMedia(md, { userAction: true }); assert.equal(asked, 1);
  await assert.rejects(requestMedia(undefined, { userAction: true }), /media_unavailable/);
});
test('gravação fica no aparelho; sem opt-in não há nenhuma chamada de rede', async () => {
  const { c, calls } = mk(); const local = new LocalRecordings(); const r = local.save('s1', new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3]), 'video/webm');
  assert.deepEqual(r, { sessionId: 's1', size: 7, storedOn: 'device' });
  for (const o of [{ optIn: false }, { optIn: 'true' as any }, {} as any]) await assert.rejects(c.uploadRecording('s1', local, o), /upload_opt_in_required/);
  assert.equal(calls.length, 0);
  await c.uploadRecording('s1', local, { optIn: true }); assert.equal(calls.length, 1);
  assert.equal(calls[0]!.init.headers['x-upload-opt-in'], 'true'); assert.equal(calls[0]!.init.headers['content-type'], 'video/webm'); assert.match(calls[0]!.init.headers['idempotency-key'], /^a11y-k1$/);
  assert.equal(calls[0]!.url, 'https://api.example/api/v1/teleprompter/sessions/s1/recording');
  assert.equal(local.discard('s1'), true); await assert.rejects(c.uploadRecording('s1', local, { optIn: true }), /no_local_recording/);
});
test('exportação de transcrição precisa vir assinada', async () => {
  await assert.rejects(mk(201, { format: 'srt', signature: null }).c.exportTranscript('p1', 'srt'), /unsigned_export/);
  const ok = await mk(201, { format: 'srt', signature: 'v1.abc' }).c.exportTranscript('p1', 'srt'); assert.equal(ok.signature, 'v1.abc');
  assert.throws(() => assertSigned({ signature: 'sha1:abc' }), PrivacyRuleError);
});
test('audiodescrição: aprovação sempre explícita; legendas sem idioma não saem', async () => {
  const { c, calls } = mk(200); await c.approve('a1', [{ scene: 0, text: 'Bike na ciclovia' }]);
  assert.deepEqual(JSON.parse(calls[0]!.init.body), { approve: true, descriptions: [{ scene: 0, text: 'Bike na ciclovia' }] });
  await assert.rejects(c.captions('p1', []), /no_locale/); await c.captions('p1', ['pt-BR', 'en', 'pt-BR']); assert.deepEqual(JSON.parse(calls[1]!.init.body).locales, ['pt-BR', 'en']);
});
